// Country snapshot: headline indicators in (at most) two upstream calls.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { requireCountry, getIndicator } from "./series.ts";
import { getIndicatorDef } from "./indicators.ts";
import { fetchWbMulti } from "../adapters/worldbank.ts";
import { worldBankCitation } from "./citations.ts";
import { latestNonNull } from "./transforms.ts";

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

  const byCode = await fetchWbMulti(country.iso3, codes, { mrv: 8 });
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

  if (items.length === 0) {
    throw new ToolError(`No snapshot data available for '${countryInput}' (${country.iso3}).`, {
      country: country.iso3,
    });
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
