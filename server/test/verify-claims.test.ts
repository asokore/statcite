// verify_claims — batch verification: summary counts, input order, per-claim
// error isolation, call-level validation, projection note, REST POST parity.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import { dmValuesBody, isDataMapperValuesUrl, isDataMapperMetadataUrl, STANDARD_DM_METADATA, DM_CODES } from "./dm-fixtures.ts";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));

function fixture(name: string): string {
  return readFileSync(`${fixturesDir}${name}.json`, "utf8");
}

function wbBody(indicatorId: string, indicatorName: string, iso2: string, iso3: string, countryName: string, rows: Array<[string, number | null]>): string {
  return JSON.stringify([
    { page: 1, pages: 1, per_page: 100, total: rows.length, sourceid: "2", lastupdated: "2026-07-13" },
    rows.map(([date, value]) => ({
      indicator: { id: indicatorId, value: indicatorName },
      country: { id: iso2, value: countryName },
      countryiso3code: iso3,
      date,
      value,
      unit: "",
      obs_status: "",
      decimal: 1,
    })),
  ]);
}

function dbnBody(datasetCode: string, seriesCode: string, seriesName: string, periods: string[], values: Array<number | null>): string {
  return JSON.stringify({
    provider: { name: "International Monetary Fund" },
    dataset: { code: datasetCode, name: "World Economic Outlook by countries" },
    series: {
      docs: [
        {
          "@frequency": "annual",
          dataset_code: datasetCode,
          dataset_name: "World Economic Outlook by countries",
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
  { test: (u) => u.includes("api.worldbank.org") && u.includes("FP.CPI.TOTL.ZG") && u.includes("/BRB/"), body: () => fixture("wb-bb-inflation") },
  {
    test: (u) => u.includes("api.worldbank.org") && u.includes("FP.CPI.TOTL.ZG") && u.includes("/USA/"),
    body: () =>
      wbBody("FP.CPI.TOTL.ZG", "Inflation, consumer prices (annual %)", "US", "USA", "United States", [
        ["2023", 4.116],
        ["2024", 2.949],
      ]),
  },
  { test: (u) => u.includes("api.db.nomics.world") && u.includes("BRB.NGDP_RPCH"), body: () => fixture("dbnomics-series") },
  {
    test: (u) => u.includes("api.db.nomics.world") && u.includes("BRB.GGXWDG_NGDP"),
    body: () =>
      dbnBody(
        "WEO:2025-04",
        "BRB.GGXWDG_NGDP.pcent_gdp",
        "Barbados – General government gross debt (GGXWDG_NGDP) – Percent of GDP",
        ["2022", "2023", "2024", "2025", "2026", "2027"],
        [122.5, 115.3, 105.9, 101.4, 98.0, 95.2],
      ),
  },
  { test: (u) => isDataMapperMetadataUrl(u), body: () => STANDARD_DM_METADATA },
  {
    test: (u) => isDataMapperValuesUrl(u, DM_CODES.govt_debt_gdp),
    body: () =>
      // Current-vintage (April 2026 edition, horizon 2031 -> boundary 2026):
      // govt_debt_gdp is now DataMapper-primary, so this fixture — not the
      // DBnomics one above — is what verify_claims actually serves against.
      dmValuesBody(DM_CODES.govt_debt_gdp, {
        // Horizon through 2031 (edition year 2026 + 5) so the projection boundary
        // is 2026 without relying on the calendar-clamp fallback.
        BRB: {
          "2022": 122.5, "2023": 115.3, "2024": 105.9, "2025": 101.4,
          "2026": 98.0, "2027": 95.2, "2028": 93.0, "2029": 91.5, "2030": 90.2, "2031": 89.0,
        },
      }),
  },
];

let fetchCount = 0;

function installFetchStub(): void {
  _clearMemCache();
  fetchCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCount++;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((r) => r.test(url));
    if (!route) return new Response(JSON.stringify({ error: "no fixture for " + url }), { status: 599 });
    return new Response(route.body(), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const env: Env = {
  ASSETS: {
    fetch: async () => new Response("<!doctype html><title>StatCite</title>", { headers: { "content-type": "text/html" } }),
  },
  BASE_URL: "https://statcite.test",
};

async function call(path: string, init?: RequestInit, e: Env = env): Promise<Response> {
  return handleRequest(new Request(`https://statcite.test${path}`, init), e);
}

let idCounter = 9000;

async function mcpTool(name: string, args: Record<string, unknown>, e: Env = env): Promise<{ res: Response; payload: any; isError: boolean }> {
  const res = await call(
    "/mcp",
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++idCounter, method: "tools/call", params: { name, arguments: args } }),
    },
    e,
  );
  const rpc = (await res.json()) as any;
  const text = rpc?.result?.content?.[0]?.text;
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }
  return { res, payload, isError: Boolean(rpc?.result?.isError) };
}

const happyClaims = [
  { indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.45 },
  { indicator: "inflation_cpi", country: "USA", period: "2024", claimed_value: 6.0 },
  { indicator: "dbnomics/IMF/WEO:latest/BRB.NGDP_RPCH.pcent_change", period: "2023", claimed_value: 4.2 },
  { indicator: "govt_debt_gdp", country: "BRB", period: "2023", claimed_value: 115.3 },
];

test("happy batch: mixed verdicts across indicators/countries, exact summary, input order, citations", async () => {
  installFetchStub();
  const { payload, isError } = await mcpTool("verify_claims", { claims: happyClaims });
  assert.equal(isError, false);
  assert.deepEqual(payload.summary, { total: 4, match: 2, close: 1, mismatch: 1, cannot_verify: 0, error: 0 });
  assert.equal(payload.results.length, 4);
  assert.deepEqual(payload.results.map((r: any) => r.claim), happyClaims);
  const verdicts = payload.results.map((r: any) => r.verification.verdict);
  assert.deepEqual(verdicts, ["match", "mismatch", "close", "match"]);
  for (const r of payload.results) {
    assert.equal(r.ok, true);
    assert.ok(r.verification.citation, "every ok result carries a citation");
    assert.ok(r.verification.citation.citation_text, "citation_text present");
    assert.equal(typeof r.verification.is_projection, "boolean");
  }
  assert.equal(payload.note, undefined, "no projection note when no projection periods verified");
});

test("per-claim error isolation: a bogus indicator reports advice without sinking the batch", async () => {
  installFetchStub();
  const claims = [
    { indicator: "not_a_real_indicator", period: "2024", claimed_value: 5 },
    { indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.45 },
  ];
  const { payload, isError } = await mcpTool("verify_claims", { claims });
  assert.equal(isError, false);
  assert.deepEqual(payload.summary, { total: 2, match: 1, close: 0, mismatch: 0, cannot_verify: 0, error: 1 });
  assert.equal(payload.results[0].ok, false);
  assert.deepEqual(payload.results[0].claim, claims[0]);
  assert.match(payload.results[0].error, /not_a_real_indicator/);
  assert.match(payload.results[0].error, /search_indicators/, "error is advice with suggestions");
  assert.equal(payload.results[1].ok, true);
  assert.equal(payload.results[1].verification.verdict, "match");
});

test("cap rejection: 16 claims rejected with advice, before any upstream fetch", async () => {
  installFetchStub();
  const sixteen = Array.from({ length: 16 }, () => ({ indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.4 }));
  const { payload, isError } = await mcpTool("verify_claims", { claims: sixteen });
  assert.equal(isError, true);
  assert.match(payload.error, /16/);
  assert.match(payload.error, /15/);
  assert.match(payload.error, /[Ss]plit/);
  assert.equal(fetchCount, 0, "rejected before any upstream fetch");
});

test("empty claims array rejected with workflow advice, before any upstream fetch", async () => {
  installFetchStub();
  const { payload, isError } = await mcpTool("verify_claims", { claims: [] });
  assert.equal(isError, true);
  assert.match(payload.error, /empty/i);
  assert.match(payload.error, /claim/i);
  assert.equal(fetchCount, 0);
});

test("claim-level validation: missing period and non-numeric claimed_value reject the call", async () => {
  installFetchStub();
  const noPeriod = await mcpTool("verify_claims", { claims: [{ indicator: "inflation_cpi", country: "BRB", claimed_value: 1.4 }] });
  assert.equal(noPeriod.isError, true);
  assert.match(noPeriod.payload.error, /claims\[0\]\.period/);
  const badValue = await mcpTool("verify_claims", {
    claims: [{ indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: "one point four" }],
  });
  assert.equal(badValue.isError, true);
  assert.match(badValue.payload.error, /claims\[0\]\.claimed_value/);
  assert.equal(fetchCount, 0);
});

test("projection note appears when a claim is verified against a WEO projection period", async () => {
  installFetchStub();
  // govt_debt_gdp is now DataMapper-primary: boundary = payload horizon (2031) - 5 = 2026,
  // so 2026 is the first projection year for the April-2026-edition fixture above.
  const claims = [
    { indicator: "govt_debt_gdp", country: "BRB", period: "2026", claimed_value: 98.0 },
    { indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.45 },
  ];
  const { payload, isError } = await mcpTool("verify_claims", { claims });
  assert.equal(isError, false);
  assert.deepEqual(payload.summary, { total: 2, match: 2, close: 0, mismatch: 0, cannot_verify: 0, error: 0 });
  assert.equal(payload.results[0].verification.is_projection, true);
  assert.equal(payload.results[1].verification.is_projection, false);
  assert.equal(payload.note, "1 claim(s) verified against IMF WEO/Fiscal Monitor projections, not outturns.");
});

test("REST POST /v1/verify_claims mirrors the MCP output exactly", async () => {
  installFetchStub();
  const mcp = await mcpTool("verify_claims", { claims: happyClaims });
  const res = await call("/v1/verify_claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: happyClaims }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  const body = await res.json();
  assert.deepEqual(body, mcp.payload);
});

test("REST /v1/verify_claims: malformed body, wrong shape, wrong content-type, wrong method", async () => {
  installFetchStub();
  const malformed = await call("/v1/verify_claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ not json",
  });
  assert.equal(malformed.status, 422);
  assert.match(((await malformed.json()) as any).error.message, /JSON/);

  const noClaims = await call("/v1/verify_claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(noClaims.status, 422);
  assert.match(((await noClaims.json()) as any).error.message, /claims/);

  const bareArray = await call("/v1/verify_claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(happyClaims),
  });
  assert.equal(bareArray.status, 422);
  assert.match(((await bareArray.json()) as any).error.message, /\{ "claims": \[\.\.\.\] \}/);

  const wrongType = await call("/v1/verify_claims", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ claims: happyClaims }),
  });
  assert.equal(wrongType.status, 415);
  assert.match(((await wrongType.json()) as any).error.message, /application\/json/);

  const get = await call("/v1/verify_claims");
  assert.equal(get.status, 405);
  assert.match(((await get.json()) as any).error.message, /POST/);

  const options = await call("/v1/verify_claims", { method: "OPTIONS" });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), "*");
});

test("REST 422 on claim validation errors carries the advice message", async () => {
  installFetchStub();
  const res = await call("/v1/verify_claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: Array.from({ length: 16 }, () => ({ indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.4 })) }),
  });
  assert.equal(res.status, 422);
  const body = (await res.json()) as any;
  assert.match(body.error.message, /15/);
  assert.match(body.error.message, /[Ss]plit/);
  assert.equal(fetchCount, 0);
});

test("analytics: one usage event with op verify_claims on MCP and on REST", async () => {
  installFetchStub();
  const points: Array<{ indexes?: string[]; blobs?: string[]; doubles?: number[] }> = [];
  const sinkEnv: Env = { ...env, STATCITE_USAGE: { writeDataPoint: (p) => points.push(p) } };
  const claims = [{ indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.45 }];
  await mcpTool("verify_claims", { claims }, sinkEnv);
  const res = await call(
    "/v1/verify_claims",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims }) },
    sinkEnv,
  );
  assert.equal(res.status, 200);
  assert.equal(points.length, 2);
  assert.deepEqual(points.map((p) => p.blobs?.[0]), ["mcp", "rest"]);
  assert.deepEqual(points.map((p) => p.blobs?.[1]), ["verify_claims", "verify_claims"]);
  assert.deepEqual(points.map((p) => p.blobs?.[5]), ["ok", "ok"]);
});

test("tools/list reports 12 tools and includes verify_claims with the workflow description", async () => {
  const res = await call("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++idCounter, method: "tools/list" }),
  });
  const body = (await res.json()) as any;
  const tools = body.result.tools;
  assert.equal(tools.length, 12); // 11 + compare_sources (v1.6.0)
  const vc = tools.find((t: any) => t.name === "verify_claims");
  assert.ok(vc, "verify_claims listed");
  assert.equal(vc.inputSchema.properties.claims.maxItems, 15);
  assert.equal(vc.inputSchema.properties.claims.minItems, 1);
  assert.match(vc.description, /extract every checkable macro claim/i);
  assert.match(vc.description, /15/);
  assert.match(vc.description, /citation/);
});
