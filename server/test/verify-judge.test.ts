// verify_stat verdict engine: judge() bands, projection flagging, diagnostics, period normalization.

import test from "node:test";
import assert from "node:assert/strict";
import type { Ctx } from "../src/core/types.ts";
import { verifyStat, judge, normalizePeriod } from "../src/core/verify.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

const ctx: Ctx = { baseUrl: "https://statcite.test" };

function dbnBody(datasetCode: string, seriesCode: string, seriesName: string, periods: string[], values: Array<number | null>, frequency = "annual"): string {
  return JSON.stringify({
    provider: { name: "International Monetary Fund" },
    dataset: { code: datasetCode, name: "Test dataset" },
    series: {
      docs: [
        {
          "@frequency": frequency,
          dataset_code: datasetCode,
          dataset_name: "Test dataset",
          provider_code: "IMF",
          series_code: seriesCode,
          series_name: seriesName,
          period: periods,
          value: values,
        },
      ],
    },
  });
}

type Route = { test: (url: string) => boolean; body: () => string };

const routes: Route[] = [
  {
    test: (u) => u.includes("api.db.nomics.world") && u.includes("GGXWDG_NGDP"),
    body: () =>
      dbnBody(
        "WEO:2025-04",
        "BRB.GGXWDG_NGDP.pcent_gdp",
        "Barbados – General government gross debt (GGXWDG_NGDP) – Percent of GDP",
        ["2022", "2023", "2024", "2025", "2026", "2027"],
        [122.5, 115.3, 105.9, 101.4, 98.0, 95.2],
      ),
  },
  {
    test: (u) => u.includes("api.db.nomics.world") && u.includes("TESTQ"),
    body: () => dbnBody("TESTQ", "USA.GDP", "Test quarterly level series", ["2023-Q4", "2024-Q1", "2024-Q2"], [100.0, 105.5, 107.0], "quarterly"),
  },
  {
    test: (u) => u.includes("api.db.nomics.world") && u.includes("TESTM"),
    body: () => dbnBody("TESTM", "USA.CPI", "Test monthly index series", ["2024-04", "2024-05"], [3.2, 3.4], "monthly"),
  },
  {
    test: (u) => u.includes("api.db.nomics.world") && u.includes("TESTL"),
    body: () => dbnBody("TESTL", "USA.NGDPD", "Gross domestic product, current prices – U.S. dollars", ["2024"], [1.85]),
  },
  {
    test: (u) => u.includes("api.db.nomics.world") && u.includes("TESTF"),
    body: () => dbnBody("TESTF", "USA.GGXCNL", "General government net lending/borrowing – Percent of GDP", ["2024"], [-4.5]),
  },
];

function installLocalFetchStub(): void {
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((r) => r.test(url));
    if (!route) return new Response(JSON.stringify({ error: "no fixture for " + url }), { status: 599 });
    return new Response(route.body(), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

installLocalFetchStub();

const noTol = {};

test("judge percent-kind: absolute band arms unchanged for small magnitudes", () => {
  assert.equal(judge(5, 5, true, noTol).verdict, "match");
  assert.equal(judge(5.05, 5, true, noTol).verdict, "match");
  assert.equal(judge(5.2, 5, true, noTol).verdict, "close");
  assert.equal(judge(5.5, 5, true, noTol).verdict, "mismatch");
  assert.equal(judge(2.55, 2.5, true, noTol).verdict, "match");
  assert.equal(judge(2.8, 2.5, true, noTol).verdict, "close");
  assert.equal(judge(3.5, 2.5, true, noTol).verdict, "mismatch");
});

test("judge percent-kind: relative band arms rescue large-magnitude ratios", () => {
  assert.equal(judge(252, 251.2, true, noTol).verdict, "match");
  assert.equal(judge(200.9, 200, true, noTol).verdict, "match");
  assert.equal(judge(203, 200, true, noTol).verdict, "close");
  assert.equal(judge(206, 200, true, noTol).verdict, "mismatch");
});

test("judge percent-kind: Japan debt 255 vs official 251.2 is close, not mismatch", () => {
  const r = judge(255, 251.2, true, noTol);
  assert.equal(r.verdict, "close");
  assert.match(r.why, /relative/);
});

test("judge: official = 0 uses the absolute guard only", () => {
  assert.equal(judge(0.03, 0, true, noTol).verdict, "close");
  assert.equal(judge(0.2, 0, true, noTol).verdict, "mismatch");
  assert.equal(judge(0.03, 0, false, noTol).verdict, "close");
});

test("judge level-kind: relative bands unchanged", () => {
  assert.equal(judge(1004, 1000, false, noTol).verdict, "match");
  assert.equal(judge(1030, 1000, false, noTol).verdict, "close");
  assert.equal(judge(1200, 1000, false, noTol).verdict, "mismatch");
});

test("judge: caller tolerances still override defaults", () => {
  assert.equal(judge(110, 100, false, { tolerance_pct: 15 }).verdict, "match");
  assert.equal(judge(105, 100, true, { tolerance_abs: 2 }).verdict, "close");
});

test("verify_stat flags WEO projection periods with is_projection + qualified explanation", async () => {
  const r = await verifyStat(ctx, { indicator: "govt_debt_gdp", country: "BRB", period: "2025", claimed_value: 101.4 });
  assert.equal(r.verdict, "match");
  assert.equal(r.is_projection, true);
  assert.match(r.explanation, /vs official \(IMF WEO projection\) 101\.4/);
  assert.ok(r.citation.citation_text);
});

test("verify_stat leaves outturn periods unqualified", async () => {
  const r = await verifyStat(ctx, { indicator: "govt_debt_gdp", country: "BRB", period: "2023", claimed_value: 115.3 });
  assert.equal(r.verdict, "match");
  assert.equal(r.is_projection, false);
  assert.match(r.explanation, /vs official 115\.3/);
});

test("verify_stat diagnostics: trillions scale confusion", async () => {
  const r = await verifyStat(ctx, { indicator: "dbnomics/IMF/TESTL/USA.NGDPD", period: "2024", claimed_value: 1.85e12 });
  assert.equal(r.verdict, "mismatch");
  assert.ok(r.diagnostics.some((d) => /trillions/.test(d)), JSON.stringify(r.diagnostics));
});

test("verify_stat diagnostics: sign flip on fiscal balance", async () => {
  const r = await verifyStat(ctx, { indicator: "dbnomics/IMF/TESTF/USA.GGXCNL", period: "2024", claimed_value: 4.5 });
  assert.equal(r.verdict, "mismatch");
  assert.ok(r.diagnostics.some((d) => /opposite sign/.test(d)), JSON.stringify(r.diagnostics));
});

test("normalizePeriod: quarterly and monthly spellings", () => {
  assert.equal(normalizePeriod("2024Q1"), "2024-Q1");
  assert.equal(normalizePeriod("2024-Q1"), "2024-Q1");
  assert.equal(normalizePeriod("2024 Q1"), "2024-Q1");
  assert.equal(normalizePeriod("2024q3"), "2024-Q3");
  assert.equal(normalizePeriod("202405"), "2024-05");
  assert.equal(normalizePeriod("2024"), "2024");
  assert.equal(normalizePeriod("2024-05"), "2024-05");
});

test("verify_stat matches quarterly claims regardless of period spelling", async () => {
  for (const period of ["2024Q1", "2024-Q1", "2024 Q1"]) {
    const r = await verifyStat(ctx, { indicator: "dbnomics/IMF/TESTQ/USA.GDP", period, claimed_value: 105.5 });
    assert.equal(r.verdict, "match", `period spelling '${period}'`);
    assert.equal(r.official_value, 105.5);
    assert.equal(r.period, "2024-Q1");
  }
});

test("verify_stat matches YYYYMM claims against monthly labels", async () => {
  const r = await verifyStat(ctx, { indicator: "dbnomics/IMF/TESTM/USA.CPI", period: "202405", claimed_value: 3.4 });
  assert.equal(r.verdict, "match");
  assert.equal(r.official_value, 3.4);
  assert.equal(r.period, "2024-05");
});
