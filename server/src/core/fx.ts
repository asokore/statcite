// FX conversion with two rails:
//   1. ECB reference rates (daily, ~30 currencies) via Frankfurter — precise dates.
//   2. World Bank official annual-average rates (PA.NUS.FCRF) for everything else —
//      including most Caribbean, African, and Asian currencies the ECB set lacks.
// Mixed pairs bridge through USD with an explicit method note.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { getEcbRates, getEcbAnnualAverage, listEcbCurrencies } from "../adapters/frankfurter.ts";
import { fetchWbSeries } from "../adapters/worldbank.ts";
import { ecbFxCitation, worldBankCitation } from "./citations.ts";

/** Currency → representative economy for World Bank official-rate lookups (LCU per USD). */
const CURRENCY_COUNTRY: Record<string, string> = {
  BBD: "BRB", XCD: "LCA", JMD: "JAM", TTD: "TTO", BSD: "BHS", GYD: "GUY", BZD: "BLZ", HTG: "HTI",
  DOP: "DOM", CUP: "CUB", AWG: "ABW", ANG: "CUW", KYD: "CYM", BMD: "BMU", SRD: "SUR",
  ARS: "ARG", CLP: "CHL", COP: "COL", PEN: "PER", UYU: "URY", BOB: "BOL", PYG: "PRY", CRC: "CRI",
  GTQ: "GTM", HNL: "HND", NIO: "NIC", PAB: "PAN", VES: "VEN",
  EGP: "EGY", NGN: "NGA", KES: "KEN", GHS: "GHA", XOF: "SEN", XAF: "CMR", MAD: "MAR", TND: "TUN",
  DZD: "DZA", ETB: "ETH", TZS: "TZA", UGX: "UGA", RWF: "RWA", ZMW: "ZMB", BWP: "BWA", NAD: "NAM",
  MUR: "MUS", SCR: "SYC", MZN: "MOZ", AOA: "AGO", CDF: "COD", GMD: "GMB", SLL: "SLE", LRD: "LBR",
  LKR: "LKA", PKR: "PAK", BDT: "BGD", NPR: "NPL", VND: "VNM", KHR: "KHM", LAK: "LAO", MMK: "MMR",
  MNT: "MNG", KZT: "KAZ", UZS: "UZB", GEL: "GEO", AMD: "ARM", AZN: "AZE", TJS: "TJK", TMT: "TKM",
  ALL: "ALB", MKD: "MKD", RSD: "SRB", BAM: "BIH", MDL: "MDA", UAH: "UKR", BYN: "BLR", RUB: "RUS",
  SAR: "SAU", AED: "ARE", QAR: "QAT", KWD: "KWT", BHD: "BHR", OMR: "OMN", JOD: "JOR", ILS: "ISR",
  IQD: "IRQ", IRR: "IRN", LBP: "LBN", YER: "YEM", SYP: "SYR",
  FJD: "FJI", PGK: "PNG", WST: "WSM", TOP: "TON", SBD: "SLB", VUV: "VUT", XPF: "PYF",
  MVR: "MDV", BTN: "BTN", MOP: "MAC", BND: "BRN",
  // ECB-covered majors also get World Bank mappings so annual-average requests
  // (and pre-1999 history) work for them too.
  EUR: "EMU", GBP: "GBR", JPY: "JPN", CHF: "CHE", CAD: "CAN", AUD: "AUS", NZD: "NZL",
  CNY: "CHN", INR: "IND", BRL: "BRA", MXN: "MEX", KRW: "KOR", SEK: "SWE", NOK: "NOR",
  DKK: "DNK", PLN: "POL", CZK: "CZE", HUF: "HUN", RON: "ROU", BGN: "BGR", TRY: "TUR",
  ZAR: "ZAF", SGD: "SGP", HKD: "HKG", THB: "THA", MYR: "MYS", IDR: "IDN", PHP: "PHL",
  ISK: "ISL", USD: "USA",
};

export interface FxResult {
  amount: number;
  from: string;
  to: string;
  converted_amount: number;
  rate: number;
  rate_date: string;
  method: string;
  precision: "daily" | "annual_average" | "mixed";
  citations: Citation[];
  notes: string[];
}

async function wbUsdPerUnit(
  ctx: Ctx,
  currency: string,
  year?: number,
): Promise<{ usdPerUnit: number; period: string; citation?: Citation }> {
  const iso3 = CURRENCY_COUNTRY[currency];
  if (!iso3) {
    throw new ToolError(
      `Currency '${currency}' is not covered. ECB daily rates cover ~30 majors; StatCite's annual fallback covers ~120 currencies via World Bank official rates. ` +
        "Check the ISO 4217 code, or fetch a specific economy's rate with get_indicator(indicator='official_fx_rate', country=...).",
      { currency },
    );
  }
  const wb = await fetchWbSeries(iso3, "PA.NUS.FCRF");
  const usable = wb.observations.filter((o) => o.value != null);
  if (usable.length === 0) throw new ToolError(`No official exchange-rate data for ${currency} (${iso3}).`);
  let chosen = usable[usable.length - 1];
  if (year) {
    const hit = usable.find((o) => parseInt(o.period, 10) === year);
    if (!hit) {
      const min = usable[0].period;
      const max = usable[usable.length - 1].period;
      throw new ToolError(`Official annual rate for ${currency} covers ${min}–${max}; no data for ${year}.`, {
        currency,
        available_range: [min, max],
      });
    }
    chosen = hit;
  }
  // PA.NUS.FCRF is LCU per USD → USD per unit is the reciprocal.
  return {
    usdPerUnit: 1 / (chosen.value as number),
    period: chosen.period,
    citation: worldBankCitation(ctx, {
      indicatorId: wb.indicatorId,
      indicatorName: `${wb.indicatorName} — ${wb.countryName}`,
      iso3: wb.countryIso3,
      apiUrl: wb.apiUrl,
      lastUpdated: wb.lastUpdated,
    }),
  };
}

export async function fxConvert(ctx: Ctx, amount: number, fromRaw: string, toRaw: string, date?: string): Promise<FxResult> {
  if (!Number.isFinite(amount)) throw new ToolError("'amount' must be a number.");
  const from = fromRaw.trim().toUpperCase();
  const to = toRaw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    throw new ToolError("Currencies must be 3-letter ISO codes, e.g. USD, EUR, BBD.", { from: fromRaw, to: toRaw });
  }
  if (date && !/^\d{4}(-\d{2}-\d{2})?$/.test(date)) {
    throw new ToolError("'date' must be YYYY-MM-DD (daily rates) or YYYY (annual-average rates).", { date });
  }
  if (from === to) {
    return {
      amount, from, to, converted_amount: amount, rate: 1,
      rate_date: date ?? "n/a", method: "identical currencies", precision: "daily", citations: [], notes: [],
    };
  }

  const yearOnly = date && date.length === 4 ? parseInt(date, 10) : undefined;
  const dayDate = date && date.length === 10 ? date : undefined;

  const ecbSet = new Set(Object.keys(await listEcbCurrencies()));
  const bothEcb = ecbSet.has(from) && ecbSet.has(to);

  // Annual-average for ECB pairs: average of the year's daily reference rates.
  if (bothEcb && yearOnly && yearOnly >= 1999) {
    const r = await getEcbAnnualAverage(from, to, yearOnly);
    return {
      amount, from, to,
      converted_amount: Number((amount * r.average).toFixed(6)),
      rate: Number(r.average.toFixed(8)),
      rate_date: String(yearOnly),
      method: `Annual average of ECB daily reference rates for ${yearOnly} (${r.days} trading days): ${amount} ${from} × ${r.average.toFixed(6)} = ${(amount * r.average).toFixed(4)} ${to}`,
      precision: "annual_average",
      citations: [ecbFxCitation(ctx, { base: from, quote: to, rateDate: `${yearOnly} (annual average)`, apiUrl: r.apiUrl })],
      notes: [],
    };
  }

  if (bothEcb && !yearOnly) {
    const r = await getEcbRates(from, [to], dayDate);
    const rate = r.rates[to];
    if (rate == null) throw new ToolError(`ECB rate ${from}→${to} unavailable.`, { from, to });
    const notes: string[] = [];
    if (dayDate && r.date !== dayDate) {
      notes.push(`Requested ${dayDate}; nearest ECB working day is ${r.date} (weekends/holidays have no reference rate).`);
    }
    return {
      amount, from, to,
      converted_amount: Number((amount * rate).toFixed(6)),
      rate, rate_date: r.date,
      method: `ECB euro reference rates (cross-rate via EUR where needed): ${amount} ${from} × ${rate} = ${(amount * rate).toFixed(4)} ${to}`,
      precision: "daily",
      citations: [ecbFxCitation(ctx, { base: from, quote: to, rateDate: r.date, apiUrl: r.apiUrl })],
      notes,
    };
  }

  // Annual / exotic path: bridge through USD using WB official annual averages
  // (and ECB daily for the ECB-covered leg when no year was forced).
  const notes: string[] = [];
  const citations: Citation[] = [];
  let precision: FxResult["precision"] = "annual_average";
  let rateDate = "";

  async function usdPerUnit(cur: string): Promise<number> {
    if (cur === "USD") return 1;
    if (ecbSet.has(cur) && !yearOnly) {
      const r = await getEcbRates(cur, ["USD"], dayDate);
      citations.push(ecbFxCitation(ctx, { base: cur, quote: "USD", rateDate: r.date, apiUrl: r.apiUrl }));
      rateDate = rateDate || r.date;
      return r.rates.USD;
    }
    const wb = await wbUsdPerUnit(ctx, cur, yearOnly);
    if (wb.citation) citations.push(wb.citation);
    rateDate = rateDate || wb.period;
    return wb.usdPerUnit;
  }

  const fromUsd = await usdPerUnit(from);
  const toUsd = await usdPerUnit(to);
  const rate = fromUsd / toUsd;
  const usedEcbLeg = (ecbSet.has(from) || ecbSet.has(to)) && !yearOnly && from !== "USD" && to !== "USD";
  if (usedEcbLeg) precision = "mixed";
  notes.push(
    yearOnly
      ? `Annual-average official exchange rates for ${yearOnly} (World Bank PA.NUS.FCRF); daily precision is not available on this path.`
      : "One or both currencies are outside the ECB daily set; converted via USD using the latest annual-average official rate(s). For pegged currencies (e.g. BBD at 2.00/USD, XCD at 2.70/USD) this is exact.",
  );
  if (precision === "mixed") notes.push("Mixed precision: one leg is a daily ECB rate, the other an annual average — treat the result as approximate.");

  return {
    amount, from, to,
    converted_amount: Number((amount * rate).toFixed(6)),
    rate: Number(rate.toFixed(8)),
    rate_date: rateDate || (yearOnly ? String(yearOnly) : "latest available"),
    method: `USD bridge: 1 ${from} = ${fromUsd.toFixed(6)} USD; 1 ${to} = ${toUsd.toFixed(6)} USD; rate = ${fromUsd.toFixed(6)}/${toUsd.toFixed(6)}`,
    precision,
    citations,
    notes,
  };
}
