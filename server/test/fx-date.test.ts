// fx_convert date handling on the World-Bank-annual path: a YYYY-MM-DD request
// must select that year's annual rate (not the latest) and disclose the substitution.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fxConvert } from "../src/core/fx.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import type { Ctx } from "../src/core/types.ts";

const ctx: Ctx = { baseUrl: "https://statcite.test" };

const frankfurterCurrencies = {
  AUD: "Australian Dollar", CAD: "Canadian Dollar", CHF: "Swiss Franc", EUR: "Euro",
  GBP: "British Pound", JPY: "Japanese Yen", USD: "United States Dollar",
};

const frankfurterEurUsd20200615 = {
  base: "EUR",
  date: "2020-06-15",
  rates: { USD: 1.1254 },
};

function wbFxRow(date: string, value: number) {
  return {
    indicator: { id: "PA.NUS.FCRF", value: "Official exchange rate (LCU per US$, period average)" },
    country: { id: "JM", value: "Jamaica" },
    countryiso3code: "JAM",
    date,
    value,
    unit: "",
    obs_status: "",
    decimal: 2,
  };
}

const wbFxJam = [
  { page: 1, pages: 1, per_page: 50, total: 4, sourceid: "2", lastupdated: "2026-07-13" },
  [wbFxRow("2025", 158.2), wbFxRow("2023", 154.9), wbFxRow("2020", 142.75), wbFxRow("2019", 133.4)],
];

// An economy whose official annual average stops well before Jamaica's, which
// is the real shape: World Bank PA.NUS.FCRF coverage ends in different years.
function wbFxRowFor(iso3: string, iso2: string, name: string, date: string, value: number) {
  return { ...wbFxRow(date, value), country: { id: iso2, value: name }, countryiso3code: iso3 };
}

const wbFxSyr = [
  { page: 1, pages: 1, per_page: 50, total: 2, sourceid: "2", lastupdated: "2026-07-13" },
  [wbFxRowFor("SYR", "SY", "Syrian Arab Republic", "2022", 2512.5), wbFxRowFor("SYR", "SY", "Syrian Arab Republic", "2021", 1256.0)],
];

type Route = { test: (url: string) => boolean; body: () => string };

const routes: Route[] = [
  { test: (u) => u.includes("api.frankfurter.dev/v1/currencies"), body: () => JSON.stringify(frankfurterCurrencies) },
  { test: (u) => u.includes("api.frankfurter.dev/v1/2020-06-15"), body: () => JSON.stringify(frankfurterEurUsd20200615) },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/JAM/"), body: () => JSON.stringify(wbFxJam) },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/SYR/"), body: () => JSON.stringify(wbFxSyr) },
];

beforeEach(() => {
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((r) => r.test(url));
    if (!route) return new Response(JSON.stringify({ error: "no fixture for " + url }), { status: 599 });
    return new Response(route.body(), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

test("YYYY-MM-DD on a WB-annual leg uses that year's rate, not the latest", async () => {
  const r = await fxConvert(ctx, 100, "USD", "JMD", "2020-06-15");
  assert.equal(r.rate_date, "2020");
  assert.ok(Math.abs(r.rate - 142.75) < 1e-6);
  assert.ok(Math.abs(r.converted_amount - 14275) < 1e-4);
  assert.equal(r.precision, "annual_average");
  const disclosure = r.notes.find((n) => /daily precision is unavailable for JMD/i.test(n));
  assert.ok(disclosure, "expected a daily-precision disclosure note");
  assert.match(disclosure!, /2020 annual-average/);
  assert.match(disclosure!, /Requested 2020-06-15/);
  assert.equal(r.citations.length, 1);
  assert.equal(r.citations[0].series_id, "PA.NUS.FCRF");
});

test("year-only WB request is unchanged", async () => {
  const r = await fxConvert(ctx, 100, "USD", "JMD", "2023");
  assert.equal(r.rate_date, "2023");
  assert.ok(Math.abs(r.rate - 154.9) < 1e-6);
  assert.equal(r.precision, "annual_average");
  assert.ok(r.notes.some((n) => /Annual-average official exchange rates for 2023/.test(n)));
  assert.ok(!r.notes.some((n) => /daily precision is unavailable/i.test(n)));
});

test("no date still means latest annual average", async () => {
  const r = await fxConvert(ctx, 100, "USD", "JMD");
  assert.equal(r.rate_date, "2025");
  assert.ok(Math.abs(r.rate - 158.2) < 1e-6);
  assert.ok(r.notes.some((n) => /latest annual-average official rate/.test(n)));
});

test("mixed ECB+WB pair with a day date keeps both legs in the same period", async () => {
  const r = await fxConvert(ctx, 100, "EUR", "JMD", "2020-06-15");
  assert.equal(r.precision, "mixed");
  assert.ok(Math.abs(r.rate - 1.1254 * 142.75) < 1e-4);
  assert.equal(r.rate_date, "2020-06-15");
  assert.ok(r.notes.some((n) => /daily precision is unavailable for JMD/i.test(n) && /2020 annual-average/.test(n)));
  assert.ok(r.notes.some((n) => /Mixed precision/.test(n)));
  assert.equal(r.citations.length, 2);
  assert.equal(r.citations[0].source, "European Central Bank");
  assert.equal(r.citations[1].series_id, "PA.NUS.FCRF");
});

// --- a cross rate is only as current as its stalest leg ----------------------

test("a bridged pair whose legs end in different years is dated to the stalest leg", async () => {

  const r = await fxConvert(ctx, 100, "JMD", "SYP");
  assert.equal(r.rate_date, "2022", JSON.stringify(r.notes));
  assert.ok(r.notes.some((n) => /Leg periods differ/.test(n)), JSON.stringify(r.notes));
  assert.ok(r.notes.some((n) => n.includes("JMD 2025") && n.includes("SYP 2022")), JSON.stringify(r.notes));
  assert.deepEqual(
    (r.legs ?? []).map((l) => [l.currency, l.period]),
    [["JMD", "2025"], ["SYP", "2022"]],
  );
});

test("the stalest leg decides the date whichever way round the pair is asked", async () => {

  const a = await fxConvert(ctx, 100, "JMD", "SYP");
  const b = await fxConvert(ctx, 100, "SYP", "JMD");
  assert.equal(a.rate_date, b.rate_date);
  // The numbers themselves must not move: this change dates the rate, it does
  // not re-price it.
  assert.ok(Math.abs(a.rate * b.rate - 1) < 1e-6, `${a.rate} x ${b.rate}`);
});

test("same-year legs keep the date they had, and carry no stale-leg note", async () => {

  const r = await fxConvert(ctx, 100, "JMD", "USD");
  assert.equal(r.rate_date, "2025");
  assert.ok(!r.notes.some((n) => /Leg periods differ/.test(n)), JSON.stringify(r.notes));
});
