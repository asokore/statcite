// fx_convert's rate_decimal and legs[].kind. rate_decimal is the rate as an
// exact decimal string: on the direct ECB path the upstream number written out
// in plain notation (R1), and on every computed path the exact fraction of the
// inputs as received, rounded once, half to even, to max(8, 11 - e) places
// (R2). The worked cases follow the table in the OpenSuite rates design note.
// Every figure here is invented, as are the pegged currencies P and Q, which
// exist only as figures passed to bridgeDecimal.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fxConvert, type FxResult } from "../src/core/fx.ts";
import {
  RATE_DECIMAL_PATTERN,
  averageDecimal,
  bridgeDecimal,
  decimalFromFraction,
  plainDecimal,
} from "../src/core/rate-decimal.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import type { Ctx } from "../src/core/types.ts";

const ctx: Ctx = { baseUrl: "https://statcite.test", now: () => new Date("2026-11-15T12:00:00Z") };

const frankfurterCurrencies = { EUR: "Euro", GBP: "British Pound", USD: "United States Dollar" };

function wbBody(iso3: string, iso2: string, name: string, value: number) {
  return JSON.stringify([
    { page: 1, pages: 1, per_page: 50, total: 1, sourceid: "2", lastupdated: "2026-07-13" },
    [{
      indicator: { id: "PA.NUS.FCRF", value: "Official exchange rate (LCU per US$, period average)" },
      country: { id: iso2, value: name },
      countryiso3code: iso3,
      date: "2025",
      value,
      unit: "",
      obs_status: "",
      decimal: 2,
    }],
  ]);
}

// Bodies are raw JSON text, so a figure can be written as a source prints it
// (1.0850) and reach the service as the number JSON.parse makes of it.
const routes: Array<{ test: (u: string) => boolean; body: string }> = [
  { test: (u) => u.includes("frankfurter.dev/v1/currencies"), body: JSON.stringify(frankfurterCurrencies) },
  { test: (u) => u.includes("frankfurter.dev/v1/latest?base=EUR&symbols=USD"), body: '{"base":"EUR","date":"2026-11-13","rates":{"USD":1.0857}}' },
  { test: (u) => u.includes("frankfurter.dev/v1/2024-01-02?base=EUR&symbols=USD"), body: '{"base":"EUR","date":"2024-01-02","rates":{"USD":1.0850}}' },
  { test: (u) => u.includes("frankfurter.dev/v1/2024-01-03?base=EUR&symbols=GBP"), body: '{"base":"EUR","date":"2024-01-03","rates":{"GBP":0.00000065}}' },
  { test: (u) => u.includes("frankfurter.dev/v1/2024-01-04?base=EUR&symbols=GBP"), body: '{"base":"EUR","date":"2024-01-04","rates":{"GBP":0}}' },
  {
    test: (u) => u.includes("frankfurter.dev/v1/2023-01-01..2023-12-31?base=EUR&symbols=USD"),
    body: '{"rates":{"2023-01-02":{"USD":1.0801},"2023-01-03":{"USD":1.0812},"2023-01-04":{"USD":1.083}}}',
  },
  // The exact mean is 1.080000000505, a tie at 11 places. The binary mean is
  // 1.0800000005050001, just above it.
  {
    test: (u) => u.includes("frankfurter.dev/v1/2021-01-01..2021-12-31?base=EUR&symbols=USD"),
    body: '{"rates":{"2021-01-04":{"USD":1.08000000101},"2021-01-05":{"USD":1.08}}}',
  },
  {
    test: (u) => u.includes("frankfurter.dev/v1/2022-01-01..2022-12-31?base=EUR&symbols=USD"),
    body: '{"rates":{"2022-01-03":{"USD":1.08},"2022-01-04":{"USD":0}}}',
  },
  // W, published at 3 units per dollar (rows 9 and 9b).
  { test: (u) => u.includes("api.worldbank.org") && u.includes("/JAM/"), body: wbBody("JAM", "JM", "Jamaica", 3) },
  // 1 / 139.74 sits close enough to a tie that starting from the binary
  // reciprocal moves the twelfth significant digit.
  { test: (u) => u.includes("api.worldbank.org") && u.includes("/KEN/"), body: wbBody("KEN", "KE", "Kenya", 139.74) },
  // 1 / 0.262144 is exactly 3.814697265625, a tie at 11 places.
  { test: (u) => u.includes("api.worldbank.org") && u.includes("/GHA/"), body: wbBody("GHA", "GH", "Ghana", 0.262144) },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("/SYR/"), body: wbBody("SYR", "SY", "Syrian Arab Republic", 0) },
];

beforeEach(() => {
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((r) => r.test(url));
    if (!route) return new Response(JSON.stringify({ error: "no fixture for " + url }), { status: 599 });
    return new Response(route.body, { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

function assertGrammar(s: string | undefined, label: string): asserts s is string {
  assert.equal(typeof s, "string", `${label}: rate_decimal missing`);
  assert.match(s as string, RATE_DECIMAL_PATTERN, `${label}: ${s}`);
  assert.notEqual(s, "0", label);
}
const kinds = (r: FxResult) => r.legs?.map((l) => l.kind);

// ---- the worked table, end to end where the inputs come from an upstream ----

test("row 1: ECB euro to dollar passes the upstream number through (R1)", async () => {
  const r = await fxConvert(ctx, 1, "EUR", "USD");
  assert.equal(r.rate, 1.0857);
  assert.equal(r.rate_decimal, "1.0857");
  assert.equal(r.precision, "daily");
  assert.equal(r.legs, undefined);
});

test("row 1b: a figure published as 1.0850 reaches the service as 1.085 and stays 1.085", async () => {
  const r = await fxConvert(ctx, 1, "EUR", "USD", "2024-01-02");
  assert.equal(r.rate, 1.085);
  assert.equal(r.rate_decimal, "1.085");
  assert.equal(r.precision, "daily");
});

test("row 1c: a number whose toString is 6.5e-7 is written in plain notation", async () => {
  const r = await fxConvert(ctx, 1, "EUR", "GBP", "2024-01-03");
  assert.equal(String(r.rate), "6.5e-7");
  assert.equal(r.rate_decimal, "0.00000065");
});

test("row 4: an ECB annual average is the exact mean, rounded once", async () => {
  const r = await fxConvert(ctx, 1, "EUR", "USD", "2023");
  assert.equal(r.rate, 1.08143333);
  assert.equal(r.precision, "annual_average");
  assert.equal(r.rate_decimal, "1.08143333333");
});

test("an annual average is the exact sum over the count, never the binary mean", async () => {
  const r = await fxConvert(ctx, 1, "EUR", "USD", "2021");
  assert.equal(r.rate_decimal, "1.0800000005", "the exact tie keeps the even 0");
});

test("row 9: dollar to W, a World Bank leg of 1 dollar over 3 units", async () => {
  const r = await fxConvert(ctx, 1, "USD", "JMD");
  assert.equal(r.rate, 3);
  assert.equal(r.precision, "annual_average");
  assert.deepEqual(kinds(r), ["identity", "wb"]);
  assert.equal(r.rate_decimal, "3");
});

test("row 9b: W to dollar is one third, from the published 3, not its binary reciprocal", async () => {
  const r = await fxConvert(ctx, 1, "JMD", "USD");
  assert.equal(r.rate, 0.33333333);
  assert.equal(r.precision, "annual_average");
  assert.deepEqual(kinds(r), ["wb", "identity"]);
  assert.equal(r.rate_decimal, "0.333333333333");
});

test("row 8: ECB plus World Bank is mixed, marked ecb and wb, and filled by R2", async () => {
  const r = await fxConvert(ctx, 1, "EUR", "KES");
  assert.equal(r.precision, "mixed");
  assert.deepEqual(kinds(r), ["ecb", "wb"]);
  assert.equal(r.rate_decimal, "151.715718", "1.0857 x 139.74 exactly");
});

test("a World Bank leg starts from the published figure, never the binary reciprocal", async () => {
  const r = await fxConvert(ctx, 1, "KES", "USD");
  assert.equal(r.legs?.[0].usd_per_unit, 1 / 139.74, "usd_per_unit is unchanged");
  // Exact 1 / 139.74 = 0.007156147130385..., while the reciprocal's own digits give ...38.
  assert.equal(r.rate_decimal, "0.00715614713039");
});

test("an exact tie on a World Bank leg rounds half to even", async () => {
  const r = await fxConvert(ctx, 1, "GHS", "USD");
  assert.equal(r.rate_decimal, "3.81469726562", "3.814697265625 keeps the even 2");
});

// ---- the worked table, rows whose inputs are a peg or an exact result ----

const P = { usd: 1, units: 2.5 };   // P fixed at 2.5 per dollar
const Q = { usd: 1.3, units: 1 };   // Q fixed at 1.3 dollars per unit
const USD = { usd: 1, units: 1 };
const ECB_EUR = { usd: 1.0857, units: 1 };

test("rows 2, 2b, 3 and 3b: peg and ECB-plus-peg bridges", () => {
  assert.equal(bridgeDecimal(USD, P), "2.5", "row 2");
  assert.equal(bridgeDecimal(USD, Q), "0.769230769231", "row 2b");
  assert.equal(bridgeDecimal(ECB_EUR, P), "2.71425", "row 3");
  assert.equal(bridgeDecimal(ECB_EUR, Q), "0.835153846154", "row 3b");
});

test("rows 5, 6 and 7: a large figure keeps 8 places, a whole number keeps its zeros", () => {
  const five = decimalFromFraction(16000123456749n, 10n ** 9n);
  assert.equal(five, "16000.12345675", "row 5");
  assert.notEqual(five, "16000.1234567", "row 7: twelve significant digits would lose the eighth place");
  assert.equal(decimalFromFraction(150n, 1n), "150", "row 6");
  assert.equal(decimalFromFraction(1500n, 10n), "150", "row 6 as a fraction with a power of ten below");
});

test("row 10: a near tie is rounded once, so it goes up", () => {
  // 0.1234567890125 plus 1 in the 45th place.
  const num = 1234567890125n * 10n ** 32n + 1n;
  assert.equal(decimalFromFraction(num, 10n ** 45n), "0.123456789013");
});

test("exact ties round half to even", () => {
  assert.equal(decimalFromFraction(1234567890125n, 10n ** 13n), "0.123456789012", "even digit stays");
  assert.equal(decimalFromFraction(1234567890135n, 10n ** 13n), "0.123456789014", "odd digit goes up");
});

test("pegs on file are marked peg and give the parity's exact decimal", async () => {
  const usdBbd = await fxConvert(ctx, 1, "USD", "BBD");
  assert.deepEqual(kinds(usdBbd), ["identity", "peg"]);
  assert.equal(usdBbd.precision, "fixed_peg");
  assert.equal(usdBbd.rate_decimal, "2");
  const kydUsd = await fxConvert(ctx, 1, "KYD", "USD");
  assert.equal(kydUsd.rate_decimal, "1.2");
  const bbdXcd = await fxConvert(ctx, 1, "BBD", "XCD");
  assert.deepEqual(kinds(bbdXcd), ["peg", "peg"]);
  assert.equal(bbdXcd.rate_decimal, "1.35");
  const xcdBbd = await fxConvert(ctx, 1, "XCD", "BBD");
  assert.equal(xcdBbd.rate, 0.74074074, "rate is unchanged");
  assert.equal(xcdBbd.rate_decimal, "0.740740740741");
  const eurBbd = await fxConvert(ctx, 1, "EUR", "BBD");
  assert.equal(eurBbd.precision, "mixed");
  assert.deepEqual(kinds(eurBbd), ["ecb", "peg"]);
  assert.equal(eurBbd.rate_decimal, "2.1714");
});

test("identical currencies give rate_decimal 1", async () => {
  const r = await fxConvert(ctx, 5, "EUR", "EUR");
  assert.equal(r.rate_decimal, "1");
});

// ---- grammar ----

test("every rate_decimal returned above matches the grammar and is never 0", async () => {
  const calls: Array<[string, string, string?]> = [
    ["EUR", "USD"], ["EUR", "USD", "2024-01-02"], ["EUR", "GBP", "2024-01-03"], ["EUR", "USD", "2023"], ["EUR", "USD", "2021"],
    ["USD", "JMD"], ["JMD", "USD"], ["EUR", "KES"], ["KES", "USD"], ["GHS", "USD"],
    ["USD", "BBD"], ["BBD", "XCD"], ["XCD", "BBD"], ["EUR", "BBD"], ["EUR", "EUR"],
  ];
  for (const [from, to, date] of calls) {
    const r = await fxConvert(ctx, 1, from, to, date);
    assertGrammar(r.rate_decimal, `${from}->${to} ${date ?? ""}`);
  }
});

test("R1 keeps exactly the digits of Number::toString, in plain notation", () => {
  const cases: Array<[number, string]> = [
    [1.085, "1.085"], [6.5e-7, "0.00000065"], [1e-7, "0.0000001"], [1.5e21, "1500000000000000000000"],
    [1e21, "1000000000000000000000"], [150, "150"], [0.1, "0.1"], [123.456, "123.456"], [5e-324, "0." + "0".repeat(323) + "5"],
  ];
  for (const [n, want] of cases) assert.equal(plainDecimal(n), want, String(n));
  for (const n of [1.085, 6.5e-7, 1e-7, 1.5e21, 0.1, 123.456, 2 / 3, Math.PI, 1e-300, 1.7976931348623157e308]) {
    const s = plainDecimal(n);
    assertGrammar(s, String(n));
    assert.equal(Number(s), n, `${n} must round-trip`);
  }
});

test("R2 output matches the grammar across many magnitudes and stays within half a unit of the last place", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 400; i++) {
    const num = BigInt(Math.floor(rand() * 1e9) + 1) * 10n ** BigInt(Math.floor(rand() * 12));
    const den = BigInt(Math.floor(rand() * 1e9) + 1) * 10n ** BigInt(Math.floor(rand() * 12));
    const s = decimalFromFraction(num, den);
    assertGrammar(s, `${num}/${den}`);
    const [int, frac = ""] = s.split(".");
    // The leading-digit exponent of num/den, found by stepping.
    const atLeast = (k: number) => (k >= 0 ? num >= den * 10n ** BigInt(k) : num * 10n ** BigInt(-k) >= den);
    let e = 0;
    while (atLeast(e + 1)) e++;
    while (!atLeast(e)) e--;
    const places = Math.max(8, 11 - e);
    assert.ok(frac.length <= places, `${s} has more than ${places} places`);
    const scaled = BigInt(int + frac.padEnd(places, "0"));
    // |s - num/den| <= 1/2 * 10^-places, in integers.
    const diff = scaled * den - num * 10n ** BigInt(places);
    assert.ok(2n * (diff < 0n ? -diff : diff) <= den, `${num}/${den} -> ${s}`);
  }
});

// ---- omission ----

test("a needed input that is zero, negative, infinite or missing leaves the field out", () => {
  for (const bad of [0, -2, Infinity, -Infinity, NaN, undefined, null]) {
    assert.equal(plainDecimal(bad as number), undefined, String(bad));
    assert.equal(bridgeDecimal({ usd: bad as number, units: 1 }, USD), undefined, `usd ${bad}`);
    assert.equal(bridgeDecimal(USD, { usd: 1, units: bad as number }), undefined, `units ${bad}`);
    assert.equal(averageDecimal([1.08, bad as number]), undefined, `average with ${bad}`);
  }
  assert.equal(averageDecimal([]), undefined, "no days");
  assert.equal(decimalFromFraction(0n, 1n), undefined);
  assert.equal(decimalFromFraction(1n, 0n), undefined);
});

test("an upstream zero or a missing leg leaves rate_decimal out of the response", async () => {
  const zero = await fxConvert(ctx, 1, "EUR", "GBP", "2024-01-04");
  assert.equal(zero.rate, 0);
  assert.ok(!("rate_decimal" in zero), JSON.stringify(zero));
  const wbZero = await fxConvert(ctx, 1, "SYP", "USD");
  assert.ok(!("rate_decimal" in wbZero), "a World Bank figure of 0 has no exact reciprocal");
  const avgZero = await fxConvert(ctx, 1, "EUR", "USD", "2022");
  assert.ok(!("rate_decimal" in avgZero), "an average over a day at 0");
});

test("kind and rate_decimal add fields and change none", async () => {
  const r = await fxConvert(ctx, 100, "EUR", "KES");
  assert.deepEqual(Object.keys(r.legs![0]).sort(), ["currency", "kind", "period", "source", "usd_per_unit"]);
  assert.equal(r.legs![1].usd_per_unit, 1 / 139.74);
  assert.equal(r.rate, 151.715718);
});
