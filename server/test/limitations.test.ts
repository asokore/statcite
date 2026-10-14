// `limitations` (core/limitations.ts): each code fires on its structured
// trigger and on nothing else, the three copies of the code list agree, and
// the field reaches a real getIndicator result.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveLimitations, LIMITATION_CODES } from "../src/core/limitations.ts";
import { getIndicator } from "../src/core/series.ts";
import { TOOLS } from "../src/tools.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import type { Ctx, SeriesResult } from "../src/core/types.ts";
import { dmValuesBody, dmMetadataBody, isDataMapperValuesUrl, isDataMapperMetadataUrl } from "./dm-fixtures.ts";

function base(over: Partial<SeriesResult> = {}): SeriesResult {
  return {
    series_id: "worldbank/NY.GDP.MKTP.KD.ZG",
    name: "GDP growth",
    observations: [
      { period: "2023", value: 4.1 },
      { period: "2024", value: 3.0 },
    ],
    citation: {
      source: "World Bank",
      dataset: "World Development Indicators",
      series_id: "NY.GDP.MKTP.KD.ZG",
      series_name: "GDP growth",
      source_url: "https://data.worldbank.org/",
      license: "CC BY 4.0",
      attribution: "World Bank",
      retrieved_at: "2026-10-14T00:00:00Z",
      citation_text: "World Bank, WDI.",
    },
    notes: [],
    ...over,
  };
}
const codes = (r: SeriesResult, transform?: string) => deriveLimitations(r, { transform }).map((l) => l.code);

test("a plain primary-source WDI result carries no limitations", () => {
  assert.deepEqual(codes(base()), []);
});

test("projection fires on the code-set observation marker, and only on it", () => {
  const r = base({
    series_id: "imf/NGDP_RPCH",
    observations: [
      { period: "2025", value: 2.0 },
      { period: "2026", value: 1.9, note: "IMF WEO estimate/projection" },
      { period: "2027", value: 1.8, note: "IMF WEO estimate/projection" },
    ],
  });
  const lim = deriveLimitations(r);
  const p = lim.find((l) => l.code === "projection");
  assert.ok(p, "projection must fire");
  assert.match(p!.detail, /^2 of 3 /);
  assert.match(p!.detail, /\(2026 to 2027\)/);
  // A prose note that merely mentions projections must not trigger it.
  const prose = base({
    notes: ["Latest value not marked as a projection shown; later IMF estimate/projection periods exist for this series."],
    observations: [{ period: "2025", value: 2.0, note: "projection" }],
  });
  assert.ok(!codes(prose).includes("projection"));
  // A null value in the projection period is not a served projection.
  const nullOnly = base({ observations: [{ period: "2026", value: null, note: "IMF WEO estimate/projection" }] });
  assert.ok(!codes(nullOnly).includes("projection"));
});

test("fallback_source distinguishes transient from definitive", () => {
  const t = deriveLimitations(base({ fallback_used: true, fallback_reason: "transient" })).find((l) => l.code === "fallback_source");
  const d = deriveLimitations(base({ fallback_used: true, fallback_reason: "definitive" })).find((l) => l.code === "fallback_source");
  assert.match(t!.detail, /a source ranked above it failed for this request/);
  assert.match(d!.detail, /had no data for this series, country or period/);
  // "definitive" must never claim the primary lacks the series outright: it is
  // also set when the primary simply has no value for the requested period.
  assert.ok(!/does not publish/.test(d!.detail));
  assert.ok(!codes(base({ fallback_used: false })).includes("fallback_source"));
});

test("stale_primary carries the year gap", () => {
  const s = deriveLimitations(base({ stale_primary: true, stale_primary_years: 7 })).find((l) => l.code === "stale_primary");
  assert.match(s!.detail, /7 year\(s\) behind/);
});

test("modeled_estimate follows the registry flag, for registry and explicit WDI ids alike", () => {
  assert.ok(codes(base({ series_id: "worldbank/SL.UEM.TOTL.ZS" })).includes("modeled_estimate"));
  assert.ok(!codes(base({ series_id: "worldbank/FP.CPI.TOTL.ZG" })).includes("modeled_estimate"));
});

test("rounded_source fires for DataMapper WEO only, never for Fiscal Monitor or DBnomics vintages", () => {
  const weo = base({ series_id: "imf/NGDP_RPCH" });
  weo.citation = { ...weo.citation, dataset: "World Economic Outlook (April 2026)" };
  const fm = base({ series_id: "imf/GGR_G01_GDP_PT" });
  fm.citation = { ...fm.citation, dataset: "Fiscal Monitor (April 2026)" };
  const dbn = base({ series_id: "dbnomics/IMF/WEO:2019-10/USA.NGDP_RPCH.pcent_change" });
  dbn.citation = { ...dbn.citation, dataset: "World Economic Outlook (October 2019)" };
  assert.ok(codes(weo).includes("rounded_source"));
  assert.ok(!codes(fm).includes("rounded_source"));
  assert.ok(!codes(dbn).includes("rounded_source"));
});

test("rounded_source survives a degraded edition label, because it reads the registry", () => {
  const degraded = base({ series_id: "imf/NGDP_RPCH" });
  degraded.citation = { ...degraded.citation, dataset: "2026 vintage (April or October edition, edition metadata unavailable; a newer edition may exist)" };
  assert.ok(codes(degraded).includes("rounded_source"));
});

test("rounded_source drops the 0.05 bound once values are computed from the rounded inputs", () => {
  const weo = base({ series_id: "imf/NGDP_RPCH" });
  const raw = deriveLimitations(weo).find((l) => l.code === "rounded_source")!;
  const yoy = deriveLimitations(weo, { transform: "yoy" }).find((l) => l.code === "rounded_source")!;
  assert.match(raw.detail, /up to 0\.05/);
  assert.ok(!/up to 0\.05/.test(yoy.detail), "a computed value can be off by far more than 0.05");
});

test("computed_values fires for a transform and not for 'none'", () => {
  assert.ok(codes(base(), "yoy").includes("computed_values"));
  assert.ok(!codes(base(), "none").includes("computed_values"));
  assert.ok(!codes(base()).includes("computed_values"));
});

test("every code a result can carry is in LIMITATION_CODES, the MCP output schema and the OpenAPI schema", () => {
  const tool = TOOLS.find((t) => t.name === "get_indicator") as { outputSchema?: any };
  const mcpEnum = tool?.outputSchema?.properties?.limitations?.items?.properties?.code?.enum;
  const openapi = JSON.parse(readFileSync(new URL("../../site/openapi.json", import.meta.url), "utf8"));
  const apiEnum = openapi.components.schemas.SeriesResult.properties.limitations.items.properties.code.enum;
  assert.deepEqual(mcpEnum, [...LIMITATION_CODES]);
  assert.deepEqual(apiEnum, [...LIMITATION_CODES]);
  // And every code the deriver can emit is in the list.
  const all = base({
    series_id: "imf/NGDP_RPCH",
    observations: [{ period: "2026", value: 1, note: "IMF WEO estimate/projection" }],
    fallback_used: true,
    fallback_reason: "transient",
    stale_primary: true,
    stale_primary_years: 3,
  });
  all.citation = { ...all.citation, dataset: "World Economic Outlook (April 2026)" };
  const emitted = new Set([...codes(all, "yoy"), ...codes(base({ series_id: "worldbank/SL.UEM.TOTL.ZS" }))]);
  assert.deepEqual([...emitted].sort(), [...LIMITATION_CODES].sort(), "a code the deriver emits is missing from the list, or a listed code can never fire");
});

test("a real getIndicator result carries limitations: projection and rounding on a WEO series", async () => {
  const meta = dmMetadataBody({
    NGDP_RPCH: { label: "Real GDP growth", source: "World Economic Outlook (April 2026)", dataset: "WEO" },
  });
  _clearMemCache();
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (isDataMapperMetadataUrl(url)) return new Response(meta, { status: 200, headers: { "content-type": "application/json" } });
    if (isDataMapperValuesUrl(url, "NGDP_RPCH"))
      return new Response(
        dmValuesBody("NGDP_RPCH", { USA: { "2024": 2.8, "2025": 2.0, "2026": 1.9, "2027": 1.8, "2028": 1.8, "2029": 1.8, "2030": 1.8, "2031": 1.8 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    return new Response("{}", { status: 599 });
  }) as typeof fetch;
  try {
    const ctx: Ctx = { baseUrl: "https://statcite.test", now: () => new Date("2026-07-25T12:00:00Z") };
    const r = await getIndicator(ctx, "gdp_growth", "USA", { limit: 8 });
    const got = (r.limitations ?? []).map((l) => l.code);
    assert.ok(Array.isArray(r.limitations), "the field must be present");
    assert.ok(got.includes("projection"), `expected projection, got ${got}`);
    assert.ok(got.includes("rounded_source"), `expected rounded_source, got ${got}`);
    // latest_only skips projection years, so the projection code must not fire there.
    const latest = await getIndicator(ctx, "gdp_growth", "USA", { limit: 1 });
    assert.ok(!(latest.limitations ?? []).some((l) => l.code === "projection"));
  } finally {
    globalThis.fetch = orig;
  }
});
