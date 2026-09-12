// MCP tool arguments are held to the input schema each tool advertises.
//
// Live on 2026-09-12, before this check existed: verify_stat for US 2023 CPI
// with claimed_value 4.3 and tolerance_abs 0.01 returned "mismatch", and the
// same call with the key spelled tolerence_abs returned "close". A string
// "true" for strict_source was silently read as false.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { TOOLS, checkToolArgs } from "../src/tools.ts";

const env = { ASSETS: { fetch: async () => new Response("site") }, BASE_URL: "https://statcite.com" } as unknown as Env;

async function call(name: string, args: unknown) {
  const res = await handleRequest(
    new Request("https://statcite.com/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    env,
  );
  const body = (await res.json()) as any;
  const text = body.result?.content?.[0]?.text ?? "";
  return { isError: body.result?.isError === true, payload: text ? JSON.parse(text) : null };
}

test("a misspelled tolerance on verify_stat is refused with the real name, before any upstream call", async () => {
  const realFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => { fetches++; return realFetch(...a); }) as typeof fetch;
  try {
    const { isError, payload } = await call("verify_stat", {
      indicator: "inflation_cpi", country: "USA", period: "2023", claimed_value: 4.3, tolerence_abs: 0.01,
    });
    assert.equal(isError, true, "the call must fail, not return a verdict");
    assert.match(payload.error, /Unknown argument 'tolerence_abs'/);
    assert.match(payload.error, /Did you mean 'tolerance_abs'\?/);
    assert.equal(fetches, 0, "no data may be fetched for a refused call");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("'value' on verify_stat points at claimed_value", async () => {
  const { isError, payload } = await call("verify_stat", { indicator: "inflation_cpi", country: "USA", period: "2023", value: 4.3 });
  assert.equal(isError, true);
  assert.match(payload.error, /claimed_value/);
});

test("a string boolean is refused rather than read as false", async () => {
  const { isError, payload } = await call("get_indicator", { indicator: "inflation_cpi", country: "USA", strict_source: "true" });
  assert.equal(isError, true);
  assert.match(payload.error, /'strict_source'.*must be a JSON boolean/);
});

test("every tool accepts each argument it declares, so the check cannot refuse a valid call", () => {
  // Build one argument object per tool from its own schema and confirm the
  // name/type check passes. A schema typo would otherwise lock callers out.
  const sample = (p: any): unknown => {
    const t = Array.isArray(p.type) ? p.type[0] : p.type;
    if (t === "boolean") return true;
    if (t === "number" || t === "integer") return 1;
    if (t === "array") return [];
    if (t === "object") return {};
    return "x";
  };
  for (const tool of TOOLS) {
    const props = ((tool.inputSchema as any).properties ?? {}) as Record<string, any>;
    const args = Object.fromEntries(Object.entries(props).map(([k, p]) => [k, sample(p)]));
    assert.doesNotThrow(() => checkToolArgs(tool, args), `${tool.name} must accept its own declared arguments`);
    assert.equal((tool.inputSchema as any).additionalProperties, false, `${tool.name} should declare additionalProperties: false`);
  }
});

test("list_sources with no arguments still works, and with an invented one is refused", async () => {
  const ok = await call("list_sources", {});
  assert.equal(ok.isError, false);
  const bad = await call("list_sources", { verbose: true });
  assert.equal(bad.isError, true);
  assert.match(bad.payload.error, /Accepted: no arguments/);
});
