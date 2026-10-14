// `limitations` (core/limitations.ts): each code fires on its structured
// trigger and on nothing else, the three copies of the code list agree, and
// the field reaches a real getIndicator result.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveLimitations, LIMITATION_CODES } from "../src/core/limitations.ts";
import { getIndicator, getSeries } from "../src/core/series.ts";
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
  const unmarked = base({ series_id: "imf/NGDP_RPCH", observations: [{ period: "2016", value: 1 }] });
  const emitted = new Set([
    ...codes(all, "yoy"),
    ...codes(base({ series_id: "worldbank/SL.UEM.TOTL.ZS" })),
    ...deriveLimitations(unmarked, { latestOnly: true }).map((l) => l.code),
  ]);
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
    const latestCodes = (latest.limitations ?? []).map((l) => l.code);
    assert.ok(!latestCodes.includes("projection"));
    // The value it does return sits before an inferred boundary the IMF does
    // not publish, so it is not confirmed as an outturn. 2025 against a 2026
    // clock is a one-year lag, so it is not stale.
    assert.equal(latest.observations[0].period, "2025");
    assert.ok(latestCodes.includes("outturn_unconfirmed"), `expected outturn_unconfirmed, got ${latestCodes}`);
    assert.ok(!latestCodes.includes("stale_latest"), `a one-year lag is not stale, got ${latestCodes}`);
  } finally {
    globalThis.fetch = orig;
  }
});

const latestCodes = (r: SeriesResult) => deriveLimitations(r, { latestOnly: true }).map((l) => l.code);

test("stale_latest fires on a latest value more than 3 years before its retrieval year, with the gap", () => {
  // Barbados Gini: the World Bank's latest is 2016, retrieved in 2026.
  const r = base({ series_id: "worldbank/SI.POV.GINI", observations: [{ period: "2016", value: 40.3 }] });
  const s = deriveLimitations(r, { latestOnly: true }).find((l) => l.code === "stale_latest");
  assert.ok(s, "a decade-old latest value must carry stale_latest");
  assert.match(s!.detail, /for 2016, 10 years before 2026/);
  // Exactly one past the threshold fires too.
  assert.ok(latestCodes(base({ observations: [{ period: "2022", value: 1 }] })).includes("stale_latest"));
});

test("CONTROL: stale_latest stays silent on ordinary lags, at the threshold, and outside latest_only", () => {
  for (const year of ["2025", "2024", "2023"]) {
    const got = latestCodes(base({ observations: [{ period: year, value: 1 }] }));
    assert.ok(!got.includes("stale_latest"), `${year} against 2026 must not fire, got ${got}`);
  }
  // A full series shows its own last period, so the caller can see the horizon.
  const full = base({ observations: [{ period: "2015", value: 1 }, { period: "2016", value: 1 }] });
  assert.ok(!codes(full).includes("stale_latest"));
  // The gap is read from the citation's retrieved_at. With none to read, nothing is claimed.
  const noDate = base({ observations: [{ period: "2016", value: 1 }] });
  noDate.citation = { ...noDate.citation, retrieved_at: "" };
  assert.ok(!latestCodes(noDate).includes("stale_latest"));
  // Nor from a period with no readable year, which would otherwise read as year 0.
  assert.ok(!latestCodes(base({ observations: [{ period: "", value: 1 }] })).includes("stale_latest"));
  assert.ok(!latestCodes(base({ observations: [{ period: "FY16", value: 1 }] })).includes("stale_latest"));
  // A monthly or quarterly period is judged on its year.
  assert.ok(latestCodes(base({ observations: [{ period: "2019-11", value: 1 }] })).includes("stale_latest"));
  assert.ok(!latestCodes(base({ observations: [{ period: "2025-Q2", value: 1 }] })).includes("stale_latest"));
});

test("outturn_unconfirmed fires on IMF values before the inferred boundary, counting only those", () => {
  const r = base({
    series_id: "imf/NGDP_RPCH",
    observations: [
      { period: "2024", value: 2.8 },
      { period: "2025", value: 2.0 },
      { period: "2026", value: 1.9, note: "IMF WEO estimate/projection" },
    ],
  });
  const u = deriveLimitations(r).find((l) => l.code === "outturn_unconfirmed");
  assert.ok(u, "must fire");
  assert.match(u!.detail, /^2 of 3 returned value\(s\)/);
  // It never says a value IS an estimate.
  assert.match(u!.detail, /may be a staff estimate/);
  assert.doesNotMatch(u!.detail, /\b(it|this value|these values|they) (is|are) (an? )?staff estimates?|probably|likely/);
  // Fiscal Monitor codes and DBnomics IMF vintages have the same inferred boundary.
  assert.ok(codes(base({ series_id: "imf/GGR_G01_GDP_PT" })).includes("outturn_unconfirmed"));
  assert.ok(codes(base({ series_id: "dbnomics/IMF/WEO:2025-04/BRB.NGDP_RPCH.pcent_change" })).includes("outturn_unconfirmed"));
});

test("CONTROL: outturn_unconfirmed stays silent where StatCite infers no IMF boundary, or every value is marked", () => {
  for (const id of [
    "worldbank/NY.GDP.MKTP.KD.ZG",
    "imf/NOT_A_REGISTRY_CODE",
    "dbnomics/IMF/WEO:latest/BRB.NGDP_RPCH.pcent_change",
    "dbnomics/Eurostat/nama_10_gdp/A.CP_MEUR.B1GQ.DE",
    "bis/WS_CBPOL/D.BB",
  ]) {
    assert.ok(!codes(base({ series_id: id })).includes("outturn_unconfirmed"), `${id} must not fire`);
  }
  const allProjected = base({
    series_id: "imf/NGDP_RPCH",
    observations: [{ period: "2027", value: 1.8, note: "IMF WEO estimate/projection" }],
  });
  assert.ok(!codes(allProjected).includes("outturn_unconfirmed"));
  const nullOnly = base({ series_id: "imf/NGDP_RPCH", observations: [{ period: "2016", value: null }] });
  assert.ok(!codes(nullOnly).includes("outturn_unconfirmed"));
});

/** A one-row World Bank envelope for `indicator` ending at `year`. */
function wbOneRow(indicator: string, name: string, year: string, value: number) {
  return JSON.stringify([
    { page: 1, pages: 1, per_page: 100, total: 1, sourceid: "2", lastupdated: "2026-07-13" },
    [{ indicator: { id: indicator, value: name }, country: { id: "BB", value: "Barbados" }, countryiso3code: "BRB", date: year, value, unit: "", obs_status: "", decimal: 1 }],
  ]);
}

async function withWorldBank<T>(body: string, fn: () => Promise<T>): Promise<T> {
  _clearMemCache();
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.worldbank.org")) return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 599 });
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

test("a real single-source latest value a decade old carries stale_latest, on get_indicator and get_series alike", async () => {
  const ctx: Ctx = { baseUrl: "https://statcite.test", now: () => new Date("2026-10-14T12:00:00Z") };
  const gini = wbOneRow("SI.POV.GINI", "Gini index", "2016", 40.3);
  const ind = await withWorldBank(gini, () => getIndicator(ctx, "gini", "BRB", { limit: 1 }));
  const indCodes = (ind.limitations ?? []).map((l) => l.code);
  assert.equal(ind.observations[0].period, "2016");
  assert.ok(indCodes.includes("stale_latest"), `get_indicator: expected stale_latest, got ${indCodes}`);
  // stale_primary keeps its meaning: it needs a second registry source to name.
  assert.ok(!indCodes.includes("stale_primary"));
  const ser = await withWorldBank(gini, () => getSeries(ctx, "worldbank/SI.POV.GINI", { country: "BRB", limit: 1 }));
  const serCodes = (ser.limitations ?? []).map((l) => l.code);
  assert.ok(serCodes.includes("stale_latest"), `get_series: expected stale_latest, got ${serCodes}`);
  // A caller who pinned end_year asked for that period.
  const pinned = await withWorldBank(gini, () => getIndicator(ctx, "gini", "BRB", { limit: 1, end: "2016" }));
  assert.ok(!(pinned.limitations ?? []).some((l) => l.code === "stale_latest"));
});

test("CONTROL: a current World Bank latest value carries no stale_latest", async () => {
  const ctx: Ctx = { baseUrl: "https://statcite.test", now: () => new Date("2026-10-14T12:00:00Z") };
  const pop = wbOneRow("SP.POP.TOTL", "Population, total", "2025", 282000);
  const r = await withWorldBank(pop, () => getIndicator(ctx, "population", "BRB", { limit: 1 }));
  assert.equal(r.observations[0].period, "2025");
  assert.deepEqual((r.limitations ?? []).map((l) => l.code), []);
});
