// Country snapshot: headline indicators in (at most) two upstream calls.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { requireCountry, getIndicator } from "./series.ts";
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
export const ECCU_ISO3 = new Set(["AIA", "ATG", "DMA", "GRD", "KNA", "LCA", "MSR", "VCT", "XCU"]);

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
}

export async function countrySnapshot(ctx: Ctx, countryInput: string): Promise<Snapshot> {
  const country = requireCountry(countryInput);
  const defs = SNAPSHOT_WB_KEYS.map((k) => getIndicatorDef(k)!);
  const codes = defs.map((d) => d.wb!) as string[];

  // A World Bank failure must not decide whether a snapshot exists. Montserrat
  // is not a World Bank reporting economy, so this call throws a coverage
  // error, and letting it propagate killed the whole snapshot for a country
  // whose central bank publishes debt, prices and fiscal accounts. One source
  // not covering a country is a fact about that source, not about the country.
  let byCode: Awaited<ReturnType<typeof fetchWbMulti>> = new Map();
  let wbFailed: string | undefined;
  try {
    byCode = await fetchWbMulti(country.iso3, codes, { mrv: 8 });
  } catch (e) {
    wbFailed = e instanceof Error ? e.message : String(e);
  }
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
    missing.push("govt_debt_gdp");
  }

  // ECCU supplement. Deliberately AFTER the World Bank pass and additive: for
  // a country the World Bank does cover, these sit alongside rather than
  // replacing, since the two use different definitions and currencies and one
  // must never silently stand in for the other.
  if (CARIBSTAT_ENABLED && ECCU_ISO3.has(country.iso3)) {
    for (const spec of ECCU_SUPPLEMENT) {
      try {
        const c = await fetchCaribstatSeries(spec.id(country.iso3));
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
      } catch {
        // A missing table is not a snapshot failure. The bank does not publish
        // every table for every geography and the honest result is a shorter
        // snapshot, not an error.
        missing.push(spec.key);
      }
    }
    if (items.length) {
      if (wbFailed) {
        notes.push(
          "The World Bank publishes none of its headline indicators for this economy, so everything here comes from the regional central bank.",
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
    const territory = integratedTerritoryNote(country.iso3, countryName);
    const t = INTEGRATED_TERRITORIES[country.iso3];
    throw new ToolError(
      territory ?? `No snapshot data available for '${countryInput}' (${country.iso3}).`,
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
  };
}
