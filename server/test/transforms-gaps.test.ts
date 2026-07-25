// Period-arithmetic transforms on gappy series, note propagation, and transform-emptied errors.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTransform } from "../src/core/transforms.ts";
import { getSeries } from "../src/core/series.ts";
import type { Ctx } from "../src/core/types.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

const ctx: Ctx = { baseUrl: "https://statcite.test" };

function wbEnvelope(indicatorId: string, rows: Array<{ date: string; value: number | null }>): string {
  return JSON.stringify([
    { page: 1, pages: 1, per_page: 1000, total: rows.length, lastupdated: "2026-07-01" },
    rows.map((r) => ({
      indicator: { id: indicatorId, value: "Test indicator" },
      country: { id: "BB", value: "Barbados" },
      countryiso3code: "BRB",
      date: r.date,
      value: r.value,
    })),
  ]);
}

function installLocalFetchStub(bodies: Record<string, string>): void {
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const key = Object.keys(bodies).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ error: "no fixture for " + url }), { status: 404 });
    return new Response(bodies[key], { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

test("yoy on gappy annual series: only contiguous year pairs produce rows", () => {
  const obs = [
    { period: "2010", value: 100 },
    { period: "2016", value: 120 },
    { period: "2019", value: 150 },
    { period: "2020", value: 165 },
  ];
  const t = applyTransform(obs, "yoy", { frequency: "annual" });
  assert.equal(t.observations.length, 1);
  assert.equal(t.observations[0].period, "2020");
  assert.ok(Math.abs(t.observations[0].value! - 10) < 1e-9);
});

test("pct_change on gappy annual series: only adjacent-year pairs produce rows", () => {
  const obs = [
    { period: "2010", value: 100 },
    { period: "2016", value: 120 },
    { period: "2017", value: 132 },
  ];
  const t = applyTransform(obs, "pct_change", { frequency: "annual" });
  assert.equal(t.observations.length, 1);
  assert.equal(t.observations[0].period, "2017");
  assert.ok(Math.abs(t.observations[0].value! - 10) < 1e-9);
});

test("yoy quarterly: matches same quarter one year earlier, skips missing quarters", () => {
  const obs = [
    { period: "2023-Q1", value: 100 },
    { period: "2023-Q2", value: 110 },
    { period: "2023Q4", value: 100 },
    { period: "2024-Q1", value: 120 },
    { period: "2024-Q3", value: 130 },
    { period: "2024Q4", value: 105 },
  ];
  const t = applyTransform(obs, "yoy", { frequency: "quarterly" });
  assert.deepEqual(
    t.observations.map((o) => o.period),
    ["2024-Q1", "2024Q4"],
  );
  assert.ok(Math.abs(t.observations[0].value! - 20) < 1e-9);
  assert.ok(Math.abs(t.observations[1].value! - 5) < 1e-9);
});

test("yoy monthly: matches same month one year earlier only", () => {
  const obs = [
    { period: "2023-01", value: 200 },
    { period: "2023-03", value: 210 },
    { period: "2024-01", value: 220 },
    { period: "2024-02", value: 230 },
  ];
  const t = applyTransform(obs, "yoy", { frequency: "monthly" });
  assert.equal(t.observations.length, 1);
  assert.equal(t.observations[0].period, "2024-01");
  assert.ok(Math.abs(t.observations[0].value! - 10) < 1e-9);
});

test("pct_change crosses year boundaries by period arithmetic", () => {
  const quarterly = applyTransform(
    [
      { period: "2023-Q3", value: 100 },
      { period: "2023-Q4", value: 110 },
      { period: "2024-Q1", value: 121 },
      { period: "2024-Q3", value: 200 },
    ],
    "pct_change",
    { frequency: "quarterly" },
  );
  assert.deepEqual(
    quarterly.observations.map((o) => o.period),
    ["2023-Q4", "2024-Q1"],
  );
  assert.ok(Math.abs(quarterly.observations[1].value! - 10) < 1e-9);

  const monthly = applyTransform(
    [
      { period: "2023-12", value: 50 },
      { period: "2024-01", value: 55 },
      { period: "2024-03", value: 60 },
    ],
    "pct_change",
    { frequency: "monthly" },
  );
  assert.deepEqual(
    monthly.observations.map((o) => o.period),
    ["2024-01"],
  );
  assert.ok(Math.abs(monthly.observations[0].value! - 10) < 1e-9);
});

test("notes propagate through yoy and index transforms", () => {
  const obs = [
    { period: "2023", value: 100 },
    { period: "2024", value: 110, note: "IMF WEO estimate/projection" },
  ];
  const yoy = applyTransform(obs, "yoy", { frequency: "annual" });
  assert.equal(yoy.observations.length, 1);
  assert.equal(yoy.observations[0].note, "IMF WEO estimate/projection");

  const idx = applyTransform(obs, "index", {});
  assert.equal(idx.observations[0].note, undefined);
  assert.equal(idx.observations[1].note, "IMF WEO estimate/projection");
  assert.ok(Math.abs(idx.observations[1].value! - 110) < 1e-9);
});

test("dense series: yoy and pct_change match the positional behavior", () => {
  const annual = [
    { period: "2018", value: 100 },
    { period: "2019", value: 105 },
    { period: "2020", value: null },
    { period: "2021", value: 110 },
    { period: "2022", value: 121 },
  ];
  const t = applyTransform(annual, "yoy", { frequency: "annual" });
  assert.deepEqual(
    t.observations.map((o) => o.period),
    ["2019", "2020", "2021", "2022"],
  );
  assert.ok(Math.abs(t.observations[0].value! - 5) < 1e-9);
  assert.equal(t.observations[1].value, null);
  assert.equal(t.observations[2].value, null);
  assert.ok(Math.abs(t.observations[3].value! - 10) < 1e-9);
  assert.match(t.note!, /year-over-year/);

  const quarterly = [
    { period: "2023-Q1", value: 100 },
    { period: "2023-Q2", value: 102 },
    { period: "2023-Q3", value: 104 },
    { period: "2023-Q4", value: 106 },
    { period: "2024-Q1", value: 108 },
    { period: "2024-Q2", value: 112.2 },
  ];
  const q = applyTransform(quarterly, "yoy", { frequency: "quarterly" });
  assert.deepEqual(
    q.observations.map((o) => o.period),
    ["2024-Q1", "2024-Q2"],
  );
  assert.ok(Math.abs(q.observations[0].value! - 8) < 1e-9);
  assert.ok(Math.abs(q.observations[1].value! - 10) < 1e-9);

  const p = applyTransform(quarterly, "pct_change", { frequency: "quarterly" });
  assert.equal(p.observations.length, 5);
  assert.ok(Math.abs(p.observations[0].value! - 2) < 1e-9);
});

test("daily-style periods keep positional pct_change", () => {
  const obs = [
    { period: "2024-05-01", value: 100 },
    { period: "2024-05-02", value: 101 },
    { period: "2024-05-05", value: 103.02 },
  ];
  const t = applyTransform(obs, "pct_change", { frequency: "daily" });
  assert.deepEqual(
    t.observations.map((o) => o.period),
    ["2024-05-02", "2024-05-05"],
  );
  assert.ok(Math.abs(t.observations[0].value! - 1) < 1e-9);
  assert.ok(Math.abs(t.observations[1].value! - 2) < 1e-9);
});

test("transform that empties a non-empty series explains the transform, not the window", async () => {
  installLocalFetchStub({
    "TEST.GAPPY.YOY": wbEnvelope("TEST.GAPPY.YOY", [
      { date: "2010", value: 100 },
      { date: "2016", value: 120 },
    ]),
  });
  await assert.rejects(
    getSeries(ctx, "worldbank/TEST.GAPPY.YOY", { country: "BRB", transform: "yoy" }),
    (e: Error) => {
      assert.match(e.message, /'yoy' transform produced no observations/);
      assert.match(e.message, /widening start_year|drop the transform/);
      assert.doesNotMatch(e.message, /Try widening the period/);
      return true;
    },
  );
});

test("empty window without a transform keeps the widen-the-period advice", async () => {
  installLocalFetchStub({
    "TEST.WINDOW.EMPTY": wbEnvelope("TEST.WINDOW.EMPTY", [
      { date: "2010", value: 100 },
      { date: "2011", value: 105 },
    ]),
  });
  await assert.rejects(
    getSeries(ctx, "worldbank/TEST.WINDOW.EMPTY", { country: "BRB", start: "2020", end: "2024" }),
    (e: Error) => {
      assert.match(e.message, /No observations available/);
      assert.match(e.message, /Try widening the period/);
      return true;
    },
  );
});
