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

type Route = { test: (url: string) => boolean; body: () => string };

const routes: Route[] = [
  { test: (u) => u.includes("api.frankfurter.dev/v1/currencies"), body: () => JSON.stringify(frankfurterCurrencies) },
  { test: (u) => u.includes("api.frankfurter.dev/v1/2020-06-15"), body: () => JSON.stringify(frankfurterEurUsd20200615) },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/JAM/"), body: () => JSON.stringify(wbFxJam) },
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
