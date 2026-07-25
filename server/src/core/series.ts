// Series orchestration: friendly indicators with source fallback, raw series ids,
// and cross-source search.

import type { Ctx, IndicatorDef, Observation, SeriesResult } from "./types.ts";
import { ToolError } from "./types.ts";
import { resolveCountry, suggestCountries, type Country } from "./countries.ts";
import { getIndicatorDef, searchIndicatorDefs, INDICATORS } from "./indicators.ts";
import { applyTransform, filterPeriodRange, type Transform } from "./transforms.ts";
import { fetchWbSeries } from "../adapters/worldbank.ts";
import { fetchDbnomicsSeries, searchDbnomicsDatasets } from "../adapters/dbnomics.ts";
import { fetchFredSeries, fredAvailable } from "../adapters/fred.ts";
import { worldBankCitation, dbnomicsCitation, fredCitation } from "./citations.ts";

export interface SeriesOpts {
  start?: string;
  end?: string;
  transform?: Transform;
  /** Trim to the most recent N non-trailing-null observations (after transform). */
  limit?: number;
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
      result.notes.push("Latest published outturn shown; later IMF WEO projection periods exist for this series.");
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
    throw new ToolError(
      `No observations available for ${result.series_id}${result.country ? ` (${result.country.name})` : ""} in the requested window` +
        (opts.start || opts.end ? ` ${opts.start ?? "…"}–${opts.end ?? "…"}` : "") +
        ". Try widening the period.",
      { series_id: result.series_id },
    );
  }
  result.observations = obs;
  return result;
}

/** Flag likely IMF WEO projections (periods at/after the vintage year). */
function weoProjectionNote(datasetCode: string, observations: { period: string }[]): string | undefined {
  const m = datasetCode.match(/WEO:(\d{4})/);
  if (!m) return undefined;
  const vintage = parseInt(m[1], 10);
  const hasFuture = observations.some((o) => parseInt(o.period.slice(0, 4), 10) >= vintage);
  return hasFuture
    ? `Values for ${vintage} onward are IMF WEO estimates/projections from the ${datasetCode.replace("WEO:", "")} vintage, not final outturns.`
    : undefined;
}

/** Mark per-observation projection notes for WEO-style series. */
function markWeoProjections(datasetCode: string, observations: Observation[]): void {
  const m = datasetCode.match(/WEO:(\d{4})/);
  if (!m) return;
  const vintage = parseInt(m[1], 10);
  for (const o of observations) {
    if (parseInt(o.period.slice(0, 4), 10) >= vintage) o.note = "IMF WEO estimate/projection";
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

async function indicatorFromDbnomics(ctx: Ctx, def: IndicatorDef, country: Country, opts: SeriesOpts): Promise<SeriesResult> {
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

  // Determine source order: dbnomics-primary defs list dbnomics before wb in intent;
  // we encode that as: if def.dbnomics exists and def.wb is the known-patchy fallback,
  // the registry marks it by ordering — here: govt debt & fiscal series prefer WEO.
  const preferDbnomics = def.dbnomics && (!def.wb || DB_PRIMARY.has(def.key));
  const attempts: Array<() => Promise<SeriesResult>> = [];
  if (preferDbnomics) {
    attempts.push(() => indicatorFromDbnomics(ctx, def, country, opts));
    if (def.wb) attempts.push(() => indicatorFromWb(ctx, def, country, opts));
  } else {
    if (def.wb) attempts.push(() => indicatorFromWb(ctx, def, country, opts));
    if (def.dbnomics) attempts.push(() => indicatorFromDbnomics(ctx, def, country, opts));
  }
  if (def.fred && country.iso3 === "USA" && fredAvailable(ctx) && attempts.length === 0) {
    attempts.push(() => indicatorFromFred(ctx, def, opts));
  }

  const errors: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = await attempts[i]();
      if (i > 0) result.notes.push(`Primary source unavailable for this query; served from fallback source. (${errors[0]})`);
      return result;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new ToolError(
    `Could not retrieve '${def.key}' for ${country.name}: ${errors.join(" | ")}`,
    { indicator: def.key, country: country.iso3 },
  );
}

const DB_PRIMARY = new Set(["govt_debt_gdp", "fiscal_balance_gdp", "govt_revenue_gdp", "govt_expenditure_gdp"]);

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
}

/** Search the curated registry (primary) and DBnomics datasets (secondary). */
export async function searchIndicators(ctx: Ctx, query: string, opts: { includeDbnomics?: boolean } = {}): Promise<SearchResultItem[]> {
  const matches = searchIndicatorDefs(query, 8);
  const items: SearchResultItem[] = matches.map((m) => ({
    type: "indicator",
    id: m.def.key,
    title: m.def.label,
    description: `${m.def.unit}${m.def.notes ? ` — ${m.def.notes}` : ""}`,
    url: m.def.wb ? `https://data.worldbank.org/indicator/${m.def.wb}` : undefined,
    usage: `get_indicator(indicator="${m.def.key}", country="<ISO3 or name>")`,
  }));
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

export function listRegistry(): Array<{ key: string; label: string; unit: string; sources: string[]; notes?: string }> {
  return INDICATORS.map((d) => ({
    key: d.key,
    label: d.label,
    unit: d.unit,
    sources: [
      ...(d.wb ? ["World Bank WDI"] : []),
      ...(d.dbnomics ? [`${d.dbnomics[0]} ${d.dbnomics[1].replace(":latest", "")} (via DBnomics)`] : []),
      ...(d.fred ? ["FRED (US)"] : []),
    ],
    notes: d.notes,
  }));
}
