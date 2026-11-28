// fx_convert with legal fixed US dollar pegs (core/pegs.ts). A pegged leg uses
// the published parity exactly, cites the issuing authority, makes no World
// Bank call, and never dates or stales the result. Before a peg's effective
// date the leg falls back to the World Bank annual average and says why.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fxConvert } from "../src/core/fx.ts";
import { USD_PEGS, pegDecision } from "../src/core/pegs.ts";
import { SOURCES } from "../src/core/sources.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import type { Ctx } from "../src/core/types.ts";
import { ToolError } from "../src/core/types.ts";

// The clock is fixed so the future-date rule and the no-date rate_date are
// deterministic.
const TODAY = "2026-11-15";
const ctx: Ctx = { baseUrl: "https://statcite.test", now: () => new Date(`${TODAY}T12:00:00Z`) };
const ctxAt = (iso: string): Ctx => ({ baseUrl: "https://statcite.test", now: () => new Date(`${iso}T12:00:00Z`) });

const frankfurterCurrencies = {
  AUD: "Australian Dollar", CAD: "Canadian Dollar", CHF: "Swiss Franc", EUR: "Euro",
  GBP: "British Pound", JPY: "Japanese Yen", USD: "United States Dollar",
};

function wbRow(iso3: string, iso2: string, name: string, date: string, value: number) {
  return {
    indicator: { id: "PA.NUS.FCRF", value: "Official exchange rate (LCU per US$, period average)" },
    country: { id: iso2, value: name },
    countryiso3code: iso3,
    date,
    value,
    unit: "",
    obs_status: "",
    decimal: 2,
  };
}
const wbHeader = { page: 1, pages: 1, per_page: 50, total: 4, sourceid: "2", lastupdated: "2026-07-13" };

// Illustrative values. The annual average deliberately differs from the peg
// in the last decimal, which is the noise the peg rail exists to remove.
const wbBrb = [wbHeader, [
  wbRow("BRB", "BB", "Barbados", "2025", 2.0000001),
  wbRow("BRB", "BB", "Barbados", "1976", 2.0000001),
  wbRow("BRB", "BB", "Barbados", "1975", 2.0214),
  wbRow("BRB", "BB", "Barbados", "1970", 2.0),
]];
const wbJam = [wbHeader, [wbRow("JAM", "JM", "Jamaica", "2025", 158.2), wbRow("JAM", "JM", "Jamaica", "2020", 142.75)]];
const wbSyr = [wbHeader, [wbRow("SYR", "SY", "Syrian Arab Republic", "2022", 2512.5)]];
const wbCym = [wbHeader, [wbRow("CYM", "KY", "Cayman Islands", "2002", 0.83333)]];
const wbBhs = [wbHeader, [wbRow("BHS", "BS", "Bahamas, The", "1973", 0.9871)]];

let fetched: string[] = [];
const routes: Array<{ test: (u: string) => boolean; body: () => unknown }> = [
  { test: (u) => u.includes("api.frankfurter.dev/v1/currencies"), body: () => frankfurterCurrencies },
  { test: (u) => u.includes("api.frankfurter.dev/v1/latest") && u.includes("base=EUR"), body: () => ({ base: "EUR", date: "2026-11-13", rates: { USD: 1.1 } }) },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/BRB/"), body: () => wbBrb },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/JAM/"), body: () => wbJam },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/SYR/"), body: () => wbSyr },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/CYM/"), body: () => wbCym },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/BHS/"), body: () => wbBhs },
  // A Saturday: Frankfurter answers with the Friday before.
  { test: (u) => u.includes("api.frankfurter.dev/v1/2024-03-16") && u.includes("base=EUR"), body: () => ({ base: "EUR", date: "2024-03-15", rates: { USD: 1.0890 } }) },
];

beforeEach(() => {
  _clearMemCache();
  fetched = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    fetched.push(url);
    const route = routes.find((r) => r.test(url));
    if (!route) return new Response(JSON.stringify({ error: "no fixture for " + url }), { status: 599 });
    return new Response(JSON.stringify(route.body()), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

const wbCalls = () => fetched.filter((u) => u.includes("api.worldbank.org"));
const OLD_SENTENCE = /normally equals the peg|follows the peg rate/;

test("BBD to XCD is exactly 1.35, cites both pegs, and touches no upstream", async () => {
  const r = await fxConvert(ctx, 100, "BBD", "XCD");
  assert.equal(r.rate, 1.35);
  assert.equal(r.converted_amount, 135);
  assert.equal(r.precision, "fixed_peg");
  assert.deepEqual(r.citations.map((c) => c.series_id), ["peg/BBDUSD", "peg/XCDUSD"]);
  assert.deepEqual(r.citations.map((c) => c.source), ["Central Bank of Barbados", "Eastern Caribbean Central Bank"]);
  assert.ok(r.citations.every((c) => c.citation_text.includes(c.source_url)), "each peg citation links its source");
  assert.equal(wbCalls().length, 0, `World Bank was called: ${wbCalls().join(", ")}`);
  assert.equal(fetched.length, 0, `no upstream call is needed for two pegs: ${fetched.join(", ")}`);
  assert.ok(r.notes.some((n) => /uses the legal peg\(s\) and is exact/.test(n)), JSON.stringify(r.notes));
  assert.ok(!r.notes.some((n) => OLD_SENTENCE.test(n)), JSON.stringify(r.notes));
  assert.deepEqual(r.legs?.map((l) => [l.currency, l.usd_per_unit, l.peg?.parity]), [
    ["BBD", 0.5, "USD1.00 to BBD2.00"],
    ["XCD", 1 / 2.7, "EC$2.70 to US$1.00"],
  ]);
  assert.match(r.method, /legal peg/);
});

test("the reverse pair is the exact reciprocal", async () => {
  const r = await fxConvert(ctx, 135, "XCD", "BBD");
  assert.equal(r.converted_amount, 100);
  assert.equal(r.rate, Number((2 / 2.7).toFixed(8)));
});

test("USD to a pegged currency is the parity, with the authority's citation and no World Bank call", async () => {
  const r = await fxConvert(ctx, 100, "USD", "BBD");
  assert.equal(r.converted_amount, 200);
  assert.equal(r.precision, "fixed_peg");
  assert.equal(r.citations.length, 1);
  assert.equal(r.citations[0].source, "Central Bank of Barbados");
  assert.equal(wbCalls().length, 0);
  assert.ok(!r.notes.some((n) => OLD_SENTENCE.test(n)));
  const k = await fxConvert(ctx, 1, "KYD", "USD");
  assert.equal(k.rate, 1.2, "KYD is published as CI$1.00 = US$1.20");
});

test("QAR, OMR and SAR are exact, each in the direction its authority prints, with no upstream call", async () => {
  const q = await fxConvert(ctx, 100, "USD", "QAR", "2002");
  assert.equal(q.converted_amount, 364, "QR 3.64 per USD");
  assert.equal(q.precision, "fixed_peg");
  assert.deepEqual(q.citations.map((c) => c.source), ["Qatar Central Bank"]);
  const o = await fxConvert(ctx, 1, "OMR", "USD", "1987");
  assert.equal(o.rate, 2.6008, "USD 2.6008 per RO, kept in dollars per rial");
  assert.deepEqual(o.citations.map((c) => c.source), ["Central Bank of Oman"]);
  const s = await fxConvert(ctx, 1, "USD", "SAR", "1987");
  assert.equal(s.rate, 3.75);
  assert.deepEqual(s.citations.map((c) => c.source), ["Saudi Central Bank"]);
  const cross = await fxConvert(ctx, 1, "OMR", "QAR", "2010");
  assert.equal(cross.rate, Number((2.6008 * 3.64).toFixed(8)));
  assert.equal(cross.precision, "fixed_peg");
  assert.equal(fetched.length, 0, `no upstream call is needed: ${fetched.join(", ")}`);
});

test("a start given as a month or a year covers whole years only from the first full year after it", () => {
  // QAR: July 2001. OMR and SAR: 1986. BSD: 1973.
  for (const [cur, startYear, firstWhole, firstDay] of [
    ["QAR", "2001", "2002", "2001-08-01"],
    ["OMR", "1986", "1987", "1987-01-01"],
    ["SAR", "1986", "1987", "1987-01-01"],
    ["BSD", "1973", "1974", "1974-01-01"],
  ] as const) {
    const before = pegDecision(cur, startYear, TODAY);
    assert.equal(before?.applies, false, `${cur} ${startYear} must not be treated as whole`);
    assert.equal(before?.applies === false && before.why, "before");
    assert.equal(pegDecision(cur, firstWhole, TODAY)?.applies, true, `${cur} ${firstWhole}`);
    assert.equal(pegDecision(cur, firstDay, TODAY)?.applies, true, `${cur} ${firstDay}`);
  }
  assert.equal(pegDecision("QAR", "2001-07-31", TODAY)?.applies, false, "a day inside the start month may precede the fixing");
});

test("a dated request on or after the effective date still uses the peg", async () => {
  const y = await fxConvert(ctx, 100, "BBD", "XCD", "2024");
  assert.equal(y.rate, 1.35);
  assert.equal(y.rate_date, "2024");
  const d = await fxConvert(ctx, 100, "BBD", "USD", "1975-07-05");
  assert.equal(d.rate, 0.5);
  assert.equal(d.precision, "fixed_peg");
  assert.equal(d.rate_date, "1975-07-05");
  const whole = await fxConvert(ctx, 100, "BBD", "USD", "1976");
  assert.equal(whole.precision, "fixed_peg");
  assert.equal(wbCalls().length, 0);
});

test("a year before the peg falls back to the World Bank with a note", async () => {
  const r = await fxConvert(ctx, 100, "BBD", "USD", "1970");
  assert.equal(r.precision, "annual_average");
  assert.equal(r.citations[0].series_id, "PA.NUS.FCRF");
  assert.ok(r.notes.some((n) => /not applied to the whole of 1970/.test(n) && /in force since 5 July 1975/.test(n)), JSON.stringify(r.notes));
  assert.equal(r.legs?.[0].source, "World Bank PA.NUS.FCRF annual average");
  assert.equal(r.legs?.[0].peg, undefined);
  assert.ok(wbCalls().length > 0);
});

test("the peg's own year is not whole, so it also falls back", async () => {
  const r = await fxConvert(ctx, 100, "BBD", "USD", "1975");
  assert.equal(r.precision, "annual_average");
  assert.ok(Math.abs(r.rate - 1 / 2.0214) < 1e-6);
  assert.ok(r.notes.some((n) => /not applied to the whole of 1975/.test(n)));
});

test("a day before the peg falls back to the World Bank with a note", async () => {
  const r = await fxConvert(ctx, 100, "BBD", "USD", "1975-07-04");
  assert.equal(r.precision, "annual_average");
  assert.ok(r.notes.some((n) => /not applied to 1975-07-04/.test(n)), JSON.stringify(r.notes));
  assert.ok(wbCalls().length > 0);
});

test("a pegged leg with an ECB daily leg is mixed, with the peg leg exact", async () => {
  const r = await fxConvert(ctx, 100, "BBD", "EUR");
  assert.equal(r.precision, "mixed");
  assert.ok(Math.abs(r.rate - 0.5 / 1.1) < 1e-8, String(r.rate));
  assert.equal(r.legs?.find((l) => l.currency === "BBD")?.usd_per_unit, 0.5);
  assert.equal(r.rate_date, "2026-11-13");
  assert.equal(wbCalls().length, 0);
  assert.ok(r.notes.some((n) => /legal fixed peg/.test(n) && /exact/.test(n)), JSON.stringify(r.notes));
  // The ECB+WB wording would be false here: there is no annual average.
  assert.ok(!r.notes.some((n) => /annual average/.test(n)), JSON.stringify(r.notes));
  assert.deepEqual(r.citations.map((c) => c.source), ["Central Bank of Barbados", "European Central Bank"]);
});

test("a pegged leg with a World Bank leg stays annual_average and keeps the WB note", async () => {
  const r = await fxConvert(ctx, 100, "BBD", "JMD");
  assert.equal(r.precision, "annual_average");
  assert.ok(Math.abs(r.rate - 0.5 * 158.2) < 1e-6);
  assert.equal(r.rate_date, "2025");
  assert.ok(r.notes.some((n) => /latest annual-average official rate/.test(n)));
  assert.ok(!r.notes.some((n) => OLD_SENTENCE.test(n)));
  assert.ok(!r.notes.some((n) => /Leg periods differ/.test(n)), JSON.stringify(r.notes));
});

test("a pegged leg is never chosen as the stalest leg", async () => {
  const r = await fxConvert(ctx, 100, "BBD", "SYP");
  assert.equal(r.rate_date, "2022", JSON.stringify(r.notes));
  assert.ok(!r.notes.some((n) => /Leg periods differ/.test(n)), JSON.stringify(r.notes));
  assert.ok(!r.notes.some((n) => /BBD has no official rate/.test(n)), JSON.stringify(r.notes));
  const bbd = r.legs?.find((l) => l.currency === "BBD");
  assert.equal(bbd?.period, "1975-07-05");
  assert.ok(bbd?.peg);
});

// --- the peg is never applied to a future period -----------------------------

test("a future year or day never uses the peg", async () => {
  await assert.rejects(fxConvert(ctx, 100, "BBD", "USD", "2099"), /no data for 2099/);
  await assert.rejects(fxConvert(ctx, 100, "BBD", "XCD", "9999-12-31"), /no data for 9999/);
  await assert.rejects(fxConvert(ctx, 100, "BBD", "USD", "2026-11-16"), /no data for 2026/);
  assert.ok(wbCalls().length > 0, "a future date must go to the World Bank rail, not the peg");
});

test("a future period the World Bank cannot answer still says the peg exists and why it was not applied", async () => {
  for (const [from, to, date, cur] of [
    ["BBD", "USD", "2099", "BBD"],
    ["USD", "BBD", "2026", "BBD"],
    ["BBD", "USD", "2026-11-16", "BBD"],
  ] as const) {
    await assert.rejects(fxConvert(ctx, 100, from, to, date), (e: unknown) => {
      const err = e as ToolError;
      assert.ok(err instanceof ToolError, `${date}: not a ToolError`);
      assert.match(err.message, new RegExp(`^${cur} is fixed to the US dollar at `), `${date}: the peg is not named first`);
      assert.match(err.message, /not applied to a period that has not yet ended/);
      assert.match(err.message, /no data for \d{4}/, `${date}: the World Bank reason was dropped`);
      const d = err.details as Record<string, unknown>;
      const original = err.cause as ToolError;
      assert.ok(original instanceof ToolError, `${date}: the World Bank error is not kept as the cause`);
      // The World Bank coverage error carries no code, so equal codes prove
      // little. Its details are what a caller reads, so each must pass through.
      assert.equal(err.code, original.code, `${date}: the error code changed`);
      const kept = Object.entries(original.details ?? {});
      assert.ok(kept.length > 0, `${date}: the World Bank error has no details, so the pass-through check below would be empty`);
      for (const [k, v] of kept) assert.deepEqual((err.details as Record<string, unknown>)[k], v, `${date}: detail ${k} was not passed through`);
      assert.ok(err.message.endsWith(original.message), `${date}: the World Bank message was altered`);
      assert.deepEqual((d.peg_not_applied as Record<string, unknown>).currency, cur);
      assert.equal((d.peg_not_applied as Record<string, unknown>).why, "future");
      return true;
    });
  }
});

test("a currency with no peg gets the plain World Bank error for a future year", async () => {
  await assert.rejects(fxConvert(ctx, 100, "JMD", "USD", "2099"), (e: unknown) => {
    const err = e as ToolError;
    assert.doesNotMatch(err.message, /fixed to the US dollar/);
    assert.equal((err.details as Record<string, unknown> | undefined)?.peg_not_applied, undefined);
    return true;
  });
});

test("the current year is not whole, so it falls back, while today uses the peg", async () => {
  await assert.rejects(fxConvert(ctx, 100, "BBD", "XCD", "2026"), /no data for 2026/);
  assert.ok(wbCalls().length > 0, "the current year must go to the World Bank rail, not the peg");
  fetched = [];
  const d = await fxConvert(ctx, 100, "BBD", "XCD", TODAY);
  assert.equal(d.rate, 1.35);
  assert.equal(wbCalls().length, 0);
});

test("a future day falls back to the World Bank with a note when the World Bank has the year", async () => {
  // Clock in mid-2025, so 2025-12-01 is in the future but World Bank 2025 exists.
  const r = await fxConvert(ctxAt("2025-06-01"), 100, "BBD", "USD", "2025-12-01");
  assert.equal(r.precision, "annual_average");
  assert.equal(r.legs?.[0].peg, undefined);
  assert.ok(r.notes.some((n) => /after today's date, 2025-06-01/.test(n)), JSON.stringify(r.notes));
});

// --- dates, citations and wording ---------------------------------------------

test("with no date, a pure-peg result is dated today, not 'latest available'", async () => {
  assert.equal((await fxConvert(ctx, 100, "BBD", "XCD")).rate_date, TODAY);
  assert.equal((await fxConvert(ctx, 100, "USD", "BBD")).rate_date, TODAY);
});

test("a peg citation is dated the day its source was read, not the request day", async () => {
  const r = await fxConvert(ctxAt("2030-01-01"), 100, "USD", "BBD");
  const c = r.citations[0];
  assert.equal(c.retrieved_at, "2026-11-15");
  assert.match(c.citation_text, /Retrieved 2026-11-15 /);
  assert.ok(!c.citation_text.includes("2030"), c.citation_text);
});

test("a peg with an ECB leg on a weekend discloses the nearest ECB working day", async () => {
  const r = await fxConvert(ctx, 100, "BBD", "EUR", "2024-03-16");
  assert.equal(r.precision, "mixed");
  assert.equal(r.rate_date, "2024-03-15");
  assert.ok(r.notes.some((n) => /Requested 2024-03-16; nearest ECB working day is 2024-03-15/.test(n)), JSON.stringify(r.notes));
});

test("a source with no start date is described as confirming the peg only from its own date", async () => {
  const r = await fxConvert(ctx, 1, "KYD", "USD");
  const note = r.notes.find((n) => n.startsWith("KYD is converted"));
  assert.ok(note, JSON.stringify(r.notes));
  assert.match(note!, /confirmed by the cited source only from 2003-01-01/);
  assert.match(note!, /may be older/);
  assert.match(note!, /earlier dates use the World Bank rate/);
  assert.doesNotMatch(note!, /in force since/);
  assert.match(r.citations[0].citation_text, /confirmed by this source from 2003-01-01/);
  // A citation describes the source, never StatCite's own fallback rule.
  assert.doesNotMatch(r.citations[0].citation_text, /World Bank/);
  const b = await fxConvert(ctx, 1, "BBD", "USD");
  assert.ok(b.notes.some((n) => /in force since 5 July 1975/.test(n)), JSON.stringify(b.notes));
  for (const n of [...r.notes, ...b.notes, r.citations[0].citation_text]) {
    assert.doesNotMatch(n, /\([^)]*\(/, `nested brackets: ${n}`);
  }
});

test("BSD is 1 to 1 from 1974, cited to the Central Bank of The Bahamas, and falls back the day before", async () => {
  const r = await fxConvert(ctx, 100, "USD", "BSD", "1974");
  assert.equal(r.converted_amount, 100, "B$1 = US$1");
  assert.equal(r.precision, "fixed_peg");
  assert.deepEqual(r.citations.map((c) => c.source), ["Central Bank of The Bahamas"]);
  assert.equal(r.citations[0].series_id, "peg/BSDUSD");
  assert.match(r.citations[0].citation_text, /^Central Bank of The Bahamas, 40th Anniversary Newspaper Supplement, 10 June 2014: BSD fixed to the US dollar at B\$1 = US\$1, in force since 1973\. /);
  assert.ok(r.citations[0].citation_text.endsWith(" https://cdn.centralbankbahamas.com/tenantcbob_prod/assets/documents/2019-06-20-05-41-37-CBOBs-40th-Anniversary-Newspaper-Supplement-3-1776210645-o8XX3l.pdf"), r.citations[0].citation_text);
  assert.equal(r.citations[0].retrieved_at, "2026-11-27");
  const d = await fxConvert(ctx, 100, "BSD", "USD", "1974-01-01");
  assert.equal(d.precision, "fixed_peg");
  assert.equal(d.rate, 1);
  assert.equal(wbCalls().length, 0, `World Bank was called: ${wbCalls().join(", ")}`);
  const before = await fxConvert(ctx, 100, "BSD", "USD", "1973-12-31");
  assert.equal(before.precision, "annual_average");
  assert.ok(Math.abs(before.rate - 1 / 0.9871) < 1e-6, String(before.rate));
  assert.ok(before.notes.some((n) => /not applied to 1973-12-31/.test(n) && /in force since 1973/.test(n)), JSON.stringify(before.notes));
  assert.ok(wbCalls().some((u) => u.includes("/BHS/")), "the fallback must use the World Bank series for The Bahamas");
});

test("KYD is pegged from 2003-01-01, cited to CIMA's 18-month report, and falls back the day before", async () => {
  const start = await fxConvert(ctx, 1, "KYD", "USD", "2003-01-01");
  assert.equal(start.precision, "fixed_peg");
  assert.equal(start.rate, 1.2);
  assert.deepEqual(start.citations.map((c) => c.source), ["Cayman Islands Monetary Authority"]);
  assert.match(start.citations[0].citation_text, /^Cayman Islands Monetary Authority, 18-Month Report, January 1, 2003 to June 30, 2004: KYD fixed to the US dollar at one Cayman Islands dollar per 1\.20 U\.S\. dollars, confirmed by this source from 2003-01-01\. /);
  assert.ok(start.citations[0].citation_text.endsWith(" https://www.cima.ky/upimages/publicationdoc/AnnualReport-18M_1499165425.pdf"), start.citations[0].citation_text);
  assert.equal(start.citations[0].retrieved_at, "2026-11-27");
  const year = await fxConvert(ctx, 1, "KYD", "USD", "2003");
  assert.equal(year.precision, "fixed_peg");
  assert.equal(wbCalls().length, 0, `World Bank was called: ${wbCalls().join(", ")}`);
  const before = await fxConvert(ctx, 1, "KYD", "USD", "2002-12-31");
  assert.equal(before.precision, "annual_average");
  assert.ok(Math.abs(before.rate - 1 / 0.83333) < 1e-6, String(before.rate));
  assert.ok(before.notes.some((n) => /only from 2003-01-01/.test(n) && /not applied to 2002-12-31/.test(n)), JSON.stringify(before.notes));
  assert.ok(wbCalls().some((u) => u.includes("/CYM/")), "the fallback must use the World Bank series for the Cayman Islands");
});

test("KYD before its confirmed date falls back to the World Bank series for the Cayman Islands", async () => {
  const r = await fxConvert(ctx, 1, "KYD", "USD", "2002");
  assert.equal(r.precision, "annual_average");
  assert.ok(Math.abs(r.rate - 1 / 0.83333) < 1e-6);
  assert.ok(r.notes.some((n) => /only from 2003-01-01/.test(n) && /not applied to the whole of 2002/.test(n)), JSON.stringify(r.notes));
});

test("the licence ledger names every pegged currency and authority, and no other", () => {
  const entry = SOURCES.find((s) => s.id === "usd_pegs");
  assert.ok(entry, "usd_pegs must be in the ledger");
  assert.equal(entry!.license_verdict, "served");
  for (const p of USD_PEGS) {
    assert.ok(entry!.coverage.includes(`${p.currency} (${p.authority})`), `ledger coverage misses ${p.currency} (${p.authority})`);
  }
  const listed = [...entry!.coverage.matchAll(/\b([A-Z]{3}) \(/g)].map((m) => m[1]);
  assert.deepEqual(listed.sort(), USD_PEGS.map((p) => p.currency).sort(), "ledger coverage lists a currency the table does not hold");
});

test("the peg table holds only sourced hard pegs", () => {
  const codes = USD_PEGS.map((p) => p.currency);
  for (const banned of ["HKD", "ANG", "BHD", "AED"]) assert.ok(!codes.includes(banned), `${banned} must stay on the World Bank rail`);
  assert.equal(new Set(codes).size, codes.length, "duplicate currency in the peg table");
  for (const p of USD_PEGS) {
    assert.match(p.currency, /^[A-Z]{3}$/);
    assert.ok(p.lcu > 0 && p.usd > 0, p.currency);
    assert.match(p.effectiveFrom, /^\d{4}-\d{2}-\d{2}$/, p.currency);
    assert.ok(!Number.isNaN(Date.parse(p.effectiveFrom)), p.currency);
    assert.match(p.sourceUrl, /^https:\/\//, p.currency);
    assert.match(p.sourceRead, /^\d{4}-\d{2}-\d{2}$/, p.currency);
    assert.ok(p.authority && p.parityAsPublished, p.currency);
    assert.ok(p.effectiveFromAsPublished === null || p.effectiveFromAsPublished.length > 0, p.currency);
  }
  assert.equal(pegDecision("JMD", undefined, TODAY), undefined);
});

test("each peg cites its own authority's site, read on or before today", () => {
  // The issuing authority's own domain for each row. A swapped or mistyped
  // link fails here, as does a new row added without a reviewed domain.
  const HOSTS: Record<string, string> = {
    BBD: "www.centralbank.org.bb", XCD: "www.eccb-centralbank.org", BZD: "www.centralbank.org.bz",
    AWG: "www.cbaruba.org", BMD: "www.bma.bm", BSD: "cdn.centralbankbahamas.com", KYD: "www.cima.ky", SAR: "www.sama.gov.sa",
    QAR: "www.qcb.gov.qa", OMR: "cbo.gov.om",
  };
  assert.deepEqual(USD_PEGS.map((p) => p.currency).sort(), Object.keys(HOSTS).sort(), "a peg row has no reviewed authority domain");
  // The real clock, not the fixed test clock: a read date later than today is wrong.
  const realToday = new Date().toISOString().slice(0, 10);
  for (const p of USD_PEGS) {
    assert.equal(new URL(p.sourceUrl).host, HOSTS[p.currency], `${p.currency} source is not on its authority's site`);
    assert.ok(p.sourceRead <= realToday, `${p.currency} sourceRead ${p.sourceRead} is after today, ${realToday}`);
    assert.ok(p.effectiveFrom <= p.sourceRead, `${p.currency} effectiveFrom is after the day its source was read`);
  }
});
