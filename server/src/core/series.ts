// Series orchestration: friendly indicators with source fallback, raw series ids,
// and cross-source search.

import type { Citation, Ctx, IndicatorDef, Observation, SeriesResult } from "./types.ts";
import { ToolError } from "./types.ts";
import { resolveCountry, suggestCountries, type Country } from "./countries.ts";
import { getIndicatorDef, searchIndicatorDefs, INDICATORS } from "./indicators.ts";
import { applyTransform, filterPeriodRange, type Transform } from "./transforms.ts";
import { fetchWbSeries } from "../adapters/worldbank.ts";
import { fetchDbnomicsSeries, searchDbnomicsDatasets } from "../adapters/dbnomics.ts";
import { fetchFredSeries, fredAvailable } from "../adapters/fred.ts";
import { fetchDataMapperSeries, fetchDataMapperMetadata, computeBoundaryYear, parseEditionLabel } from "../adapters/datamapper.ts";
import { worldBankCitation, dbnomicsCitation, fredCitation, imfDataMapperCitation, sdmxCitation } from "./citations.ts";
import { fetchSdmxSeries, BIS_POLICY_RATE_AREAS } from "../adapters/sdmx.ts";
import { isTransientUpstreamError } from "./upstream.ts";
export { expectedWeoEdition } from "./weo-calendar.ts";
import { expectedWeoEdition } from "./weo-calendar.ts";

export interface SeriesOpts {
  start?: string;
  end?: string;
  transform?: Transform;
  /** Trim to the most recent N non-trailing-null observations (after transform). */
  limit?: number;
  /** Reproducibility mode: never substitute the fallback source when the primary
   * fails — surface the primary's error instead. Two calls to the same query can
   * otherwise return different values from different statistical sources when the
   * primary has a transient outage. */
  strictSource?: boolean;
}

export function requireCountry(input: string): Country {
  const c = resolveCountry(input);
  if (!c) {
    const suggestions = suggestCountries(input);
    throw new ToolError(
      `Could not resolve country '${input}'. Use an ISO3 code (e.g. USA, BRB, DEU) or a standard English name.` +
        (suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""),
      { input, suggestions },
    );
  }
  return c;
}

function finishSeries(result: SeriesResult, opts: SeriesOpts): SeriesResult {
  let obs = filterPeriodRange(result.observations, opts.start, opts.end);
  const transform = opts.transform ?? "none";
  const hadValuesBeforeTransform = obs.some((o) => o.value != null);
  if (transform !== "none") {
    const t = applyTransform(obs, transform, { frequency: result.frequency });
    obs = t.observations;
    if (t.note) result.notes.push(t.note);
  }
  // Drop leading/trailing all-null runs for readability, keep interior nulls.
  let a = 0;
  let b = obs.length;
  while (a < b && obs[a].value == null) a++;
  while (b > a && obs[b - 1].value == null) b--;
  obs = obs.slice(a, b);
  if (opts.limit === 1) {
    // "Latest" semantics: prefer the most recent published outturn over a
    // projection (e.g. IMF WEO forward years); fall back to any latest value.
    const nonNull = obs.filter((o) => o.value != null);
    const outturns = nonNull.filter((o) => !/projection/i.test(o.note ?? ""));
    if (outturns.length && nonNull.length > outturns.length) {
      // Deliberately NOT "latest published outturn": the IMF's true latest-actual
      // year varies by country/series and the boundary here is a heuristic, so
      // this value may itself be a staff estimate (design D11).
      result.notes.push("Latest value not marked as a projection shown; later IMF estimate/projection periods exist for this series.");
    }
    obs = (outturns.length ? outturns : nonNull).slice(-1);
  } else if (opts.limit && opts.limit > 0 && obs.length > opts.limit) {
    obs = obs.slice(-opts.limit);
  }
  if (obs.length === 0) {
    if (transform !== "none" && hadValuesBeforeTransform) {
      throw new ToolError(
        `The '${transform}' transform produced no observations for ${result.series_id}${result.country ? ` (${result.country.name})` : ""}: the series has data in the requested window, but not enough prior-period observations to compute changes. Try widening start_year to include earlier periods, or drop the transform.`,
        { series_id: result.series_id, transform },
      );
    }
    // Honest absence, machine-readably (GROWTH-PLAN Phase 1): distinguish
    // "the source publishes nothing for this series/country at all" from
    // "data exists but your window missed it" — and in the second case say
    // exactly where the data lives so an agent can retry correctly instead
    // of concluding the value does not exist.
    const allValued = result.observations.filter((o) => o.value != null);
    if (allValued.length === 0) {
      throw new ToolError(
        `${result.name ?? result.series_id} has no published values for ${result.country ? result.country.name : "this query"} at the source. This is a statement about what the source publishes, not a data error — some economies are not covered by this series.`,
        { series_id: result.series_id, no_published_data: true },
      );
    }
    const availStart = allValued[0].period;
    const availEnd = allValued[allValued.length - 1].period;
    throw new ToolError(
      `No observations available for ${result.series_id}${result.country ? ` (${result.country.name})` : ""} in the requested window` +
        (opts.start || opts.end ? ` ${opts.start ?? "…"}–${opts.end ?? "…"}` : "") +
        `. Published data exists for ${availStart}–${availEnd} — adjust the year range.`,
      { series_id: result.series_id, no_published_data: false, available_range: { start: availStart, end: availEnd } },
    );
  }
  result.observations = obs;
  return result;
}

/** Flag likely IMF projections (periods at/after the vintage/boundary year) for
 * both channels this server speaks: DBnomics-served WEO ("WEO:YYYY[-MM]", where
 * the embedded year IS the boundary) and DataMapper-served WEO/FM (where the
 * caller passes a synthesized "WEO:YYYY"/"FM:YYYY" tag whose year is the
 * *payload-anchored* boundary computed by computeBoundaryYear, decoupled from
 * the edition string — see design D3/D4). */
function weoProjectionNote(vintageTag: string, observations: { period: string }[]): string | undefined {
  const m = vintageTag.match(/^(WEO|FM):(\d{4})/);
  if (!m) return undefined;
  const kind = m[1] === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";
  const vintage = parseInt(m[2], 10);
  const hasFuture = observations.some((o) => parseInt(o.period.slice(0, 4), 10) >= vintage);
  return hasFuture
    ? `Values for ${vintage} onward are ${kind} estimates/projections from the ${vintageTag.replace(/^(WEO|FM):/, "")} vintage, not final outturns. This boundary is a vintage-year heuristic: the IMF's "latest actual" year varies by country and series, so some observations before ${vintage} may also be IMF staff estimates rather than final outturns.`
    : undefined;
}

/** Stale-vintage disclosure when the resolved edition lags the IMF's release
 * calendar. `channel` selects the wording — the DBnomics path lags because the
 * aggregator hasn't ingested the newest WEO; the DataMapper path (when it lags,
 * which should be rare/brief) lags because the IMF's own site hasn't loaded it
 * yet, and blaming DBnomics there would be false (design D11/F7). */
export function weoVintageStaleNote(
  datasetCode: string,
  now: Date = new Date(),
  channel: "dbnomics" | "datamapper" = "dbnomics",
): string | undefined {
  const m = datasetCode.match(/(WEO|FM):(\d{4}-\d{2})/);
  if (!m) return undefined;
  const kind = m[1] === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";
  const resolved = m[2];
  const expected = expectedWeoEdition(now);
  if (resolved >= expected) return undefined;
  if (channel === "datamapper") {
    return `${kind} vintage ${resolved} is the edition currently served via the IMF DataMapper API; the IMF has likely published a newer release (expected ${expected}) that the DataMapper API has not yet loaded. Values, estimates, and projections reflect the ${resolved} vintage, not necessarily the IMF's current release.`;
  }
  return `IMF WEO vintage ${resolved} is the newest edition available via DBnomics (this server's IMF data path); the IMF has likely published a newer WEO release (expected ${expected}) that DBnomics has not yet ingested. Values, estimates, and projections reflect the ${resolved} vintage, not necessarily the IMF's current release.`;
}

/** Mark per-observation projection notes. See weoProjectionNote for the tag format. */
function markWeoProjections(vintageTag: string, observations: Observation[]): void {
  const m = vintageTag.match(/^(WEO|FM):(\d{4})/);
  if (!m) return;
  const kind = m[1] === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";
  const vintage = parseInt(m[2], 10);
  for (const o of observations) {
    if (parseInt(o.period.slice(0, 4), 10) >= vintage) o.note = `${kind} estimate/projection`;
  }
}

async function indicatorFromWb(ctx: Ctx, def: IndicatorDef, country: Country, opts: SeriesOpts): Promise<SeriesResult> {
  const wb = await fetchWbSeries(country.iso3, def.wb!);
  const citation = worldBankCitation(ctx, {
    indicatorId: wb.indicatorId,
    indicatorName: wb.indicatorName,
    iso3: wb.countryIso3,
    apiUrl: wb.apiUrl,
    lastUpdated: wb.lastUpdated,
  });
  const result: SeriesResult = {
    series_id: `worldbank/${wb.indicatorId}`,
    name: wb.indicatorName,
    country: { iso3: wb.countryIso3, name: wb.countryName },
    unit: def.unit,
    frequency: "annual",
    observations: wb.observations,
    citation,
    notes: def.notes ? [def.notes] : [],
  };
  return finishSeries(result, opts);
}

export async function indicatorFromDbnomics(ctx: Ctx, def: IndicatorDef, country: Country, opts: SeriesOpts): Promise<SeriesResult> {
  const [provider, dataset, template] = def.dbnomics!;
  const code = template.replace("{ISO3}", country.iso3);
  const s = await fetchDbnomicsSeries(provider, dataset, code);
  const citation = dbnomicsCitation(ctx, {
    providerName: s.providerName,
    providerCode: s.providerCode,
    datasetCode: s.datasetCode,
    datasetName: s.datasetName,
    seriesCode: s.seriesCode,
    seriesName: s.seriesName,
    apiUrl: s.apiUrl,
  });
  const notes = def.notes ? [def.notes] : [];
  const projNote = weoProjectionNote(s.datasetCode, s.observations);
  if (projNote) notes.push(projNote);
  const staleNote = weoVintageStaleNote(s.datasetCode);
  if (staleNote) notes.push(staleNote);
  markWeoProjections(s.datasetCode, s.observations);
  const result: SeriesResult = {
    series_id: `dbnomics/${s.providerCode}/${s.datasetCode}/${s.seriesCode}`,
    name: s.seriesName,
    country: { iso3: country.iso3, name: country.name },
    unit: def.unit,
    frequency: s.frequency ?? "annual",
    observations: s.observations,
    citation,
    notes,
  };
  return finishSeries(result, opts);
}

/** Reference codes used only to cross-check whether the WEO and Fiscal Monitor
 * databases are currently at the same edition (design D11) — both are always
 * present in the metadata table regardless of which code triggered this call,
 * so the check costs zero extra subrequests. */
const REF_WEO_CODE = "NGDP_RPCH";
const REF_FM_CODE = "GGR_G01_GDP_PT";

function crossEditionMismatchNote(
  metaTable: Awaited<ReturnType<typeof fetchDataMapperMetadata>>,
  dataset: "WEO" | "FM",
  thisEdition: { label: string; year?: number; month?: number } | undefined,
): string | undefined {
  if (!metaTable || !thisEdition?.year || !thisEdition?.month) return undefined;
  const refCode = dataset === "FM" ? REF_WEO_CODE : REF_FM_CODE;
  const refKind = dataset === "FM" ? "WEO" : "Fiscal Monitor";
  const other = metaTable[refCode];
  if (!other) return undefined;
  const otherEd = parseEditionLabel(other.source);
  if (!otherEd || (otherEd.year === thisEdition.year && otherEd.month === thisEdition.month)) return undefined;
  return `The IMF's ${refKind} database is currently at a different edition (${other.source}) than this series' edition (${thisEdition.label}) — fiscal indicators drawn from the two databases (e.g. revenue/expenditure vs. debt/balance) may temporarily reflect different releases.`;
}

async function indicatorFromDataMapper(ctx: Ctx, def: IndicatorDef, country: Country, opts: SeriesOpts): Promise<SeriesResult> {
  const [code, dataset] = def.datamapper!;
  const now = ctx.now ? ctx.now() : new Date();
  const s = await fetchDataMapperSeries(ctx, code, dataset, country.iso3, now);
  const { boundaryYear, clamped } = computeBoundaryYear(s.horizonYear, now, s.edition?.year);
  const kind = dataset === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";

  const notes: string[] = def.notes ? [def.notes] : [];

  let editionLabel: string;
  if (s.edition?.year && s.edition?.month) {
    editionLabel = s.edition.label; // verbatim IMF string — never rephrase (design D2)
  } else {
    editionLabel = `${boundaryYear} vintage (April or October edition — edition metadata unavailable; a newer edition may exist)`;
    notes.push(
      "The IMF DataMapper edition-metadata endpoint was unavailable, or does not list this series; only the vintage year could be inferred from the data's own projection horizon, not the edition month.",
    );
  }

  // Sentinels (design D11) — all payload/metadata-derived, no extra subrequests.
  if (s.edition?.year && s.edition?.month) {
    const editionTag = `${dataset}:${s.edition.year}-${String(s.edition.month).padStart(2, "0")}`;
    const staleNote = weoVintageStaleNote(editionTag, now, "datamapper");
    if (staleNote) notes.push(staleNote);
    const gap = s.horizonYear - s.edition.year;
    if (gap !== 5) {
      notes.push(
        `This series' data horizon (through ${s.horizonYear}) is ${Math.abs(gap - 5)} year(s) off the usual edition-year-plus-5 pattern for the ${editionLabel} edition — the values and edition-label fetches may reflect slightly different load moments. The projection boundary used here (${boundaryYear}) is derived from the data's own horizon, not the label, so this does not affect which values are flagged as projections.`,
      );
    }
    if (s.edition.lastModified) {
      const lm = new Date(s.edition.lastModified.replace(" ", "T") + "Z");
      const editionLoadMs = Date.UTC(s.edition.year, s.edition.month - 1, 1);
      if (!Number.isNaN(lm.getTime())) {
        const daysSince = (lm.getTime() - editionLoadMs) / (24 * 3600 * 1000);
        if (daysSince > 40) {
          notes.push(
            `The IMF reloaded this series' data on ${s.edition.lastModified.slice(0, 10)}, ${Math.round(daysSince)} day(s) after the ${editionLabel} release — values may include a post-release revision (e.g. a WEO Update) not contained in the originally-published ${editionLabel} database.`,
          );
        }
      }
    }
  }
  if (clamped) {
    notes.push(
      s.edition?.year != null
        ? `The data horizon implied a projection-boundary year that looked implausible against the IMF's release calendar, so it was clamped to ${boundaryYear} (the older of the payload's own edition year and the calendar-expected edition year) — consistent with the DataMapper serving a stale edition, or a truncated/mid-load payload.`
        : `The data horizon implied a projection-boundary year that looked implausible against the IMF's release calendar, so the calendar year (${boundaryYear}) was used instead — possible if this payload is truncated or mid-load.`,
    );
  }
  if (DB_PRIMARY.has(def.key)) {
    const metaTable = await fetchDataMapperMetadata(ctx);
    const mismatch = crossEditionMismatchNote(metaTable, dataset, s.edition);
    if (mismatch) notes.push(mismatch);
  }
  if (dataset === "WEO") {
    notes.push(
      "IMF DataMapper serves WEO-database values rounded to one decimal place (Fiscal Monitor-sourced fiscal series are full precision); derived transforms (e.g. year-over-year change) computed from these values can carry up to ±0.1 of additional rounding error.",
    );
  }

  // Unconditional heuristic caveat (design D11): fires even when this country's
  // own series never reaches the boundary year (e.g. a series ending in 2010) —
  // silence there previously let a decade-old terminal value pass unqualified
  // as a confirmed outturn.
  const countryMaxYear = s.observations.reduce(
    (m, o) => (o.value != null ? Math.max(m, parseInt(o.period, 10) || 0) : m),
    0,
  );
  const base = `Values for ${boundaryYear} onward are ${kind} estimates/projections, not final outturns. This boundary is a vintage-year heuristic derived from the data's own projection horizon: the IMF's "latest actual" year varies by country and series, so some observations before ${boundaryYear} may also be IMF staff estimates rather than final outturns.`;
  notes.push(
    countryMaxYear > 0 && countryMaxYear < boundaryYear
      ? `${base} The IMF publishes no current-edition projections for ${country.name} on this series; it ends at ${countryMaxYear} — treat recent values as unconfirmed estimates, not the IMF's current assessment.`
      : base,
  );

  const observations = s.observations.map((o) => ({ ...o }));
  for (const o of observations) {
    const y = parseInt(o.period.slice(0, 4), 10);
    if (Number.isFinite(y) && y >= boundaryYear) o.note = `${kind} estimate/projection`;
  }

  const citation = imfDataMapperCitation(ctx, {
    code: s.code,
    dataset,
    seriesName: def.label,
    editionLabel,
    sourceUrl: s.humanUrl,
    apiUrl: s.valuesApiUrl,
    lastModified: s.edition?.lastModified,
  });

  const result: SeriesResult = {
    series_id: `imf/${s.code}`,
    name: def.label,
    country: { iso3: country.iso3, name: country.name },
    unit: def.unit,
    frequency: "annual",
    observations,
    citation,
    notes,
  };
  return finishSeries(result, opts);
}

async function indicatorFromFred(ctx: Ctx, def: IndicatorDef, opts: SeriesOpts): Promise<SeriesResult> {
  const s = await fetchFredSeries(ctx, def.fred!, { start: opts.start, end: opts.end });
  const citation = fredCitation(ctx, { seriesId: s.seriesId, seriesName: s.seriesName, units: s.units, apiUrl: s.apiUrl });
  const result: SeriesResult = {
    series_id: `fred/${s.seriesId}`,
    name: s.seriesName,
    country: { iso3: "USA", name: "United States" },
    unit: s.units ?? def.unit,
    frequency: s.frequency?.toLowerCase(),
    observations: s.observations,
    citation,
    notes: def.notes ? [def.notes] : [],
  };
  return finishSeries(result, opts);
}

/**
 * Get a registry indicator for a country, using the definition's source order
 * (wb → dbnomics fallback, or dbnomics-primary where defined that way).
 */
async function indicatorFromSdmx(ctx: Ctx, def: IndicatorDef, country: Country, opts: SeriesOpts): Promise<SeriesResult> {
  const cfg = def.sdmx!;
  // {ISO2} keys are per-country; a key without the placeholder is a fixed
  // single-series flow (euro-area aggregates), which only answers for the
  // economy it actually covers rather than silently serving it for any input.
  const perCountry = cfg.key.includes("{ISO2}");
  if (!perCountry && country.iso3 !== "EMU" && country.iso3 !== "XM") {
    throw new ToolError(
      `'${def.key}' is a euro-area aggregate series and is only published for the euro area — request it with country="euro area".`,
      { indicator: def.key, country: country.iso3 },
    );
  }
  // Resolve the provider's own area code from an explicit allowlist — never
  // by assuming it equals the country's ISO2 (see BIS_POLICY_RATE_AREAS).
  let areaCode: string | undefined;
  if (perCountry) {
    areaCode = cfg.provider === "BIS" ? BIS_POLICY_RATE_AREAS[country.iso3] : country.iso2;
    if (!areaCode) {
      throw new ToolError(
        `${cfg.provider} does not publish ${def.label} for ${country.name}. This is a coverage fact at the source, not a lookup failure — the BIS compiles policy rates for ${Object.keys(BIS_POLICY_RATE_AREAS).length} economies.`,
        { indicator: def.key, country: country.iso3, no_published_data: true },
      );
    }
  }
  const key = cfg.key.replace("{ISO2}", areaCode ?? "");
  const s = await fetchSdmxSeries(cfg.provider, cfg.flow, key, { now: ctx.now ? ctx.now() : undefined });
  if (s.observations.length === 0) {
    throw new ToolError(
      `${cfg.provider} publishes no ${def.label} series for ${country.name}. This is a coverage fact at the source, not a lookup failure.`,
      { indicator: def.key, country: country.iso3, no_published_data: true },
    );
  }
  const notes: string[] = [];
  if (s.stalenessNote) notes.push(s.stalenessNote);
  return finishSeries(
    {
      series_id: `${cfg.provider.toLowerCase()}/${cfg.flow}/${key}`,
      name: def.label,
      country: { iso3: country.iso3, name: country.name },
      unit: def.unit,
      frequency: key.startsWith("D.") ? "daily" : key.startsWith("M.") ? "monthly" : undefined,
      observations: s.observations,
      citation: sdmxCitation(ctx, {
        provider: cfg.provider,
        flow: cfg.flow,
        key,
        seriesName: s.name ? `${s.name} — ${country.name}` : `${def.label} — ${country.name}`,
        sourceUrl: cfg.sourceUrl,
        apiUrl: s.apiUrl,
      }),
      notes,
    },
    opts,
  );
}

/** Ordered per-source runners for a registry indicator — the ONE place source
 * precedence is encoded (extracted from getIndicator so compare_sources shares
 * it instead of re-deriving the chain). dbnomics-primary defs list dbnomics
 * before wb; wherever "IMF WEO (via DBnomics)" sits, the IMF DataMapper API
 * (current-vintage) is inserted immediately ahead of it (design D1) —
 * DataMapper and DBnomics are both "the IMF path", just at different
 * currency/reproducibility trade-offs. */
function buildSourceAttempts(
  ctx: Ctx,
  def: IndicatorDef,
  country: Country,
  opts: SeriesOpts,
): Array<{ label: string; run: () => Promise<SeriesResult> }> {
  const preferDbnomics = def.dbnomics && (!def.wb || DB_PRIMARY.has(def.key));
  const attempts: Array<{ label: string; run: () => Promise<SeriesResult> }> = [];
  // SDMX-sourced indicators (BIS policy rates, ECB monetary series) have no
  // World Bank/IMF equivalent — they are single-source by construction.
  if (def.sdmx) {
    attempts.push({
      label: def.sdmx.provider === "BIS" ? "BIS statistics" : "ECB Data Portal",
      run: () => indicatorFromSdmx(ctx, def, country, opts),
    });
    return attempts;
  }
  const pushImfChain = () => {
    if (def.datamapper) {
      attempts.push({ label: "IMF DataMapper API", run: () => indicatorFromDataMapper(ctx, def, country, opts) });
    }
    if (def.dbnomics) {
      attempts.push({ label: "IMF WEO (via DBnomics)", run: () => indicatorFromDbnomics(ctx, def, country, opts) });
    }
  };
  if (preferDbnomics) {
    pushImfChain();
    if (def.wb) attempts.push({ label: "World Bank WDI", run: () => indicatorFromWb(ctx, def, country, opts) });
  } else {
    if (def.wb) attempts.push({ label: "World Bank WDI", run: () => indicatorFromWb(ctx, def, country, opts) });
    pushImfChain();
  }
  if (def.fred && country.iso3 === "USA" && fredAvailable(ctx) && attempts.length === 0) {
    attempts.push({ label: "FRED", run: () => indicatorFromFred(ctx, def, opts) });
  }
  return attempts;
}

export async function getIndicator(ctx: Ctx, key: string, countryInput: string, opts: SeriesOpts = {}): Promise<SeriesResult> {
  const def = getIndicatorDef(key);
  if (!def) {
    const near = searchIndicatorDefs(key, 5).map((m) => m.def.key);
    throw new ToolError(
      `Unknown indicator '${key}'.` +
        (near.length ? ` Closest matches: ${near.join(", ")}.` : "") +
        " Use search_indicators to browse the registry, or pass an explicit series id like 'worldbank/NY.GDP.MKTP.KD.ZG'.",
      { input: key, suggestions: near },
    );
  }
  const country = requireCountry(countryInput);

  // FRED-only indicators (US high-frequency)
  if (!def.wb && !def.dbnomics && def.fred) {
    if (country.iso3 !== "USA") {
      throw new ToolError(`Indicator '${def.key}' is a US-specific series (FRED ${def.fred}).`, { indicator: def.key });
    }
    return indicatorFromFred(ctx, def, opts);
  }

  const attempts = buildSourceAttempts(ctx, def, country, opts);

  // Reproducibility mode: only the primary source is ever consulted.
  const tried = opts.strictSource ? attempts.slice(0, 1) : attempts;

  const errors: string[] = [];
  let absenceDetails: Record<string, unknown> | undefined;
  let firstErrorWasTransient = false;
  // A same-query-different-answer risk exists if ANY skipped source failed
  // transiently — e.g. primary permanently lacks the country but the secondary
  // only blipped: the secondary may recover and change which source serves.
  let anyErrorWasTransient = false;
  for (let i = 0; i < tried.length; i++) {
    try {
      const result = await tried[i].run();
      if (i > 0) {
        result.fallback_used = true;
        result.fallback_reason = anyErrorWasTransient ? "transient" : "definitive";
        const primaryLabel = tried[0].label;
        const servedLabel = tried[i].label;
        // Two distinct classes of fallback, disclosed differently: a transient
        // upstream failure (retries already exhausted in fetchJson) can recur on
        // a later call to the SAME query and get the primary source back — and
        // because the primary and fallback here are different statistical
        // sources (e.g. World Bank WDI vs IMF WEO), that isn't just a slower
        // path to the same number, it can be a materially different value for
        // the same nominal indicator. A hard failure (series/country genuinely
        // absent from the primary) doesn't carry that same-query-different-answer
        // risk, so it gets the plainer note it always had.
        // The note must agree with fallback_reason (which is keyed off ANY
        // transient failure, not just the primary's): a payload carrying
        // fallback_reason "transient" alongside a "primary does not have this"
        // note is self-contradictory. Three cases, one truth each.
        result.notes.push(
          firstErrorWasTransient
            ? `${primaryLabel} was transiently unavailable for this request; served from ${servedLabel} instead, which may use a different statistical definition and can report a different value for the same nominal indicator. If exact consistency with ${primaryLabel} matters, retry this query — the primary source may have recovered. (${errors[0]})`
            : anyErrorWasTransient
              ? `${primaryLabel} does not have this indicator/country/period, and an intermediate fallback source was transiently unavailable; served from ${servedLabel} instead. A skipped source may recover, so the serving source for this query can change on retry. (${errors[0]})`
              : `${primaryLabel} does not have this indicator/country/period; served from ${servedLabel} instead. (${errors[0]})`,
        );
      }
      return result;
    } catch (e) {
      const transient = isTransientUpstreamError(e);
      if (i === 0) firstErrorWasTransient = transient;
      if (transient) anyErrorWasTransient = true;
      errors.push(e instanceof Error ? e.message : String(e));
      // Preserve the structured honest-absence details through the fallback
      // loop: when every source ends up failing, the combined error should
      // still tell an agent machine-readably whether data exists elsewhere in
      // time (available_range) or not at all (no_published_data) — the first
      // attempt's verdict is the primary source's, which is the one to report.
      if (e instanceof ToolError && e.details && typeof e.details === "object" && "no_published_data" in (e.details as Record<string, unknown>)) {
        if (!absenceDetails) absenceDetails = e.details as Record<string, unknown>;
      }
    }
  }
  if (opts.strictSource && attempts.length > tried.length) {
    throw new ToolError(
      `Could not retrieve '${def.key}' for ${country.name} from its primary source (${tried[0].label}): ${errors.join(" | ")}. ` +
        `strict_source=true prevented fallback to ${attempts[1].label}` +
        (firstErrorWasTransient ? "; the failure looks transient — retrying this query may succeed, or drop strict_source to accept the fallback source" : "") +
        ".",
      { indicator: def.key, country: country.iso3, strict_source: true },
    );
  }
  throw new ToolError(
    `Could not retrieve '${def.key}' for ${country.name}: ${errors.join(" | ")}`,
    { indicator: def.key, country: country.iso3, ...(absenceDetails ?? {}) },
  );
}

/** Registry keys with a dated IMF WEO/Fiscal Monitor DBnomics definition — the
 * only ones `getIndicatorAsOf` can pin to a historical vintage. */
export function asOfCapableIndicators(): string[] {
  return INDICATORS.filter((d) => d.dbnomics).map((d) => d.key);
}

/** How an as_of vintage bypass relates to the indicator's normal serving chain —
 * returned alongside the pinned result so the verifier can DISCLOSE (not hide)
 * that historical verification may judge against a different statistical source
 * than the live path would have served. */
export interface AsOfSourceInfo {
  /** What this feature actually verifies against. Constant today: the IMF WEO
   * historical archive is the only dated-vintage source this server has. */
  verification_scope: "imf_weo_historical_vintage";
  /** The source the LIVE (non-as_of) path serves this indicator from first. */
  normal_primary_source: string;
  /** The source the as_of path actually used. */
  historical_source: string;
  /** True when those differ by statistical source or database — a claim
   * originally made from the normal primary can legitimately differ from the
   * WEO edition by methodology, not just by revision. */
  source_changed_for_as_of: boolean;
}

/**
 * Fetch a registry indicator pinned to a dated IMF WEO edition — historical
 * IMF-VINTAGE verification, not general "truth at the time" verification.
 * Two honesty bounds, both disclosed to the caller:
 *
 * 1. RESOLUTION IS A CONSERVATIVE MONTH CALENDAR, not the IMF's actual release
 *    days. expectedWeoEdition flips editions on May 1 / Nov 1, but the IMF
 *    publishes in early-to-mid April and October (April 2019 WEO: released
 *    9 April 2019, verified) — so an as_of date late in a release month
 *    resolves to the PREVIOUS edition even when the new one already existed.
 *    Conservative is the right default (never claims an edition existed when
 *    it might not have), but it must be labeled as month-precision, and dates
 *    inside a release month get an explicit note with the exact-pinning escape
 *    hatch (get_series with a dated dbnomics/IMF/WEO:YYYY-MM id).
 *
 * 2. THE SOURCE MAY CHANGE. The live chain serves e.g. gdp_growth from World
 *    Bank WDI first; only the IMF WEO archive has dated vintages, so as_of
 *    always verifies against WEO. For govt_revenue/expenditure the live
 *    primary is even a different IMF database (Fiscal Monitor) than the WEO
 *    codes the archive carries. AsOfSourceInfo carries this to the response.
 *
 * DBnomics carries dated WEO editions back to at least 2010-04 (verified
 * live). Bypasses the normal WB/DataMapper fallback chain entirely — there is
 * no sensible fallback for "the archive as it stood", only the one dated
 * source that has it.
 */
/** Fetch a registry indicator pinned to one dated IMF WEO edition via
 * DBnomics. Shared by getIndicatorAsOf (edition resolved from a date) and the
 * verify-time revision probe (edition = previous on the calendar). Throws a
 * ToolError naming the edition when that vintage is not retrievable. */
export async function getIndicatorAtEdition(
  ctx: Ctx,
  def: IndicatorDef,
  country: Country,
  edition: string,
  opts: SeriesOpts = {},
): Promise<SeriesResult> {
  if (!def.dbnomics) {
    throw new ToolError(`'${def.key}' has no dated IMF WEO source; editions cannot be pinned.`, { indicator: def.key });
  }
  const [provider, datasetTemplate, codeTemplate] = def.dbnomics;
  const dataset = datasetTemplate.replace(/:latest$/, `:${edition}`);
  const pinnedDef: IndicatorDef = { ...def, dbnomics: [provider, dataset, codeTemplate] };
  try {
    return await indicatorFromDbnomics(ctx, pinnedDef, country, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ToolError(
      `Could not retrieve the ${dataset} vintage of '${def.key}' for ${country.name}: ${msg} ` +
        `DBnomics's dated WEO editions have been confirmed to exist back to 2010-04; a date far outside that range, or a future date past the current edition, may not have a matching edition ingested.`,
      { indicator: def.key, country: country.iso3, edition },
    );
  }
}

export async function getIndicatorAsOf(
  ctx: Ctx,
  key: string,
  countryInput: string,
  asOfDate: Date,
  opts: SeriesOpts = {},
): Promise<{ result: SeriesResult; edition: string; sourceInfo: AsOfSourceInfo }> {
  const def = getIndicatorDef(key);
  if (!def) {
    const near = searchIndicatorDefs(key, 5).map((m) => m.def.key);
    throw new ToolError(
      `Unknown indicator '${key}'.` + (near.length ? ` Closest matches: ${near.join(", ")}.` : ""),
      { input: key, suggestions: near },
    );
  }
  if (!def.dbnomics) {
    throw new ToolError(
      `'as_of' is only supported for indicators with a dated IMF WEO edition: ${asOfCapableIndicators().join(", ")}. ` +
        `'${key}' has no dated-vintage source (World Bank does not expose historical editions here).`,
      { indicator: key },
    );
  }
  const country = requireCountry(countryInput);
  const edition = expectedWeoEdition(asOfDate);
  const result = await getIndicatorAtEdition(ctx, def, country, edition, opts);

  const isFmPrimary = key === "govt_revenue_gdp" || key === "govt_expenditure_gdp";
  const wbPrimary = Boolean(def.wb) && !DB_PRIMARY.has(key);
  const sourceInfo: AsOfSourceInfo = {
    verification_scope: "imf_weo_historical_vintage",
    normal_primary_source: wbPrimary
      ? "World Bank WDI"
      : isFmPrimary
        ? "IMF Fiscal Monitor (via the DataMapper API)"
        : "IMF WEO (via the DataMapper API)",
    historical_source: `IMF WEO ${edition} dated edition (via DBnomics)`,
    source_changed_for_as_of: wbPrimary || isFmPrimary,
  };

  const dateStr = asOfDate.toISOString().slice(0, 10);
  result.notes.push(
    `Pinned to the WEO:${edition} vintage, resolved conservatively from ${dateStr} using the IMF's April/October publication calendar (month precision — this is historical IMF-vintage verification, not exact release-date resolution). The value reflects that edition and may differ from both earlier vintages and the currently published figure.`,
  );
  const month = asOfDate.getUTCMonth() + 1;
  if (month === 4 || month === 10) {
    const inMonthEdition = `${asOfDate.getUTCFullYear()}-${month === 4 ? "04" : "10"}`;
    result.notes.push(
      `The IMF typically publishes the ${month === 4 ? "April" : "October"} WEO edition during that month, so the ${inMonthEdition} edition may already have been available on ${dateStr}; this resolver conservatively selects the previous edition for dates inside a release month. To verify against ${inMonthEdition} explicitly, use get_series with 'dbnomics/IMF/WEO:${inMonthEdition}/…' or an as_of date in the following month.`,
    );
  }
  if (sourceInfo.source_changed_for_as_of) {
    result.notes.push(
      `Source note: this indicator's live primary source is ${sourceInfo.normal_primary_source}, but only the IMF WEO archive carries dated historical editions, so this verdict is against ${sourceInfo.historical_source}. A claim originally based on ${sourceInfo.normal_primary_source} can legitimately differ from the WEO edition for methodological reasons, not only because of revisions.`,
    );
  }
  return { result, edition, sourceInfo };
}

const DB_PRIMARY = new Set(["govt_debt_gdp", "fiscal_balance_gdp", "govt_revenue_gdp", "govt_expenditure_gdp"]);

/** True when World Bank WDI is the PRIMARY source for this def — the only case
 * where a data.worldbank.org link matches the data actually served. The search
 * url builders previously linked WB unconditionally, which for IMF-primary keys
 * (e.g. govt_debt_gdp) sent users to the central-government debt page while the
 * served values are IMF general-government — a different statistical concept. */
export function wbIsPrimarySource(def: IndicatorDef): boolean {
  return Boolean(def.wb) && !(def.dbnomics && DB_PRIMARY.has(def.key));
}

/** Reverse lookup for the `imf/{CODE}` explicit series id (design D9). */
const DM_CODE_INFO = new Map<string, { dataset: "WEO" | "FM"; def: IndicatorDef }>();
for (const d of INDICATORS) {
  if (d.datamapper) DM_CODE_INFO.set(d.datamapper[0], { dataset: d.datamapper[1], def: d });
}

/** Get a raw series by explicit id: worldbank/CODE, fred/ID, dbnomics/PROVIDER/DATASET/SERIES, or a registry key. */
export async function getSeries(
  ctx: Ctx,
  seriesId: string,
  opts: SeriesOpts & { country?: string } = {},
): Promise<SeriesResult> {
  const id = seriesId.trim();
  const lower = id.toLowerCase();

  if (lower.startsWith("worldbank/") || lower.startsWith("wb/")) {
    const code = id.slice(id.indexOf("/") + 1);
    if (!opts.country) {
      throw new ToolError("World Bank series require a 'country' parameter (ISO3 code or name).", { series_id: id });
    }
    const country = requireCountry(opts.country);
    const wb = await fetchWbSeries(country.iso3, code);
    const citation = worldBankCitation(ctx, {
      indicatorId: wb.indicatorId,
      indicatorName: wb.indicatorName,
      iso3: wb.countryIso3,
      apiUrl: wb.apiUrl,
      lastUpdated: wb.lastUpdated,
    });
    return finishSeries(
      {
        series_id: `worldbank/${wb.indicatorId}`,
        name: wb.indicatorName,
        country: { iso3: wb.countryIso3, name: wb.countryName },
        frequency: "annual",
        observations: wb.observations,
        citation,
        notes: [],
      },
      opts,
    );
  }

  if (lower.startsWith("imf/")) {
    const code = id.slice(4);
    const info = DM_CODE_INFO.get(code);
    if (!info) {
      throw new ToolError(
        `Unrecognized IMF DataMapper code '${code}'. Known codes: ${[...DM_CODE_INFO.keys()].join(", ")}.`,
        { series_id: id },
      );
    }
    if (!opts.country) {
      throw new ToolError("IMF DataMapper series require a 'country' parameter (ISO3 code or name).", { series_id: id });
    }
    const country = requireCountry(opts.country);
    return indicatorFromDataMapper(ctx, info.def, country, opts);
  }

  if (lower.startsWith("fred/")) {
    const code = id.slice(5);
    const s = await fetchFredSeries(ctx, code, { start: opts.start, end: opts.end });
    const citation = fredCitation(ctx, { seriesId: s.seriesId, seriesName: s.seriesName, units: s.units, apiUrl: s.apiUrl });
    return finishSeries(
      {
        series_id: `fred/${s.seriesId}`,
        name: s.seriesName,
        country: { iso3: "USA", name: "United States" },
        unit: s.units,
        frequency: s.frequency?.toLowerCase(),
        observations: s.observations,
        citation,
        notes: [],
      },
      opts,
    );
  }

  if (lower.startsWith("dbnomics/")) {
    const parts = id.split("/");
    if (parts.length < 4) {
      throw new ToolError(
        "DBnomics series ids have the form dbnomics/PROVIDER/DATASET/SERIES (e.g. dbnomics/IMF/WEO:latest/USA.NGDP_RPCH.pcent_change).",
        { series_id: id },
      );
    }
    const [, provider, dataset, ...rest] = parts;
    const s = await fetchDbnomicsSeries(provider, dataset, rest.join("/"));
    const citation = dbnomicsCitation(ctx, {
      providerName: s.providerName,
      providerCode: s.providerCode,
      datasetCode: s.datasetCode,
      datasetName: s.datasetName,
      seriesCode: s.seriesCode,
      seriesName: s.seriesName,
      apiUrl: s.apiUrl,
    });
    const notes: string[] = [];
    const projNote = weoProjectionNote(s.datasetCode, s.observations);
    if (projNote) notes.push(projNote);
    const staleNote = weoVintageStaleNote(s.datasetCode);
    if (staleNote) notes.push(staleNote);
    markWeoProjections(s.datasetCode, s.observations);
    return finishSeries(
      {
        series_id: `dbnomics/${s.providerCode}/${s.datasetCode}/${s.seriesCode}`,
        name: s.seriesName,
        frequency: s.frequency,
        observations: s.observations,
        citation,
        notes,
      },
      opts,
    );
  }

  // Fall back to registry keys ("gdp_growth") when a country is provided.
  if (getIndicatorDef(id)) {
    if (!opts.country) {
      throw new ToolError(`'${id}' is a registry indicator — pass a 'country' as well, or use the get_indicator tool.`);
    }
    return getIndicator(ctx, id, opts.country, opts);
  }

  throw new ToolError(
    `Unrecognized series id '${id}'. Expected 'worldbank/CODE', 'fred/ID', 'dbnomics/PROVIDER/DATASET/SERIES', or a registry indicator key (see search_indicators).`,
    { series_id: id },
  );
}

export interface SearchResultItem {
  type: "indicator" | "dbnomics_dataset";
  id: string;
  title: string;
  description?: string;
  url?: string;
  /** For indicator results: how to fetch it. */
  usage?: string;
  /** For indicator results: false when the key is permanently disabled (FRED-reserved) and always declines. */
  active?: boolean;
}

/** A registry key with no servable source def (FRED-only) is permanently disabled — it always declines. */
function isDisabledDef(d: IndicatorDef): boolean {
  // "Disabled" means the def has NO servable source left — in practice the six
  // FRED-reserved keys. An sdmx-backed def is servable and must never be
  // reported inactive.
  return !d.wb && !d.dbnomics && !d.datamapper && !d.sdmx;
}

const FRED_DISABLED_REASON =
  "FRED is permanently disabled on this service (FRED's terms of use prohibit AI/ML use and redistribution of its content). This key always declines; use an active World Bank/IMF-backed key instead.";

/** Search the curated registry (primary) and DBnomics datasets (secondary). */
export async function searchIndicators(ctx: Ctx, query: string, opts: { includeDbnomics?: boolean } = {}): Promise<SearchResultItem[]> {
  const matches = searchIndicatorDefs(query, 8);
  const items: SearchResultItem[] = matches.map((m) => {
    const disabled = isDisabledDef(m.def);
    return {
      type: "indicator",
      id: m.def.key,
      title: m.def.label,
      description: disabled
        ? `DISABLED — ${m.def.unit}. ${FRED_DISABLED_REASON}`
        : `${m.def.unit}${m.def.notes ? ` — ${m.def.notes}` : ""}`,
      url: wbIsPrimarySource(m.def) ? `https://data.worldbank.org/indicator/${m.def.wb}` : undefined,
      usage: disabled
        ? "Do not call: this key always declines. Search again for an active alternative (e.g. unemployment_rate, inflation_cpi, gdp_growth)."
        : `get_indicator(indicator="${m.def.key}", country="<ISO3 or name>")`,
      active: !disabled,
    };
  });
  if (opts.includeDbnomics !== false && items.length < 5) {
    try {
      const ds = await searchDbnomicsDatasets(query, 4);
      for (const d of ds) {
        items.push({
          type: "dbnomics_dataset",
          id: `dbnomics/${d.providerCode}/${d.datasetCode}`,
          title: `${d.providerName}: ${d.datasetName}`,
          description: `${d.nbSeries.toLocaleString("en-US")} series — browse then fetch with get_series('dbnomics/${d.providerCode}/${d.datasetCode}/SERIES_CODE')`,
          url: d.url,
        });
      }
    } catch {
      // Secondary search is best-effort.
    }
  }
  return items;
}

export function listRegistry(): Array<{
  key: string;
  label: string;
  unit: string;
  sources: string[];
  active: boolean;
  disabled_reason?: string;
  notes?: string;
}> {
  return INDICATORS.map((d) => {
    // Source order mirrors the actual resolution order in getIndicator: for
    // DB_PRIMARY keys (and dbnomics-only defs) the IMF path is primary, not a
    // fallback, and within the IMF path DataMapper (current vintage) precedes
    // DBnomics (design D1) — the docs table is generated from this list, so any
    // mismatch here previously contradicted the served behavior.
    const dmLabel = d.datamapper ? "IMF DataMapper API (current WEO/Fiscal Monitor)" : undefined;
    const dbLabel = d.dbnomics ? `${d.dbnomics[0]} ${d.dbnomics[1].replace(":latest", "")} (via DBnomics)` : undefined;
    const wbLabel = d.wb ? "World Bank WDI" : undefined;
    const sdmxLabel = d.sdmx ? (d.sdmx.provider === "BIS" ? "BIS statistics" : "ECB Data Portal") : undefined;
    const dbFirst = d.dbnomics && (!d.wb || DB_PRIMARY.has(d.key));
    const imfChain = [...(dmLabel ? [dmLabel] : []), ...(dbLabel ? [dbLabel] : [])];
    const disabled = isDisabledDef(d);
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      sources: [
        ...(sdmxLabel ? [sdmxLabel] : []),
        ...(dbFirst ? [...imfChain, ...(wbLabel ? [wbLabel] : [])] : [...(wbLabel ? [wbLabel] : []), ...imfChain]),
        // For active keys a fred field is INERT (never served); only surface the
        // FRED label on the disabled keys, where it explains why they decline.
        ...(disabled ? ["FRED (US) — disabled"] : []),
      ],
      active: !disabled,
      ...(disabled ? { disabled_reason: FRED_DISABLED_REASON } : {}),
      notes: d.notes,
    };
  });
}

// ---------------------------------------------------------------------------
// compare_sources (GROWTH-PLAN Phase 1): fetch one indicator for one country
// from EVERY source in its chain independently and report the values side by
// side. Divergence phrasing is fixed house style: differences are
// methodological or vintage differences between official sources, never
// "source X is wrong" — cross-source divergence is exactly the real-world
// condition users hit (pandas-datareader #624) and no competitor surfaces it.
// ---------------------------------------------------------------------------

export interface CompareSourcesResult {
  indicator: string;
  label: string;
  country: { iso3: string; name: string };
  /** The period compared: the requested one, else the latest period every
   * responding source has a value for (undefined when sources share none). */
  period?: string;
  results: Array<{
    source: string;
    ok: boolean;
    period?: string;
    value?: number | null;
    unit?: string;
    citation?: Citation;
    note?: string;
    error?: string;
  }>;
  comparison?: {
    period: string;
    n_sources: number;
    min: number;
    max: number;
    spread_abs: number;
    /** Spread as a percent of the mid-point (absolute values); null when the
     * mid-point is ~0, where a relative spread is meaningless. */
    spread_pct: number | null;
  };
  notes: string[];
}

export async function compareSources(ctx: Ctx, key: string, countryInput: string, period?: string): Promise<CompareSourcesResult> {
  const def = getIndicatorDef(key);
  if (!def) {
    const near = searchIndicatorDefs(key, 5).map((m) => m.def.key);
    throw new ToolError(
      `Unknown indicator '${key}'.` + (near.length ? ` Closest matches: ${near.join(", ")}.` : ""),
      { input: key, suggestions: near },
    );
  }
  const country = requireCountry(countryInput);
  const year = period ? parseInt(period.slice(0, 4), 10) : undefined;
  // Window the fetch around the requested year (some cushion for latest-common
  // resolution); default window pulls recent history only.
  const opts: SeriesOpts = year
    ? { start: String(year - 1), end: String(year + 1) }
    : { limit: 12 };
  const attempts = buildSourceAttempts(ctx, def, country, opts);
  if (attempts.length === 0) {
    throw new ToolError(`Indicator '${def.key}' has no comparable sources for ${country.name}.`, { indicator: def.key });
  }

  const settled = await Promise.allSettled(attempts.map((a) => a.run()));
  const results: CompareSourcesResult["results"] = settled.map((s, i) => {
    if (s.status === "rejected") {
      const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
      return { source: attempts[i].label, ok: false, error: msg };
    }
    const r = s.value;
    const valued = r.observations.filter((o) => o.value != null);
    const pick = year
      ? valued.find((o) => o.period.startsWith(String(year)))
      : valued[valued.length - 1];
    return {
      source: attempts[i].label,
      ok: true,
      period: pick?.period,
      value: pick ? pick.value : null,
      unit: r.unit,
      citation: r.citation,
      ...(pick?.note ? { note: pick.note } : {}),
    };
  });

  const notes: string[] = [
    "Differences between sources typically reflect methodological or vintage differences (e.g. central vs general government coverage, calendar vs fiscal years, an IMF WEO vintage vs a later World Bank revision) — they are not an error by either source. Cite the source whose definition matches your claim.",
  ];

  // Comparison period: requested year, else the latest period shared by every
  // ok-source that returned any value at all.
  let comparePeriod: string | undefined = year ? String(year) : undefined;
  if (!comparePeriod) {
    const okResults = settled
      .map((s, i) => (s.status === "fulfilled" ? { i, r: s.value } : null))
      .filter((x): x is { i: number; r: SeriesResult } => x !== null);
    const periodSets = okResults.map(({ r }) => new Set(r.observations.filter((o) => o.value != null).map((o) => o.period)));
    if (periodSets.length >= 2) {
      const shared = [...periodSets[0]].filter((p) => periodSets.every((set) => set.has(p))).sort();
      if (shared.length) {
        comparePeriod = shared[shared.length - 1];
        // Re-pick each ok result's value AT the shared period for a fair comparison.
        for (const { i, r } of okResults) {
          const at = r.observations.find((o) => o.period === comparePeriod && o.value != null);
          if (at) {
            results[i].period = at.period;
            results[i].value = at.value;
            if (at.note) results[i].note = at.note;
          }
        }
      } else {
        notes.push("The responding sources share no common period with published values — per-source latest values are shown and no numeric comparison is made.");
      }
    }
  }

  const comparable = results.filter((r) => r.ok && r.period === comparePeriod && typeof r.value === "number");
  let comparison: CompareSourcesResult["comparison"];
  if (comparePeriod && comparable.length >= 2) {
    const vals = comparable.map((r) => r.value as number);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mid = (Math.abs(min) + Math.abs(max)) / 2;
    comparison = {
      period: comparePeriod,
      n_sources: comparable.length,
      min,
      max,
      spread_abs: max - min,
      spread_pct: mid > 1e-9 ? Math.round(((max - min) / mid) * 10000) / 100 : null,
    };
  } else if (results.filter((r) => r.ok).length < 2) {
    notes.push("Only one source responded — no cross-source comparison is possible right now; the per-source error fields say why.");
  }

  return { indicator: def.key, label: def.label, country: { iso3: country.iso3, name: country.name }, period: comparePeriod, results, comparison, notes };
}
