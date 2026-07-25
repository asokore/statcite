// Inflation adjustment: "what is X in year A worth in year B money?"
// Method: CPI ratio using the World Bank CPI index (FP.CPI.TOTL, 2010=100),
// which is base-invariant. Annual-average precision, any country with CPI data.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { requireCountry } from "./series.ts";
import { fetchWbSeries } from "../adapters/worldbank.ts";
import { worldBankCitation } from "./citations.ts";

export interface InflationResult {
  original_amount: number;
  from_year: number;
  to_year: number;
  adjusted_amount: number;
  factor: number;
  country: { iso3: string; name: string };
  index_used: { series: string; from_value: number; to_value: number; base: string };
  method: string;
  citation: Citation;
  notes: string[];
}

export async function inflationAdjust(
  ctx: Ctx,
  amount: number,
  fromYear: number,
  toYear: number,
  countryInput = "USA",
): Promise<InflationResult> {
  if (!Number.isFinite(amount)) throw new ToolError("'amount' must be a number.");
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) {
    throw new ToolError("'from_year' and 'to_year' must be integer years, e.g. 1995 and 2025.");
  }
  const country = requireCountry(countryInput);
  const wb = await fetchWbSeries(country.iso3, "FP.CPI.TOTL");
  const byYear = new Map(wb.observations.filter((o) => o.value != null).map((o) => [parseInt(o.period, 10), o.value as number]));
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length === 0) {
    throw new ToolError(`No CPI index data available for ${country.name}.`, { country: country.iso3 });
  }
  const min = years[0];
  const max = years[years.length - 1];
  const from = byYear.get(fromYear);
  const to = byYear.get(toYear);
  if (from == null || to == null) {
    throw new ToolError(
      `CPI index for ${country.name} covers ${min}–${max}; requested ${fromYear}→${toYear}. ` +
        `Missing: ${[from == null ? fromYear : null, to == null ? toYear : null].filter(Boolean).join(", ")}.`,
      { available_range: [min, max] },
    );
  }
  const factor = to / from;
  const adjusted = amount * factor;
  const notes = [
    "Annual-average CPI; sub-year precision is not represented.",
    "CPI measures consumer prices — for comparing incomes or output across years, a GDP deflator may be more appropriate.",
  ];
  if (country.iso3 === "USA") {
    notes.push("For US monthly precision, the FRED series CPIAUCSL is available via get_series('fred/CPIAUCSL') when the server has a FRED key.");
  }
  return {
    original_amount: amount,
    from_year: fromYear,
    to_year: toYear,
    adjusted_amount: Number(adjusted.toFixed(6)),
    factor: Number(factor.toFixed(6)),
    country: { iso3: wb.countryIso3, name: wb.countryName },
    index_used: { series: "worldbank/FP.CPI.TOTL", from_value: from, to_value: to, base: "2010 = 100" },
    method: `adjusted = amount × CPI(${toYear}) / CPI(${fromYear}) = ${amount} × ${to} / ${from}`,
    citation: worldBankCitation(ctx, {
      indicatorId: wb.indicatorId,
      indicatorName: wb.indicatorName,
      iso3: wb.countryIso3,
      apiUrl: wb.apiUrl,
      lastUpdated: wb.lastUpdated,
    }),
    notes,
  };
}
