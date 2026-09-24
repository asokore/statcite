// Country snapshot: headline indicators in (at most) two upstream calls.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { isTransientUpstreamError, hostStateOf } from "./upstream.ts";
import { requireCountry, getIndicator, cleanReason } from "./series.ts";
import { getIndicatorDef } from "./indicators.ts";
import { fetchWbMulti } from "../adapters/worldbank.ts";
import { worldBankCitation } from "./citations.ts";
import { latestNonNull } from "./transforms.ts";
import { integratedTerritoryNote, INTEGRATED_TERRITORIES } from "./countries.ts";
import { fetchCaribstatSeries, CARIBSTAT_ENABLED } from "../adapters/caribstat.ts";
import { caribstatCitation } from "./citations.ts";

const SNAPSHOT_WB_KEYS = [
  "gdp_current_usd",
  "gdp_growth",
  "gdp_per_capita_usd",
  "inflation_cpi",
  "unemployment_rate",
  "population",
  "current_account_gdp",
  "trade_gdp",
  "fdi_inflows_gdp",
  "life_expectancy",
] as const;

/**
 * ECCU geographies, plus the currency union aggregate.
 *
 * Anguilla and Montserrat are the reason this exists. Neither is a World Bank
 * reporting economy, so the snapshot's usual path finds nothing and the whole
 * call used to fail with "no snapshot data available" for countries whose
 * central bank publishes full debt, fiscal and price statistics every quarter.
 * That was the exact gap this service claims to close, failing at the one
 * endpoint an agent reaches for first.
 */
export { ECCU_ISO3 } from "./eccb-related.ts";
import { ECCU_ISO3 } from "./eccb-related.ts";

/** Headline rows worth a snapshot slot, in the order they should appear. */
const ECCU_SUPPLEMENT = [
  {
    key: "public_sector_debt_ec",
    label: "Central government debt (ECCB)",
    id: (iso3: string) => `caribstat/ECCB/total-public-sector-debt/${iso3}.a#Central Government Debt`,
  },
  {
    key: "inflation_cpi_eccb",
    label: "Inflation, end of period (ECCB)",
    id: (iso3: string) => `caribstat/ECCB/consumer-price-index/${iso3}.a#Inflation Rate - end of period`,
  },
  {
    key: "govt_revenue_ec",
    label: "Total revenue and grants (ECCB)",
    id: (iso3: string) => `caribstat/ECCB/central-government-fiscal-accounts/${iso3}.a#Total Revenue and Grants`,
  },
  {
    // The one directly comparable to the global govt_debt_gdp concept, and a
    // ratio rather than an EC$ level, so it is readable without knowing the
    // currency or the size of the economy.
    key: "govt_debt_gdp_eccb",
    label: "Central government debt to GDP (ECCB)",
    id: (iso3: string) => `caribstat/ECCB/debt-to-gdp/${iso3}.a#Central Government Debt to GDP`,
  },
  {
    // Tourism is the dominant sector in most of these economies, so a snapshot
    // that omits it describes them poorly however many other rows it carries.
    key: "visitor_arrivals_eccb",
    label: "Total visitor arrivals (ECCB)",
    id: (iso3: string) => `caribstat/ECCB/selected-tourism-statistics/${iso3}.a#Total Visitor Arrivals`,
  },
] as const;

export interface SnapshotItem {
  indicator: string;
  label: string;
  period: string;
  value: number;
  unit: string;
  citation: Citation;
}

export interface Snapshot {
  country: { iso3: string; name: string };
  as_of: string;
  indicators: SnapshotItem[];
  missing: string[];
  notes: string[];
  /** Present and true when any item was served from a fallback source because its
   * primary failed; fallback_indicators names them. The REST layer serves such
   * snapshots no-store so a fallback-sourced number can't linger in shared caches
   * after the primary recovers. Absent otherwise. */
  fallback_used?: boolean;
  fallback_indicators?: string[];
  /** Present only when a source failed in a way that may recover, so the caller
   * can tell a short snapshot caused by an outage from a short snapshot caused
   * by coverage. Same shape series.ts already uses for its own `sources` detail.
   * The REST layer serves such snapshots no-store, so a shortfall caused by a
   * dead upstream cannot linger in shared caches after the source recovers. */
  sources_unavailable?: { source: string; reason: string }[];
}

/**
 * Only the two legs that fetch directly — fetchWbMulti and fetchCaribstatSeries —
 * are classified, because only they throw the raw error isTransientUpstreamError
 * can read: an UpstreamError carrying the status, or a ToolError that the adapter
 * already decided is a definitive absence (caribstat turns its 404 into exactly
 * that). The govt_debt_gdp leg goes through getIndicator, which wraps every
 * outcome in a ToolError, and its derived code cannot be trusted as a transience
 * signal: series.ts uses `upstream_unavailable` as its own catch-all whenever the
 * three sources' verdicts disagree, so a genuine three-source absence can arrive
 * carrying it. Guessing there would turn real coverage facts into false outages,
 * which is the failure this change exists to remove. That leg is therefore left
 * out, which is safe: it contributes one of the twelve rows, so it can never be
 * the reason a snapshot is empty while the World Bank call itself succeeded.
 */

export async function countrySnapshot(ctx: Ctx, countryInput: string): Promise<Snapshot> {
  const country = requireCountry(countryInput);
  const defs = SNAPSHOT_WB_KEYS.map((k) => getIndicatorDef(k)!);
  const codes = defs.map((d) => d.wb!) as string[];

  // A World Bank failure must not decide whether a snapshot exists. Montserrat
  // is not a World Bank reporting economy, so this call throws a coverage
  // error, and letting it propagate killed the whole snapshot for a country
  // whose central bank publishes debt, prices and fiscal accounts. One source
  // not covering a country is a fact about that source, not about the country.
  //
  // But a source that could not be REACHED is not a source that publishes
  // nothing, and until 1.13.1 this recorded only that the call failed. That one
  // boolean then decided both the "World Bank publishes none of these" note and,
  // via an empty item list, an error coded as the caller's fault. Three states,
  // not two: served, answered-and-held-nothing, unreachable.
  let byCode: Awaited<ReturnType<typeof fetchWbMulti>> = new Map();
  let wbFailed: string | undefined;
  let wbUnreachable = false;
  try {
    // The request's host state, so the per-request breaker sees this ladder.
    // Without it a World Bank outage cost two full ladders per snapshot: this
    // call, then govt_debt_gdp's chain, which ends at the World Bank and could
    // not tell the host had already failed. 6 fetches and about 1.2s of extra
    // waiting, measured 2026-09-24. With it the later leg asks once.
    byCode = await fetchWbMulti(country.iso3, codes, { mrv: 8, hostState: hostStateOf(ctx) });
  } catch (e) {
    wbFailed = e instanceof Error ? e.message : String(e);
    wbUnreachable = isTransientUpstreamError(e);
  }
  /** Sources that failed transiently during this snapshot. Non-empty means any
   * shortfall below may be an outage rather than a coverage fact. */
  const unavailable: { source: string; reason: string }[] = [];
  if (wbUnreachable) unavailable.push({ source: "World Bank WDI", reason: cleanReason(wbFailed) });
  const items: SnapshotItem[] = [];
  const missing: string[] = [];
  const notes: string[] = [
    "Latest available observation per indicator; periods differ because sources update on different schedules.",
  ];

  let countryName = country.name;
  for (const def of defs) {
    const s = byCode.get(def.wb!);
    const latest = s ? latestNonNull(s.observations) : undefined;
    if (!s || !latest || latest.value == null) {
      missing.push(def.key);
      continue;
    }
    countryName = s.countryName;
    items.push({
      indicator: def.key,
      label: s.indicatorName,
      period: latest.period,
      value: latest.value,
      unit: def.unit,
      citation: worldBankCitation(ctx, {
        indicatorId: s.indicatorId,
        indicatorName: s.indicatorName,
        iso3: s.countryIso3,
        apiUrl: s.apiUrl,
        lastUpdated: s.lastUpdated,
      }),
    });
  }

  // Government debt from the same chain get_indicator uses (IMF DataMapper API,
  // then IMF WEO via DBnomics, then World Bank central-government series) —
  // previously this fetched DBnomics directly, so country_snapshot and
  // get_indicator could silently disagree on the same headline number and vintage
  // for the same query (design D1/F5). finishSeries's limit=1 semantics already
  // prefer the latest non-projection ("outturn") observation.
  const fallbackIndicators: string[] = [];
  try {
    const debtDef = getIndicatorDef("govt_debt_gdp")!;
    const s = await getIndicator(ctx, "govt_debt_gdp", country.iso3, { limit: 1 });
    const latest = latestNonNull(s.observations);
    if (latest && latest.value != null) {
      items.push({
        indicator: debtDef.key,
        label: s.name,
        period: latest.period,
        value: latest.value,
        unit: debtDef.unit,
        citation: s.citation,
      });
      if (s.fallback_used) {
        fallbackIndicators.push("govt_debt_gdp");
        notes.push(`Government debt: ${s.notes[s.notes.length - 1] ?? "served from a fallback source."}`);
      }
    } else {
      missing.push("govt_debt_gdp");
    }
  } catch {
    // Deliberately NOT classified as reachable or unreachable. See the note
    // above the function: getIndicator's derived code cannot carry that signal.
    missing.push("govt_debt_gdp");
  }

  // ECCU supplement. Deliberately AFTER the World Bank pass and additive: for
  // a country the World Bank does cover, these sit alongside rather than
  // replacing, since the two use different definitions and currencies and one
  // must never silently stand in for the other.
  if (CARIBSTAT_ENABLED && ECCU_ISO3.has(country.iso3)) {
    // Fetch the tables together, consume them in order. These are the
    // geographies the supplement exists for, and one table at a time made
    // Anguilla and Montserrat the slowest snapshots in the service. Every
    // promise is created and handed to allSettled in the same synchronous
    // block, so none can reject unobserved.
    const settled = await Promise.allSettled(ECCU_SUPPLEMENT.map((spec) => fetchCaribstatSeries(spec.id(country.iso3))));
    for (const [i, spec] of ECCU_SUPPLEMENT.entries()) {
      try {
        const outcome = settled[i];
        if (outcome.status === "rejected") throw outcome.reason;
        const c = outcome.value;
        const latest = latestNonNull(c.observations);
        if (!latest) continue;
        items.push({
          indicator: spec.key,
          label: spec.label,
          period: latest.period,
          value: latest.value as number,
          unit: c.unit ?? "",
          citation: caribstatCitation(ctx, {
            source: c.doc.source,
            sourceUrl: c.doc.source_url,
            tableTitle: c.doc.table_title ?? c.doc.sheet,
            rowLabel: c.label,
            countryName: c.doc.country.name,
            frequency: c.doc.frequency ?? "a",
            dataAsAt: c.doc.data_as_at,
            dataAsAtRaw: c.doc.data_as_at_raw,
            publicationTitle: c.doc.publication_title,
            publishedAt: c.doc.published_at,
            attachmentUrl: c.doc.attachment_url,
            apiUrl: c.apiUrl,
            seriesId: spec.id(country.iso3),
          }),
        });
      } catch (e) {
        // A missing table is not a snapshot failure. The bank does not publish
        // every table for every geography and the honest result is a shorter
        // snapshot, not an error. An unreachable origin is a different thing and
        // is recorded as such: caribstat.ts turns a 404 into a ToolError marked
        // no_published_data, so the two are already distinguishable here.
        missing.push(spec.key);
        if (isTransientUpstreamError(e)) {
          unavailable.push({ source: "Eastern Caribbean Central Bank (CaribStat)", reason: cleanReason((e as Error)?.message) });
        }
      }
    }
    if (items.length) {
      // Gated on the World Bank having ANSWERED and held nothing, not merely on
      // the call having failed. byCode is empty both when it returned an empty
      // envelope (Anguilla, live) and when it refused definitively (Montserrat,
      // live), and is non-empty whenever it served anything.
      if (byCode.size === 0 && !wbUnreachable) {
        notes.push(
          "The World Bank publishes none of its headline indicators for this economy, so everything here comes from the regional central bank.",
        );
      } else if (wbUnreachable) {
        notes.push(
          "The World Bank could not be reached for this request, so its headline indicators are absent from this snapshot rather than unpublished. Retrying may return a fuller snapshot.",
        );
      }
      notes.push(
        "Items marked (ECCB) come from the Eastern Caribbean Central Bank, not the World Bank. They are stated in EC$ and on the ECCB's own definitions, so they are not interchangeable with the World Bank series above.",
      );
    }
  }

  if (items.length === 0) {
    // An empty snapshot for a real place is a coverage fact, and where we know
    // WHY it is empty the caller should be told rather than left to guess that
    // they mistyped the name.
    //
    // The territory note stays FIRST. "Martinique is reported inside France" is
    // true whether or not an upstream is answering, and it is the more useful
    // answer of the two.
    const territory = integratedTerritoryNote(country.iso3, countryName);
    const t = INTEGRATED_TERRITORIES[country.iso3];
    // Nothing came back AND something could not be reached: this is an outage,
    // and coding it as the caller's fault told an agent that a country with a
    // full statistical office has no published data at all.
    if (!territory && unavailable.length) {
      throw new ToolError(
        `Could not build a snapshot for ${countryName}: ${unavailable.map((u) => u.source).join(", ")} could not be reached. ` +
          `This is an upstream outage, not a statement that ${countryName} publishes no data. Retrying shortly may succeed.`,
        { country: country.iso3, sources: unavailable },
        "upstream_unavailable",
      );
    }
    // An ISO3 caller was told the code twice: "'USA' (USA)".
    const label = countryInput.trim().toUpperCase() === country.iso3 ? `'${country.iso3}'` : `'${countryInput}' (${country.iso3})`;
    throw new ToolError(
      territory ?? `No snapshot data available for ${label}.`,
      {
        country: country.iso3,
        ...(t
          ? {
              no_published_data: true,
              reported_under: t.parentIso3,
              publisher: t.publisher,
              publisher_url: t.publisherUrl,
            }
          : {}),
      },
    );
  }

  return {
    country: { iso3: country.iso3, name: countryName },
    as_of: new Date((ctx.now ? ctx.now() : new Date())).toISOString().slice(0, 10),
    indicators: items,
    missing,
    notes,
    ...(fallbackIndicators.length ? { fallback_used: true, fallback_indicators: fallbackIndicators } : {}),
    ...(unavailable.length ? { sources_unavailable: unavailable } : {}),
  };
}
