// Revision-aware verification (BRIEF §6.1): verify_stat/verify_claims `as_of`
// pins the verdict to the IMF WEO/Fiscal Monitor edition that was current on a
// given date, via DBnomics's dated editions, instead of today's live data.
// Self-contained (own fetch stub + own Env), like fred.test.ts, so it can't
// perturb the shared helpers.ts route table.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
function fixture(name: string): string {
  return readFileSync(`${fixturesDir}${name}.json`, "utf8");
}

type Route = { test: (url: string) => boolean; body: () => string; status?: number };

let fetchCallCount = 0;

function installAsOfFetchStub(): void {
  _clearMemCache();
  fetchCallCount = 0;
  const routes: Route[] = [
    {
      test: (u) => u.includes("api.db.nomics.world") && u.includes("WEO%3A2018-10") && u.includes("USA.NGDP_RPCH"),
      body: () => fixture("dbnomics-series-weo-2018-10"),
    },
  ];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCallCount++;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((r) => r.test(url));
    if (!route) {
      return new Response(JSON.stringify({ error: "no as-of fixture for " + url }), { status: 599 });
    }
    return new Response(route.body(), { status: route.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function installNoFetchGuard(): void {
  _clearMemCache();
  fetchCallCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCallCount++;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    throw new Error(`fetch must not be called for a validation-only rejection, but was called for: ${url}`);
  }) as typeof fetch;
}

const testEnv: Env = {
  ASSETS: {
    fetch: async () => new Response("<!doctype html><title>StatCite</title>", { headers: { "content-type": "text/html" } }),
  },
  BASE_URL: "https://statcite.test",
};

async function call(path: string, init?: RequestInit): Promise<Response> {
  return handleRequest(new Request(`https://statcite.test${path}`, init), testEnv);
}

let idCounter = 9500;
async function mcpTool(name: string, args: Record<string, unknown>): Promise<{ rpc: any; payload: any; isError: boolean }> {
  const res = await call("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++idCounter, method: "tools/call", params: { name, arguments: args } }),
  });
  const rpc = (await res.json()) as any;
  const text = rpc?.result?.content?.[0]?.text;
  let payload: any = undefined;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }
  return { rpc, payload, isError: Boolean(rpc?.result?.isError) };
}

test("verify_stat as_of=2019-04 resolves the WEO:2018-10 vintage (April edition not yet current), distinct series id, and discloses the pin", async () => {
  installAsOfFetchStub();
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "gdp_growth",
    country: "USA",
    period: "2018",
    claimed_value: 2.9,
    as_of: "2019-04",
  });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.verdict, "match");
  assert.equal(payload.official_value, 2.9);
  assert.equal(payload.series.id, "dbnomics/IMF/WEO:2018-10/USA.NGDP_RPCH.pcent_change");
  assert.deepEqual(payload.as_of, { requested: "2019-04", resolved_vintage: "2018-10" });
  assert.ok(
    payload.notes.some((n: string) => /Pinned to the WEO:2018-10 vintage/.test(n)),
    `expected a vintage-pin disclosure note, got: ${JSON.stringify(payload.notes)}`,
  );
});

test("verify_stat as_of marks periods at/after the resolved vintage year as projections, not outturns", async () => {
  installAsOfFetchStub();
  const { payload } = await mcpTool("verify_stat", {
    indicator: "gdp_growth",
    country: "USA",
    period: "2019",
    claimed_value: 2.3,
    as_of: "2019-04",
  });
  assert.equal(payload.is_projection, true);
  assert.equal(payload.observation_status, "projection");
});

test("verify_stat rejects as_of for an indicator with no dated IMF vintage (population), no fetch attempted", async () => {
  installNoFetchGuard();
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "population",
    country: "USA",
    period: "2020",
    claimed_value: 331000000,
    as_of: "2020",
  });
  assert.equal(isError, true);
  assert.match(payload.error, /'as_of' is only supported for indicators with a dated IMF WEO\/Fiscal Monitor edition/);
  assert.match(payload.error, /gdp_growth/);
  assert.equal(fetchCallCount, 0);
});

test("verify_stat rejects as_of on an explicit (non-registry) series id, no fetch attempted", async () => {
  installNoFetchGuard();
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "worldbank/NY.GDP.MKTP.KD.ZG",
    country: "USA",
    period: "2019",
    claimed_value: 2.3,
    as_of: "2019-04",
  });
  assert.equal(isError, true);
  assert.match(payload.error, /'as_of' only applies to registry indicator keys/);
  assert.equal(fetchCallCount, 0);
});

test("verify_stat rejects a malformed as_of date, no fetch attempted", async () => {
  installNoFetchGuard();
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "gdp_growth",
    country: "USA",
    period: "2019",
    claimed_value: 2.3,
    as_of: "not-a-date",
  });
  assert.equal(isError, true);
  assert.match(payload.error, /'as_of' should be a date like/);
  assert.equal(fetchCallCount, 0);
});

test("verify_claims threads as_of per-claim through the batch engine", async () => {
  installAsOfFetchStub();
  const { payload, isError } = await mcpTool("verify_claims", {
    claims: [{ indicator: "gdp_growth", country: "USA", period: "2018", claimed_value: 2.9, as_of: "2019-04" }],
  });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.summary.match, 1);
  assert.equal(payload.results[0].ok, true);
  assert.deepEqual(payload.results[0].verification.as_of, { requested: "2019-04", resolved_vintage: "2018-10" });
});

test("REST GET /v1/verify accepts as_of as a query parameter", async () => {
  installAsOfFetchStub();
  const res = await call(
    "/v1/verify?indicator=gdp_growth&country=USA&period=2018&value=2.9&as_of=2019-04",
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.verdict, "match");
  assert.deepEqual(body.as_of, { requested: "2019-04", resolved_vintage: "2018-10" });
});
