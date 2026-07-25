// Country snapshot: headline indicators in (at most) two upstream calls.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { requireCountry } from "./series.ts";
import { getIndicatorDef } from "./indicators.ts";
import { fetchWbMulti } from "../adapters/worldbank.ts";
import { fetchDbnomicsSeries } from "../adapters/dbnomics.ts";
import { worldBankCitation, dbnomicsCitation } from "./citations.ts";
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

  // Government debt from IMF WEO (better coverage than WDI central-government series).
  try {
    const debtDef = getIndicatorDef("govt_debt_gdp")!;
    const [provider, dataset, template] = debtDef.dbnomics!;
    const s = await fetchDbnomicsSeries(provider, dataset, template.replace("{ISO3}", country.iso3));
    // WEO includes projections; take the latest period at or before the vintage year.
    const m = s.datasetCode.match(/WEO:(\d{4})/);
    const vintage = m ? parseInt(m[1], 10) : undefined;
    const historical = vintage
      ? s.observations.filter((o) => parseInt(o.period.slice(0, 4), 10) < vintage)
      : s.observations;
    const latest = latestNonNull(historical);
    if (latest && latest.value != null) {
      items.push({
        indicator: debtDef.key,
        label: "General government gross debt (% of GDP)",
        period: latest.period,
        value: latest.value,
        unit: debtDef.unit,
        citation: dbnomicsCitation(ctx, {
          providerName: s.providerName,
          providerCode: s.providerCode,
          datasetCode: s.datasetCode,
          datasetName: s.datasetName,
          seriesCode: s.seriesCode,
          seriesName: s.seriesName,
          apiUrl: s.apiUrl,
        }),
      });
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
  };
}
