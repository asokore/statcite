// Usage analytics: field contract, PII exclusion, and failure isolation.
// Deliberately self-contained — no test/helpers.ts import; every stub is local
// and no test in this file touches the network.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import {
  buildDataPoint,
  recordUsage,
  restOp,
  durationBucket,
  indicatorLabel,
  countryLabel,
  verdictLabel,
  type UsageEvent,
} from "../src/core/analytics.ts";

// ——— local stubs ———————————————————————————————————————————————

type Point = { indexes?: string[]; blobs?: string[]; doubles?: number[] };

class CapturingSink {
  points: Point[] = [];
  writeDataPoint(p: Point): void {
    this.points.push(p);
  }
  get last(): Point {
    assert.ok(this.points.length > 0, "expected at least one analytics data point");
    return this.points[this.points.length - 1];
  }
  clear(): void {
    this.points.length = 0;
  }
}

class ThrowingSink {
  calls = 0;
  writeDataPoint(): void {
    this.calls++;
    throw new Error("analytics backend exploded");
  }
}

const sink = new CapturingSink();

function envWith(analytics?: { writeDataPoint(p: Point): void }): Env {
  return {
    ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
    BASE_URL: "https://statcite.test",
    STATCITE_USAGE: analytics,
  };
}

/** Headers a real caller would send. None of these may ever be recorded. */
const CALLER_HEADERS = {
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (SecretAgent 9.9; bob@example.com)",
  "cf-connecting-ip": "203.0.113.77",
  authorization: "Bearer sk-super-secret-token",
  cookie: "session=abc123",
};

async function mcpTool(name: string, args: Record<string, unknown>, env: Env = envWith(sink)) {
  const res = await handleRequest(
    new Request("https://statcite.test/mcp", {
      method: "POST",
      headers: CALLER_HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    env,
  );
  const rpc: any = await res.json();
  return { res, rpc, isError: Boolean(rpc?.result?.isError) };
}

async function rest(path: string, env: Env = envWith(sink)) {
  return handleRequest(new Request(`https://statcite.test${path}`, { headers: CALLER_HEADERS }), env);
}

/** Every string a data point would write, flattened for substring assertions. */
function flatten(p: Point): string {
  return JSON.stringify([p.indexes ?? [], p.blobs ?? [], p.doubles ?? []]);
}

// Guard: nothing in this file may reach the network, and console noise from the
// second (free) sink is swallowed so the test output stays readable.
const realFetch = globalThis.fetch;
const realLog = console.log;
let fetchCalls: string[] = [];
const logLines: string[] = [];

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    fetchCalls.push(u);
    throw new Error(`network access is not allowed in analytics.test.ts (${u})`);
  }) as typeof fetch;
  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(" "));
  };
});

after(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
});

beforeEach(() => {
  sink.clear();
  logLines.length = 0;
  fetchCalls = [];
});

// ——— 1. field contract ————————————————————————————————————————

test("buildDataPoint emits the documented schema positions", () => {
  const ev: UsageEvent = {
    transport: "mcp",
    op: "verify_stat",
    indicator: "inflation_cpi",
    country: "BRB",
    verdict: "close",
    outcome: "ok",
    durationMs: 250,
  };
  const dp = buildDataPoint(ev);
  assert.deepEqual(dp.indexes, ["verify_stat"]);
  assert.deepEqual(dp.blobs, ["mcp", "verify_stat", "inflation_cpi", "BRB", "close", "ok", "lt500ms"]);
  assert.deepEqual(dp.doubles, [1, 250, 1]);
  // Analytics Engine limits: <=20 blobs, <=20 doubles, exactly one index.
  assert.ok(dp.blobs.length <= 20 && dp.doubles.length <= 20 && dp.indexes.length === 1);
  assert.ok(new TextEncoder().encode(dp.indexes[0]).length <= 96, "index must be <= 96 bytes");
});

test("labels are drawn from closed sets", () => {
  assert.equal(indicatorLabel("gdp_growth"), "gdp_growth");
  assert.equal(indicatorLabel("worldbank/NY.GDP.MKTP.KD.ZG"), "worldbank/*");
  assert.equal(indicatorLabel("fred/UNRATE"), "fred/*");
  assert.equal(indicatorLabel("dbnomics/IMF/WEO:latest/BRB.NGDP_RPCH.pcent_change"), "dbnomics/*");
  assert.equal(indicatorLabel("please email me at bob@example.com"), "other");
  assert.equal(indicatorLabel(undefined), undefined);

  assert.equal(countryLabel("Barbados"), "BRB");
  assert.equal(countryLabel("USA"), "USA");
  assert.equal(countryLabel("203.0.113.77"), undefined);
  assert.equal(countryLabel("bob@example.com"), undefined);
  assert.equal(countryLabel("x".repeat(400)), undefined);

  assert.equal(verdictLabel("mismatch"), "mismatch");
  assert.equal(verdictLabel("cannot_verify"), "cannot_verify");
  assert.equal(verdictLabel("totally-made-up"), undefined);

  assert.equal(durationBucket(0), "lt50ms");
  assert.equal(durationBucket(49), "lt50ms");
  assert.equal(durationBucket(50), "lt200ms");
  assert.equal(durationBucket(999), "lt1s");
  assert.equal(durationBucket(1000), "lt3s");
  assert.equal(durationBucket(9999), "gte3s");
  assert.equal(durationBucket(Number.NaN), "unknown");

  assert.equal(restOp("/v1/sources"), "sources");
  assert.equal(restOp("/v1/indicator/inflation_cpi"), "indicator");
  assert.equal(restOp("/v1/snapshot/Barbados"), "snapshot");
  assert.equal(restOp("/v1/../../etc/passwd"), "unknown");
});

// ——— 2. no PII ————————————————————————————————————————————————

test("hostile / personal input never reaches the data point", () => {
  const dp = buildDataPoint({
    transport: "rest" as any,
    op: "../../etc/passwd",
    indicator: "my salary at Acme is 120000, email bob@example.com",
    country: "203.0.113.77",
    verdict: "<script>alert(1)</script>",
    outcome: "definitely-not-an-outcome" as any,
    durationMs: 42,
  });
  const flat = flatten(dp);
  for (const leak of ["salary", "Acme", "bob@example.com", "203.0.113.77", "script", "etc/passwd", "120000"]) {
    assert.ok(!flat.includes(leak), `data point leaked '${leak}': ${flat}`);
  }
  assert.equal(dp.indexes[0], "unknown");
  assert.equal(dp.blobs[2], "other");
  assert.equal(dp.blobs[3], "");
  assert.equal(dp.blobs[4], "");
  assert.equal(dp.blobs[5], "crash"); // unknown outcome collapses, never passes through
});

test("MCP: free-text search query and caller headers are not recorded", async () => {
  const { res, isError } = await mcpTool("search", { query: "inflation barbados bob@example.com 203.0.113.77" });
  assert.equal(res.status, 200);
  assert.equal(isError, false);
  const flat = flatten(sink.last);
  for (const leak of ["bob@example.com", "203.0.113.77", "SecretAgent", "sk-super-secret-token", "session=abc123", "Mozilla"]) {
    assert.ok(!flat.includes(leak), `usage event leaked '${leak}': ${flat}`);
  }
  assert.deepEqual(sink.last.blobs?.slice(0, 2), ["mcp", "search"]);
  // The console-line sink must be equally clean.
  assert.equal(logLines.length, 1);
  assert.ok(logLines[0].startsWith("STATCITE_USAGE "));
  for (const leak of ["bob@example.com", "203.0.113.77", "SecretAgent", "sk-super-secret-token"]) {
    assert.ok(!logLines[0].includes(leak), `console line leaked '${leak}': ${logLines[0]}`);
  }
});

test("recorded fields are exactly the seven agreed dimensions", () => {
  recordUsage(sink, {
    transport: "mcp",
    op: "get_indicator",
    indicator: "gdp_growth",
    country: "BRB",
    outcome: "ok",
    durationMs: 10,
  });
  const parsed = JSON.parse(logLines[0].slice("STATCITE_USAGE ".length));
  assert.deepEqual(Object.keys(parsed).sort(), ["bucket", "country", "indicator", "ms", "op", "outcome", "transport"]);
  const forbidden = ["ip", "user_agent", "userAgent", "headers", "query", "q", "session", "id", "token", "auth", "claimed_value", "url"];
  for (const k of forbidden) assert.ok(!(k in parsed), `usage record must not carry '${k}'`);
});

// ——— 3. wired into the MCP dispatch path ——————————————————————

test("MCP tool call emits one ok event", async () => {
  const { res, isError } = await mcpTool("list_sources", {});
  assert.equal(res.status, 200);
  assert.equal(isError, false);
  assert.equal(sink.points.length, 1);
  assert.deepEqual(sink.last.indexes, ["list_sources"]);
  assert.deepEqual(sink.last.blobs?.slice(0, 2), ["mcp", "list_sources"]);
  assert.equal(sink.last.blobs?.[5], "ok");
  assert.equal(sink.last.doubles?.[0], 1);
  assert.equal(sink.last.doubles?.[2], 1);
});

test("MCP tool failure records outcome=tool_error and keeps the indicator key", async () => {
  const { isError } = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "Freedonia" });
  assert.equal(isError, true);
  assert.equal(sink.last.blobs?.[2], "inflation_cpi");
  assert.equal(sink.last.blobs?.[3], ""); // unresolvable country is dropped, not stored
  assert.equal(sink.last.blobs?.[5], "tool_error");
  assert.equal(sink.last.doubles?.[2], 0);
  assert.deepEqual(fetchCalls, [], "must not have hit the network");
});

test("MCP records the resolved ISO3 for a plain-English country name", async () => {
  await mcpTool("get_indicator", { indicator: "not_a_real_key", country: "Barbados" });
  assert.equal(sink.last.blobs?.[2], "other"); // unknown key is not echoed back
  assert.equal(sink.last.blobs?.[3], "BRB");
  assert.equal(sink.last.blobs?.[5], "tool_error");
});

test("MCP: unknown tool name is not turned into an analytics dimension", async () => {
  const { rpc } = await mcpTool("../../secret_tool", {});
  assert.ok(rpc.error, "unknown tool should be a protocol error");
  assert.equal(sink.points.length, 0);
});

// ——— 4. wired into the REST path ————————————————————————————

test("REST success emits one ok event with the endpoint name", async () => {
  const res = await rest("/v1/sources");
  assert.equal(res.status, 200);
  assert.equal(sink.points.length, 1);
  assert.deepEqual(sink.last.blobs?.slice(0, 2), ["rest", "sources"]);
  assert.equal(sink.last.blobs?.[5], "ok");
});

test("REST 422 records the endpoint, ISO3 and tool_error", async () => {
  const res = await rest("/v1/indicator/not_a_real_key?country=Barbados");
  assert.equal(res.status, 422);
  assert.deepEqual(sink.last.indexes, ["indicator"]);
  assert.equal(sink.last.blobs?.[0], "rest");
  assert.equal(sink.last.blobs?.[2], "other");
  assert.equal(sink.last.blobs?.[3], "BRB");
  assert.equal(sink.last.blobs?.[5], "tool_error");
});

test("REST unknown endpoint is bucketed, not echoed", async () => {
  const res = await rest("/v1/does-not-exist?country=Barbados&secret=hunter2");
  assert.equal(res.status, 404);
  assert.deepEqual(sink.last.indexes, ["unknown"]);
  assert.ok(!flatten(sink.last).includes("hunter2"));
  assert.ok(!flatten(sink.last).includes("does-not-exist"));
});

test("non-GET REST requests are not recorded", async () => {
  const res = await handleRequest(new Request("https://statcite.test/v1/sources", { method: "POST" }), envWith(sink));
  assert.equal(res.status, 405);
  assert.equal(sink.points.length, 0);
});

// ——— 5. failure isolation —————————————————————————————————————

test("a throwing analytics sink does not break the MCP tool response", async () => {
  const bad = new ThrowingSink();
  const { res, rpc, isError } = await mcpTool("list_sources", {}, envWith(bad));
  assert.equal(bad.calls, 1, "the sink was actually exercised");
  assert.equal(res.status, 200);
  assert.equal(isError, false);
  const payload = JSON.parse(rpc.result.content[0].text);
  assert.ok(Array.isArray(payload.sources) && payload.sources.length > 0);
  // The free console sink still produced its line despite the binding failing.
  assert.equal(logLines.filter((l) => l.startsWith("STATCITE_USAGE ")).length, 1);
});

test("a throwing analytics sink does not break the REST response", async () => {
  const bad = new ThrowingSink();
  const res = await handleRequest(new Request("https://statcite.test/v1/sources"), envWith(bad));
  assert.equal(bad.calls, 1);
  assert.equal(res.status, 200);
  const body: any = await res.json();
  assert.ok(Array.isArray(body.sources));
});

test("recordUsage swallows every sink failure mode", () => {
  const ev: UsageEvent = { transport: "mcp", op: "list_sources", outcome: "ok", durationMs: 1 };
  assert.doesNotThrow(() => recordUsage(undefined, ev));
  assert.doesNotThrow(() => recordUsage(new ThrowingSink() as any, ev));
  assert.doesNotThrow(() => recordUsage({ writeDataPoint: null } as any, ev));
  assert.doesNotThrow(() => recordUsage(sink, { ...ev, durationMs: Number.NaN }));
  assert.doesNotThrow(() => recordUsage(sink, null as any));
});

test("no analytics binding (local dev) is a no-op that still serves requests", async () => {
  const res = await handleRequest(new Request("https://statcite.test/v1/sources"), envWith(undefined));
  assert.equal(res.status, 200);
  assert.equal(logLines.filter((l) => l.startsWith("STATCITE_USAGE ")).length, 1);
});
