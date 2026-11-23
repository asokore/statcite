// FX conversion with three rails:
//   1. ECB reference rates (daily, ~30 currencies) via Frankfurter — precise dates.
//   2. Legal fixed US dollar pegs (core/pegs.ts) for currencies whose issuing
//      authority publishes a hard parity, such as BBD and XCD. The parity is the
//      rate, so this leg is exact and cites the authority, not the World Bank.
//   3. World Bank official annual-average rates (PA.NUS.FCRF) for everything else —
//      including most Caribbean, African, and Asian currencies the ECB set lacks,
//      and for a pegged currency on a date before its peg took effect.
// Mixed pairs bridge through USD with an explicit method note.

import type { Citation, Ctx } from "./types.ts";
import { ToolError, today } from "./types.ts";
import { getEcbRates, getEcbAnnualAverage, listEcbCurrencies } from "../adapters/frankfurter.ts";
import { fetchWbSeries } from "../adapters/worldbank.ts";
import { ecbFxCitation, usdPegCitation, worldBankCitation } from "./citations.ts";
import { pegDecision, pegSinceText, type PegDecision } from "./pegs.ts";
import { averageDecimal, bridgeDecimal, plainDecimal, type LegFigures } from "./rate-decimal.ts";

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

export type FxLegKind = "identity" | "peg" | "ecb" | "wb";

/** One side of a USD-bridged conversion, with the period its rate came from.
 * Present only on the bridge path, where the two legs can be dated differently. */
export interface FxLeg {
  currency: string;
  /** What the leg is: the US dollar itself, a legal fixed peg, an ECB daily
   * reference rate, or a World Bank annual average. */
  kind: FxLegKind;
  usd_per_unit: number;
  /** null for the USD identity leg, which has no published rate. On a fixed-peg
   * leg it is the date from which the cited source places the peg in force. A
   * peg has no publication period to go stale, so that date never decides
   * rate_date and never counts as the stalest leg. */
  period: string | null;
  source: string;
  /** Present only on a fixed-peg leg: the parity as the authority publishes it. */
  peg?: { parity: string; effective_from: string; authority: string; source_url: string };
}

export interface FxResult {
  amount: number;
  from: string;
  to: string;
  converted_amount: number;
  rate: number;
  /** The same rate as an exact decimal string, built by the rules in
   * core/rate-decimal.ts. Absent when an input it needs is missing, not
   * finite, or zero or less. */
  rate_decimal?: string;
  rate_date: string;
  method: string;
  /** fixed_peg: every leg is the US dollar itself or a legal fixed peg against
   * it, so the conversion is exact. */
  precision: "daily" | "annual_average" | "mixed" | "fixed_peg";
  citations: Citation[];
  notes: string[];
  /** The two sides of a bridged rate. Absent on direct ECB conversions. */
  legs?: FxLeg[];
}

async function wbUsdPerUnit(
  ctx: Ctx,
  currency: string,
  year?: number,
): Promise<{ usdPerUnit: number; lcuPerUsd: number; period: string; citation?: Citation }> {
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
  // PA.NUS.FCRF is LCU per USD → USD per unit is the reciprocal. The published
  // figure is kept too, so rate_decimal can treat the leg as 1 dollar over
  // that many units rather than start from the binary reciprocal.
  return {
    usdPerUnit: 1 / (chosen.value as number),
    lcuPerUsd: chosen.value as number,
    period: chosen.period,
    citation: worldBankCitation(ctx, {
      indicatorId: wb.indicatorId,
      indicatorName: `${wb.indicatorName}, ${wb.countryName}`,
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
  if (date && date.length === 10) {
    // 2024-02-30 passes the pattern. Sent upstream it came back as a 502
    // "upstream problem" on ECB pairs and a silent 200 on pegged pairs.
    const [y, m, d] = date.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
      throw new ToolError(`'date' ${date} is not a real calendar date. Use YYYY-MM-DD or YYYY.`, { date });
    }
  }
  if (from === to) {
    return {
      amount, from, to, converted_amount: amount, rate: 1, rate_decimal: "1",
      rate_date: date ?? "n/a", method: "identical currencies", precision: "daily", citations: [], notes: [],
    };
  }

  const yearOnly = date && date.length === 4 ? parseInt(date, 10) : undefined;
  const dayDate = date && date.length === 10 ? date : undefined;

  const todayUtc = today(ctx);
  const fromPeg = pegDecision(from, date, todayUtc);
  const toPeg = pegDecision(to, date, todayUtc);
  const exactSide = (cur: string, d?: PegDecision) => cur === "USD" || d?.applies === true;
  // When both sides are the US dollar or an applicable peg, the answer needs no
  // upstream at all, so the ECB currency list is not fetched either.
  const ecbSet =
    exactSide(from, fromPeg) && exactSide(to, toPeg)
      ? new Set<string>()
      : new Set(Object.keys(await listEcbCurrencies()));
  const bothEcb = ecbSet.has(from) && ecbSet.has(to) && !fromPeg?.applies && !toPeg?.applies;

  // Annual-average for ECB pairs: average of the year's daily reference rates.
  if (bothEcb && yearOnly && yearOnly >= 1999) {
    const r = await getEcbAnnualAverage(from, to, yearOnly);
    const rateDecimal = averageDecimal(r.values);
    return {
      amount, from, to,
      converted_amount: Number((amount * r.average).toFixed(6)),
      rate: Number(r.average.toFixed(8)),
      ...(rateDecimal === undefined ? {} : { rate_decimal: rateDecimal }),
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
    if (typeof rate !== "number" || !Number.isFinite(rate)) throw new ToolError(`ECB rate ${from}→${to} unavailable.`, { from, to });
    const notes: string[] = [];
    if (dayDate && r.date !== dayDate) {
      notes.push(`Requested ${dayDate}; nearest ECB working day is ${r.date} (weekends/holidays have no reference rate).`);
    }
    const rateDecimal = plainDecimal(rate);
    return {
      amount, from, to,
      converted_amount: Number((amount * rate).toFixed(6)),
      rate,
      ...(rateDecimal === undefined ? {} : { rate_decimal: rateDecimal }),
      rate_date: r.date,
      method: `ECB euro reference rates (cross-rate via EUR where needed): ${amount} ${from} × ${rate} = ${(amount * rate).toFixed(4)} ${to}`,
      precision: "daily",
      citations: [ecbFxCitation(ctx, { base: from, quote: to, rateDate: r.date, apiUrl: r.apiUrl })],
      notes,
    };
  }

  // Annual / exotic path: bridge through USD using legal pegs where they apply,
  // WB official annual averages otherwise (and ECB daily for the ECB-covered
  // leg when no year was forced).
  const notes: string[] = [];
  const citations: Citation[] = [];
  let rateDate = "";
  const legs: FxLeg[] = [];
  const kinds: FxLegKind[] = [];
  const wbYear = yearOnly ?? (dayDate ? parseInt(dayDate.slice(0, 4), 10) : undefined);

  // Each leg is a ratio, US dollars over local units. A pegged leg keeps the
  // two figures its authority publishes, so a pair of pegs divides those
  // figures directly and BBD to XCD comes out at 2.7 / 2 = 1.35 exactly,
  // rather than through two rounded reciprocals.
  // `figures` holds the leg as received, for rate_decimal: on a World Bank leg
  // it is 1 dollar over the published units, where `usd` and `units` carry the
  // binary reciprocal.
  type Ratio = { usd: number; units: number; text: string; figures: LegFigures };
  async function usdLeg(cur: string, decision?: PegDecision): Promise<Ratio> {
    if (cur === "USD") {
      legs.push({ currency: "USD", kind: "identity", usd_per_unit: 1, period: null, source: "identity (USD bridge base)" });
      kinds.push("identity");
      return { usd: 1, units: 1, text: "1", figures: { usd: 1, units: 1 } };
    }
    if (decision?.applies) {
      const p = decision.peg;
      citations.push(usdPegCitation(p));
      // No rateDate from a peg: it has no publication period to date the result.
      legs.push({
        currency: cur,
        kind: "peg",
        usd_per_unit: p.usd / p.lcu,
        period: p.effectiveFrom,
        source: `Legal fixed peg, ${p.parityAsPublished} (${p.authority})`,
        peg: { parity: p.parityAsPublished, effective_from: p.effectiveFrom, authority: p.authority, source_url: p.sourceUrl },
      });
      kinds.push("peg");
      notes.push(
        `${cur} is converted at its legal fixed parity against the US dollar, ${p.parityAsPublished}, published by the ${p.authority} and ${pegSinceText(p)}. This leg is exact.`,
      );
      return { usd: p.usd, units: p.lcu, text: `${p.usd}/${p.lcu}`, figures: { usd: p.usd, units: p.lcu } };
    }
    if (decision && !decision.applies) notes.push(decision.reason);
    if (ecbSet.has(cur) && !yearOnly) {
      const r = await getEcbRates(cur, ["USD"], dayDate);
      const usdRate = r.rates?.USD;
      if (typeof usdRate !== "number" || !Number.isFinite(usdRate)) {
        throw new ToolError(`ECB rate ${cur}→USD unavailable${r.date ? ` for ${r.date}` : ""}, so the USD bridge cannot be built.`, r.date ? { currency: cur, date: r.date } : { currency: cur });
      }
      citations.push(ecbFxCitation(ctx, { base: cur, quote: "USD", rateDate: r.date, apiUrl: r.apiUrl }));
      rateDate = rateDate || r.date;
      // Same disclosure as the direct ECB path: a weekend or holiday date is
      // answered with the nearest earlier working day's reference rate.
      if (dayDate && r.date !== dayDate) {
        notes.push(`Requested ${dayDate}; nearest ECB working day is ${r.date} (weekends/holidays have no reference rate).`);
      }
      legs.push({ currency: cur, kind: "ecb", usd_per_unit: r.rates.USD, period: r.date, source: "ECB daily reference rate" });
      kinds.push("ecb");
      return { usd: r.rates.USD, units: 1, text: r.rates.USD.toFixed(6), figures: { usd: r.rates.USD, units: 1 } };
    }
    let wb: Awaited<ReturnType<typeof wbUsdPerUnit>>;
    try {
      wb = await wbUsdPerUnit(ctx, cur, wbYear);
    } catch (e) {
      // A peg skipped because the period has not ended usually meets a World
      // Bank gap too, since that year is not published yet. Whatever the World
      // Bank error is, the notes are lost with the throw, so the error itself
      // says the peg exists and why it was not applied, then gives the World
      // Bank's own message, code and details unchanged.
      if (decision && !decision.applies && decision.why === "future" && e instanceof ToolError) {
        const wrapped = new ToolError(
          `${decision.reason} ${e.message}`,
          { ...e.details, peg_not_applied: { currency: cur, parity: decision.peg.parityAsPublished, authority: decision.peg.authority, why: "future" } },
          e.code,
        );
        wrapped.cause = e;
        throw wrapped;
      }
      throw e;
    }
    if (wb.citation) citations.push(wb.citation);
    if (dayDate) {
      notes.push(
        `Requested ${dayDate}; daily precision is unavailable for ${cur}. Used the ${wb.period} annual-average official rate (World Bank PA.NUS.FCRF).`,
      );
    }
    rateDate = rateDate || wb.period;
    legs.push({ currency: cur, kind: "wb", usd_per_unit: wb.usdPerUnit, period: wb.period, source: "World Bank PA.NUS.FCRF annual average" });
    kinds.push("wb");
    return { usd: wb.usdPerUnit, units: 1, text: wb.usdPerUnit.toFixed(6), figures: { usd: 1, units: wb.lcuPerUsd } };
  }

  const f = await usdLeg(from, fromPeg);
  const t = await usdLeg(to, toPeg);
  const fromUsd = f.usd / f.units;
  const toUsd = t.usd / t.units;
  // (f.usd / f.units) / (t.usd / t.units), rearranged to divide once.
  const rate = (f.usd * t.units) / (f.units * t.usd);
  const rateDecimal = bridgeDecimal(f.figures, t.figures);
  const hasEcb = kinds.includes("ecb");
  const hasWb = kinds.includes("wb");
  const hasPeg = kinds.includes("peg");
  const precision: FxResult["precision"] =
    hasEcb && (hasWb || hasPeg) ? "mixed" : hasWb ? "annual_average" : hasEcb ? "daily" : "fixed_peg";
  if (hasWb && yearOnly) {
    notes.push(
      `Annual-average official exchange rates for ${yearOnly} (World Bank PA.NUS.FCRF); daily precision is not available on this path.`,
    );
  } else if (hasWb && !dayDate) {
    notes.push(
      "One or both currencies are outside the ECB daily set and have no legal US dollar peg on record here, so the conversion bridges through USD using the latest annual-average official rate(s) from the World Bank.",
    );
  }
  if (precision === "mixed") {
    notes.push(
      hasWb
        ? "Mixed precision: one leg is a daily ECB rate, the other an annual average, treat the result as approximate."
        : "Mixed precision: one leg is a daily ECB reference rate and the other a legal fixed peg. The peg leg is exact, so the result is as precise as the ECB reference rate for that day.",
    );
  }
  if (precision === "fixed_peg") {
    notes.push(
      "This conversion uses the legal peg(s) and is exact. No market, reference or averaged rate is involved.",
    );
  }
  // World Bank annual-average coverage ends in different years for different
  // currencies, so the two legs can be years apart. rate_date used to carry
  // whichever leg was resolved first, which dated the result to a year one side
  // of it never saw. A cross rate is only as current as its stalest leg.
  // A pegged leg is excluded: its period is the date the peg took effect, not a
  // publication period, and a peg in force today is not stale.
  const dated = legs.filter((l): l is FxLeg & { period: string } => typeof l.period === "string" && !l.peg);
  if (new Set(dated.map((l) => l.period.slice(0, 4))).size > 1) {
    const stalest = dated.reduce((a, b) => (a.period <= b.period ? a : b));
    rateDate = stalest.period;
    notes.push(
      `Leg periods differ: ${dated.map((l) => `${l.currency} ${l.period}`).join(", ")}. A cross rate is only as current as its stalest leg, so rate_date is ${stalest.period}: ${stalest.currency} has no official rate published after ${stalest.period.slice(0, 4)}. Treat the result as a ${stalest.period.slice(0, 4)} rate, not a current one.`,
    );
  }

  return {
    amount, from, to,
    converted_amount: Number((amount * rate).toFixed(6)),
    rate: Number(rate.toFixed(8)),
    ...(rateDecimal === undefined ? {} : { rate_decimal: rateDecimal }),
    // With no ECB or World Bank leg there is no publication date. A requested
    // date dates the result, and with none the pegs are in force as of today.
    rate_date: rateDate || (yearOnly ? String(yearOnly) : (dayDate ?? todayUtc)),
    method: hasPeg
      ? `USD bridge: 1 ${from} = ${f.text} USD${fromPeg?.applies ? ` (legal peg, ${fromPeg.peg.parityAsPublished})` : ""}; 1 ${to} = ${t.text} USD${toPeg?.applies ? ` (legal peg, ${toPeg.peg.parityAsPublished})` : ""}; rate = (${f.text}) / (${t.text}) = ${Number(rate.toFixed(8))}`
      : `USD bridge: 1 ${from} = ${fromUsd.toFixed(6)} USD; 1 ${to} = ${toUsd.toFixed(6)} USD; rate = ${fromUsd.toFixed(6)}/${toUsd.toFixed(6)}`,
    precision,
    citations,
    notes,
    legs,
  };
}
