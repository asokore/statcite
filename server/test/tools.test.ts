import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { installFetchStub, mcpTool, call, unmatchedUrls } from "./helpers.ts";

beforeEach(() => installFetchStub());

const fx = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"));

test("get_indicator: Barbados inflation with full citation", async () => {
  const { payload, isError } = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "Barbados" });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.series_id, "worldbank/FP.CPI.TOTL.ZG");
  assert.equal(payload.country.iso3, "BRB");
  const y2024 = payload.observations.find((o: any) => o.period === "2024");
  assert.ok(Math.abs(y2024.value - 1.4464366430616) < 1e-9);
  const c = payload.citation;
  assert.equal(c.source, "World Bank");
  assert.equal(c.license, "CC BY 4.0");
  assert.match(c.source_url, /data\.worldbank\.org\/indicator\/FP\.CPI\.TOTL\.ZG/);
  assert.match(c.citation_text, /World Bank/);
  assert.ok(c.retrieved_at);
});

test("get_indicator: latest_only returns a single observation", async () => {
  const { payload } = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB", latest_only: true });
  assert.equal(payload.observations.length, 1);
  assert.equal(payload.observations[0].period, "2025");
});

test("get_indicator: unknown country produces a helpful tool error", async () => {
  const { payload, isError } = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "Atlantis" });
  assert.equal(isError, true);
  assert.match(payload.error, /Could not resolve country/);
});

test("get_indicator: unknown indicator suggests alternatives", async () => {
  const { payload, isError } = await mcpTool("get_indicator", { indicator: "inflation", country: "BRB" });
  assert.equal(isError, true);
  assert.match(payload.error, /inflation_cpi/);
});

test("verify_stat: match within rounding", async () => {
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.45,
  });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.verdict, "match");
  assert.ok(Math.abs(payload.official_value - 1.4464366430616) < 1e-9);
  assert.ok(payload.citation.citation_text);
});

test("verify_stat: mismatch with diagnostics for decimal confusion", async () => {
  const { payload } = await mcpTool("verify_stat", {
    indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 0.0145,
  });
  assert.equal(payload.verdict, "mismatch");
  assert.ok(payload.diagnostics.some((d: string) => /percent-vs-decimal/.test(d)), JSON.stringify(payload.diagnostics));
});

test("verify_stat: detects year misattribution", async () => {
  const { payload } = await mcpTool("verify_stat", {
    indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 0.8466,
  });
  assert.equal(payload.verdict, "mismatch");
  assert.ok(payload.diagnostics.some((d: string) => /2025/.test(d)), JSON.stringify(payload.diagnostics));
});

test("verify_stat: cannot_verify outside range shows nearby values", async () => {
  const { payload } = await mcpTool("verify_stat", {
    indicator: "inflation_cpi", country: "BRB", period: "1901", claimed_value: 5,
  });
  assert.equal(payload.verdict, "cannot_verify");
  assert.match(payload.explanation, /Available range/);
});

test("country_snapshot: aggregates multi-indicator call with per-item citations", async () => {
  const { payload, isError } = await mcpTool("country_snapshot", { country: "USA" });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.country.iso3, "USA");
  const growth = payload.indicators.find((i: any) => i.indicator === "gdp_growth");
  assert.ok(growth);
  assert.equal(growth.period, "2025");
  assert.ok(growth.citation.citation_text);
  assert.ok(Array.isArray(payload.missing));
});

test("inflation_adjust: CPI-ratio math matches fixture", async () => {
  const raw = fx("wb-usa-cpi-index");
  const rows: any[] = raw[1];
  const idx = (year: string) => rows.find((r) => r.date === year).value;
  const expected = 100 * (idx("2020") / idx("2000"));
  const { payload, isError } = await mcpTool("inflation_adjust", {
    amount: 100, from_year: 2000, to_year: 2020, country: "USA",
  });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.ok(Math.abs(payload.adjusted_amount - expected) < 1e-6);
  assert.match(payload.method, /CPI\(2020\)/);
  assert.equal(payload.citation.series_id, "FP.CPI.TOTL");
});

test("inflation_adjust: out-of-range year yields range info", async () => {
  const { payload, isError } = await mcpTool("inflation_adjust", { amount: 100, from_year: 1800, to_year: 2020, country: "USA" });
  assert.equal(isError, true);
  assert.match(payload.error, /covers \d{4}–\d{4}/);
});

test("fx_convert: ECB daily for majors", async () => {
  const { payload, isError } = await mcpTool("fx_convert", { amount: 100, from: "USD", to: "EUR" });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.ok(Math.abs(payload.converted_amount - 87.897) < 1e-6);
  assert.equal(payload.precision, "daily");
  assert.equal(payload.citations[0].source, "European Central Bank");
});

test("fx_convert: exotic currency via World Bank annual (BBD)", async () => {
  const { payload, isError } = await mcpTool("fx_convert", { amount: 100, from: "USD", to: "BBD" });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.ok(Math.abs(payload.converted_amount - 200) < 1e-6);
  assert.equal(payload.precision, "annual_average");
  assert.ok(payload.citations.some((c: any) => c.source === "World Bank"));
  assert.match(payload.method, /USD bridge/);
});

test("fx_convert: reverse direction (BBD -> USD)", async () => {
  const { payload } = await mcpTool("fx_convert", { amount: 100, from: "BBD", to: "USD" });
  assert.ok(Math.abs(payload.converted_amount - 50) < 1e-6);
});

test("get_series: DBnomics IMF WEO series with projection note", async () => {
  const { payload, isError } = await mcpTool("get_series", { series_id: "dbnomics/IMF/WEO:latest/BRB.NGDP_RPCH" });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.match(payload.series_id, /^dbnomics\/IMF\/WEO:2025-04\/BRB\.NGDP_RPCH/);
  assert.ok(payload.observations.length > 10);
  assert.ok(payload.notes.some((n: string) => /projection/i.test(n)));
  assert.match(payload.citation.attribution, /International Monetary Fund/);
});

test("search + fetch (deep-research pair)", async () => {
  const s = await mcpTool("search", { query: "inflation barbados" });
  assert.equal(s.isError, false);
  assert.ok(s.rpc.result.structuredContent.results.length > 0);
  const first = s.rpc.result.structuredContent.results[0];
  assert.equal(first.id, "indicator/inflation_cpi/BRB");
  const f = await mcpTool("fetch", { id: first.id });
  assert.equal(f.isError, false, JSON.stringify(f.payload));
  assert.match(f.rpc.result.structuredContent.text, /CITATION: World Bank/);
});

test("list_sources includes licensing info", async () => {
  const { payload } = await mcpTool("list_sources", {});
  assert.ok(payload.sources.length >= 4);
  assert.ok(payload.sources.every((s: any) => s.license && s.attribution_required));
});

test("search_indicators surfaces registry + dbnomics datasets", async () => {
  const { payload, isError } = await mcpTool("search_indicators", { query: "gdp" });
  assert.equal(isError, false);
  assert.ok(payload.results.some((r: any) => r.type === "indicator"));
});

test("REST parity: /v1/indicator, /v1/verify, /v1/fx", async () => {
  const r1 = await call("/v1/indicator/inflation_cpi?country=BRB&latest_only=true");
  assert.equal(r1.status, 200);
  const b1 = await r1.json() as any;
  assert.equal(b1.observations.length, 1);
  assert.equal(r1.headers.get("access-control-allow-origin"), "*");
  assert.match(r1.headers.get("cache-control")!, /max-age/);

  const r2 = await call("/v1/verify?indicator=inflation_cpi&country=BRB&period=2024&value=1.45");
  const b2 = await r2.json() as any;
  assert.equal(b2.verdict, "match");

  const r3 = await call("/v1/fx?amount=100&from=USD&to=BBD");
  const b3 = await r3.json() as any;
  assert.ok(Math.abs(b3.converted_amount - 200) < 1e-6);

  const r4 = await call("/v1/indicator/inflation_cpi");
  assert.equal(r4.status, 400);

  const r5 = await call("/v1/nope");
  assert.equal(r5.status, 404);
});

test("no unexpected upstream calls leaked", () => {
  // Diagnostic: everything the suite touched should have had a fixture,
  // except deliberate misses (dbnomics debt for USA snapshot, dbnomics search fallback).
  const unexpected = unmatchedUrls.filter(
    (u) => !u.includes("GGXWDG_NGDP") && !u.includes("/search") && !u.includes("GC.DOD.TOTL.GD.ZS"),
  );
  assert.deepEqual(unexpected, []);
});
