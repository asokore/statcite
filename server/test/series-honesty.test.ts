// Series answers that looked healthy while saying less than the truth. The
// Caribbean cases were live on 2026-09-12.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import { parseCaribstatId } from "../src/adapters/caribstat.ts";
import { scaleDiagnostics } from "../src/core/verify.ts";

const env = { ASSETS: { fetch: async () => new Response("site") }, BASE_URL: "https://statcite.com" } as unknown as Env;

function doc(series: Array<{ label: string; observations: Array<{ period: string; value: number | null }> }>) {
  return {
    source: "Central Bank of Barbados",
    source_id: "cbb",
    source_url: "https://www.centralbank.org.bb/",
    table_id: "inflation-and-retail-price-index",
    table_title: "Retail Price Index and Rate of Inflation",
    sheet: "jul2001-eop",
    country: { iso3: "BRB", name: "Barbados" },
    frequency: "a",
    retrieved_at: "2026-09-01T00:00:00Z",
    periods: series[0].observations.map((o) => o.period),
    series: series.map((s) => ({ ...s, unit: "%" })),
  };
}

async function seriesWith(body: unknown, qs: string) {
  _clearMemCache();
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const res = await handleRequest(new Request("https://statcite.com/v1/series?" + qs), env);
    return { status: res.status, body: (await res.json()) as any };
  } finally {
    globalThis.fetch = real;
  }
}

const TWO_ROWS = doc([
  { label: "Food", observations: [{ period: "2023", value: 118.9 }, { period: "2024", value: 119.4 }] },
  { label: "Inflation Rate %", observations: [{ period: "2023", value: 5.0 }, { period: "2024", value: 1.4 }] },
]);

test("a row label containing % is selectable instead of crashing", async () => {
  assert.equal(parseCaribstatId("caribstat/CBB/inflation-and-retail-price-index/jul2001-eop#Inflation Rate %").row, "Inflation Rate %");
  assert.equal(parseCaribstatId("caribstat/CBB/x/y#Inflation%20Rate%20%25").row, "Inflation Rate %", "valid encoding still decodes");
  const id = encodeURIComponent("caribstat/CBB/inflation-and-retail-price-index/jul2001-eop#Inflation Rate %");
  const { status, body } = await seriesWith(TWO_ROWS, `id=${id}`);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.observations.at(-1).value, 1.4);
});

test("no row named in a multi-row table: the answer says which row it is and how to choose", async () => {
  const id = encodeURIComponent("caribstat/CBB/inflation-and-retail-price-index/jul2001-eop");
  const { status, body } = await seriesWith(TWO_ROWS, `id=${id}`);
  assert.equal(status, 200);
  assert.equal(body.series_id, "caribstat/CBB/inflation-and-retail-price-index/jul2001-eop#Food", "series_id must reproduce the row served");
  assert.match(JSON.stringify(body.citation), /#Food/, "the citation must carry the row too");
  const note = (body.notes as string[]).join(" ");
  assert.match(note, /first row, 'Food'/);
  assert.match(note, /Inflation Rate %/, "the note must list the other rows");
});

test("latest_only works on /v1/series", async () => {
  const id = encodeURIComponent("caribstat/CBB/inflation-and-retail-price-index/jul2001-eop#Inflation Rate %");
  const { status, body } = await seriesWith(TWO_ROWS, `id=${id}&latest_only=true`);
  assert.equal(status, 200);
  assert.equal(body.observations.length, 1);
  assert.equal(body.observations[0].period, "2024");
});

test("a window inside a published null gap names the gap, not 'adjust the year range'", async () => {
  const GAP = doc([{ label: "Inflation Rate %", observations: [
    { period: "2018", value: 3.7 }, { period: "2019", value: null }, { period: "2020", value: 2.9 },
  ] }]);
  const id = encodeURIComponent("caribstat/CBB/inflation-and-retail-price-index/jul2001-eop");
  const { status, body } = await seriesWith(GAP, `id=${id}&start_year=2019&end_year=2019`);
  assert.equal(status, 422);
  assert.doesNotMatch(body.error.message, /adjust the year range/);
  assert.match(body.error.message, /publishes 2019 as missing/);
  assert.match(body.error.message, /2018 \(3\.7\) and 2020 \(2\.9\)/);
  assert.equal(body.error.details.gap_in_published_range, true);
  // A window genuinely outside the range keeps the old advice.
  const out = await seriesWith(GAP, `id=${id}&start_year=2030&end_year=2031`);
  assert.equal(out.status, 422);
  assert.match(out.body.error.message, /adjust the year range/);
});

test("scale diagnostic catches a decimal claim rounded to its own precision", () => {
  assert.equal(scaleDiagnostics(0.014, 1.37).length, 1, "0.014 is 1.37% written as a decimal");
  assert.match(scaleDiagnostics(0.014, 1.37)[0], /100× smaller/);
  assert.equal(scaleDiagnostics(0.041, 4.116).length, 1);
  assert.match(scaleDiagnostics(137, 1.37)[0], /100× larger/);
  // No false alarms: an ordinary near miss, a one-digit claim, and a sign flip.
  assert.deepEqual(scaleDiagnostics(1.5, 1.37), []);
  assert.deepEqual(scaleDiagnostics(3, 250), [], "one significant digit is too coarse to call a scale slip");
  assert.deepEqual(scaleDiagnostics(-1.37, 1.37), []);
});
