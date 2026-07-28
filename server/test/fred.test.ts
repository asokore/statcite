// FRED adapter tests (server/src/adapters/fred.ts).
//
// FRED is permanently disabled (2026-07-26): FRED's Terms of Use (updated June
// 2024) prohibit both AI/ML/LLM use of FRED content and caching/redistributing
// it to third parties, which is exactly what an AI-agent-facing, edge-caching
// MCP/REST service does. The disable is unconditional — it must hold even when
// FRED_API_KEY is configured, so these tests deliberately exercise the
// "key present" case too, not just the "no key" case, to prove this isn't a
// missing-credential guard that a stray secret could silently reopen.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

/** A distinctive "secret" — if any code path ever reaches the network, this proves it wasn't the guard. */
const CANARY_KEY = "sk-test-LEAKCANARY";

let fetchCallCount = 0;

/** A fetch stub that fails the test if invoked — proves the disable short-circuits before any upstream call. */
function installNoFetchGuard(): void {
  _clearMemCache();
  fetchCallCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCallCount++;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    throw new Error(`fetch must not be called — FRED is permanently disabled, but a fetch was attempted for: ${url}`);
  }) as typeof fetch;
}

function makeEnv(fredApiKey?: string): Env {
  return {
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html><title>StatCite</title>", { headers: { "content-type": "text/html" } }),
    },
    BASE_URL: "https://statcite.test",
    FRED_API_KEY: fredApiKey,
  };
}

async function call(env: Env, path: string, init?: RequestInit): Promise<Response> {
  return handleRequest(new Request(`https://statcite.test${path}`, init), env);
}

let idCounter = 9000;
async function mcpTool(
  env: Env,
  name: string,
  args: Record<string, unknown>,
): Promise<{ res: Response; rpc: any; payload: any; isError: boolean }> {
  const res = await call(env, "/mcp", {
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
  return { res, rpc, payload, isError: Boolean(rpc?.result?.isError) };
}

beforeEach(() => {
  fetchCallCount = 0;
});

for (const keyLabel of ["no key configured", "a key configured"] as const) {
  const key = keyLabel === "a key configured" ? CANARY_KEY : undefined;

  test(`get_series fred/UNRATE with ${keyLabel}: declines as disabled, no fetch attempted`, async () => {
    installNoFetchGuard();
    const env = makeEnv(key);

    const { payload, isError } = await mcpTool(env, "get_series", { series_id: "fred/UNRATE" });
    assert.equal(isError, true);
    assert.match(payload.error, /FRED series are disabled on this server/);
    assert.match(payload.error, /terms of use prohibit AI\/ML use and caching\/redistribution/);
    assert.match(payload.error, /worldbank\/\.\.\.` series or a registry indicator key/);
    assert.equal(fetchCallCount, 0, "no upstream call should ever be attempted, key or no key");
    assert.ok(!JSON.stringify(payload).includes(CANARY_KEY), "no key material should ever appear in a response");
  });

  test(`REST /v1/series?id=fred/UNRATE with ${keyLabel}: 422 declines as disabled, no fetch attempted`, async () => {
    installNoFetchGuard();
    const env = makeEnv(key);

    const res = await call(env, "/v1/series?id=fred/UNRATE");
    assert.equal(res.status, 422);
    const body = (await res.json()) as any;
    assert.match(body.error.message, /FRED series are disabled on this server/);
    assert.equal(fetchCallCount, 0, "no upstream call should ever be attempted, key or no key");
  });

  test(`get_indicator for a FRED-only US indicator with ${keyLabel}: declines as disabled, no fetch attempted`, async () => {
    installNoFetchGuard();
    const env = makeEnv(key);

    const { payload, isError } = await mcpTool(env, "get_series", { series_id: "fred/CPIAUCSL" });
    assert.equal(isError, true);
    assert.match(payload.error, /FRED series are disabled on this server/);
    assert.equal(fetchCallCount, 0);
  });
}

test("fredAvailable() reports unavailable regardless of a configured key", async () => {
  const { fredAvailable } = await import("../src/adapters/fred.ts");
  assert.equal(fredAvailable({ baseUrl: "https://statcite.test", fredApiKey: CANARY_KEY } as any), false);
  assert.equal(fredAvailable({ baseUrl: "https://statcite.test" } as any), false);
});

// ——— v1.4.2: machine-facing disabled disclosure (fourth external review) ———
// The human docs table marked the six FRED-reserved keys "— disabled", but the
// machine surfaces (listRegistry JSON, search_indicators results) presented them
// like any other key, with a normal usage instruction that always declines.

test("listRegistry marks exactly the six FRED-reserved keys inactive with a disabled_reason", async () => {
  const { listRegistry } = await import("../src/core/series.ts");
  const reg = listRegistry();
  const inactive = reg.filter((r) => !r.active);
  const active = reg.filter((r) => r.active);
  assert.equal(inactive.length, 6);
  assert.equal(active.length, reg.length - 6);
  for (const r of inactive) {
    assert.match(r.disabled_reason ?? "", /permanently disabled/i);
    assert.ok(r.sources.includes("FRED (US) — disabled"), `${r.key} should carry the disabled source label`);
  }
  for (const r of active) {
    assert.equal(r.disabled_reason, undefined);
    assert.ok(!r.sources.some((s) => s.includes("FRED")), `${r.key} is active — an inert fred field must not surface as a source`);
  }
});

test("search_indicators marks a disabled key: active:false, DISABLED description, no normal usage instruction", async () => {
  installNoFetchGuard(); // DBnomics secondary search is best-effort; the guard just keeps it offline
  const env = makeEnv();
  const { payload, isError } = await mcpTool(env, "search_indicators", { query: "federal funds rate" });
  assert.equal(isError, false);
  const hit = payload.results.find((r: any) => r.id === "us_fed_funds_rate");
  assert.ok(hit, "expected us_fed_funds_rate in results");
  assert.equal(hit.active, false);
  assert.match(hit.description, /^DISABLED/);
  assert.match(hit.usage, /Do not call/);
  assert.ok(!hit.usage.includes("get_indicator("), "a disabled key must not carry the normal usage instruction");
});

test("search_indicators leaves active keys unmarked and usable", async () => {
  installNoFetchGuard();
  const env = makeEnv();
  const { payload } = await mcpTool(env, "search_indicators", { query: "inflation" });
  const hit = payload.results.find((r: any) => r.id === "inflation_cpi");
  assert.ok(hit, "expected inflation_cpi in results");
  assert.equal(hit.active, true);
  assert.match(hit.usage, /get_indicator\(/);
  assert.ok(!/^DISABLED/.test(hit.description));
});

test("REST /v1/indicators carries active + disabled_reason", async () => {
  const env = makeEnv();
  const res = await call(env, "/v1/indicators");
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  const disabled = body.indicators.filter((r: any) => r.active === false);
  assert.equal(disabled.length, 6);
  assert.ok(disabled.every((r: any) => typeof r.disabled_reason === "string"));
});
