import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, call, mcpCall, mcpTool, testEnv } from "./helpers.ts";

beforeEach(() => installFetchStub());

test("initialize echoes a supported protocol version", async () => {
  const res = await mcpCall({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type")!, /application\/json/);
  const body = await res.json() as any;
  assert.equal(body.result.protocolVersion, "2025-06-18");
  assert.equal(body.result.serverInfo.name, "statcite");
  assert.ok(body.result.capabilities.tools);
  assert.ok(body.result.instructions.length > 50);
  assert.equal(res.headers.get("mcp-session-id"), null); // stateless: no session id
});

test("initialize falls back to latest for unknown versions", async () => {
  const res = await mcpCall({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  const body = await res.json() as any;
  assert.equal(body.result.protocolVersion, "2025-11-25");
});

test("notifications/initialized -> 202 empty", async () => {
  const res = await mcpCall({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(res.status, 202);
  assert.equal(await res.text(), "");
});

test("tools/list exposes the full tool set with schemas + annotations", async () => {
  const res = await mcpCall({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  const body = await res.json() as any;
  const tools = body.result.tools;
  const names = tools.map((t: any) => t.name);
  for (const expected of [
    "get_indicator", "verify_stat", "get_series", "search_indicators",
    "country_snapshot", "inflation_adjust", "fx_convert", "list_sources", "search", "fetch",
  ]) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
  for (const t of tools) {
    assert.ok(t.inputSchema?.type === "object", `${t.name} lacks inputSchema`);
    assert.equal(t.annotations.readOnlyHint, true);
  }
  const search = tools.find((t: any) => t.name === "search");
  assert.ok(search.outputSchema, "search must declare outputSchema for ChatGPT compatibility");
});

test("JSON-RPC batch: processed for 2025-03-26 clients; empty batch rejected", async () => {
  const res = await mcpCall([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.ok(Array.isArray(body) && body.length === 1);
  const empty = await mcpCall([]);
  assert.equal(empty.status, 400);
});

test("unknown method -> -32601", async () => {
  const res = await mcpCall({ jsonrpc: "2.0", id: 9, method: "does/not/exist" });
  const body = await res.json() as any;
  assert.equal(body.error.code, -32601);
});

test("ping works", async () => {
  const res = await mcpCall({ jsonrpc: "2.0", id: 4, method: "ping" });
  const body = await res.json() as any;
  assert.deepEqual(body.result, {});
});

test("GET /mcp -> 405; OPTIONS -> 204 with CORS", async () => {
  const get = await call("/mcp");
  assert.equal(get.status, 405);
  const opt = await call("/mcp", { method: "OPTIONS" });
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get("access-control-allow-origin"), "*");
  assert.match(opt.headers.get("access-control-allow-headers")!, /Mcp-Protocol-Version/i);
});

test("invalid Mcp-Protocol-Version header -> 400; missing is fine", async () => {
  const bad = await mcpCall({ jsonrpc: "2.0", id: 5, method: "ping" }, { "mcp-protocol-version": "2031-01-01" });
  assert.equal(bad.status, 400);
  const ok = await mcpCall({ jsonrpc: "2.0", id: 6, method: "ping" }, { "mcp-protocol-version": "2025-03-26" });
  assert.equal(ok.status, 200);
});

test("REST /health and static-asset fallthrough", async () => {
  const health = await call("/health");
  assert.equal(health.status, 200);
  const body = await health.json() as any;
  assert.equal(body.ok, true);
  const home = await call("/");
  assert.match(await home.text(), /StatCite/);
});

test("parse error -> -32700", async () => {
  const res = await call("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.equal(body.error.code, -32700);
});

// --- v1.5.0: prompts, resources, structured output, status (GROWTH-PLAN Phase 1) ---

test("initialize declares prompts + resources capabilities", async () => {
  const res = await mcpCall({ jsonrpc: "2.0", id: 20, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  const body = await res.json() as any;
  assert.ok(body.result.capabilities.prompts, "prompts capability missing");
  assert.ok(body.result.capabilities.resources, "resources capability missing");
});

test("prompts/list + prompts/get round-trip; unknown prompt errors with the available list", async () => {
  const list = await mcpCall({ jsonrpc: "2.0", id: 21, method: "prompts/list" });
  const names = ((await list.json()) as any).result.prompts.map((p: any) => p.name);
  assert.deepEqual(names.sort(), ["cite_this_stat", "country_brief", "fact_check"]);

  const get = await mcpCall({ jsonrpc: "2.0", id: 22, method: "prompts/get", params: { name: "fact_check" } });
  const gb = (await get.json()) as any;
  assert.ok(gb.result.messages.length >= 1);
  assert.match(gb.result.messages[0].content.text, /verify_claims/);
  assert.match(gb.result.messages[0].content.text, /cannot_verify/);

  const bad = await mcpCall({ jsonrpc: "2.0", id: 23, method: "prompts/get", params: { name: "nope" } });
  const bb = (await bad.json()) as any;
  assert.equal(bb.error.code, -32602);
  assert.match(bb.error.message, /fact_check/);
});

test("resources/list + resources/read: registry and sources generated from live constants", async () => {
  const list = await mcpCall({ jsonrpc: "2.0", id: 24, method: "resources/list" });
  const uris = ((await list.json()) as any).result.resources.map((r: any) => r.uri);
  assert.deepEqual(uris.sort(), ["statcite://registry/indicators", "statcite://registry/sources"]);

  const reg = await mcpCall({ jsonrpc: "2.0", id: 25, method: "resources/read", params: { uri: "statcite://registry/indicators" } });
  const regText = ((await reg.json()) as any).result.contents[0].text as string;
  assert.match(regText, /inflation_cpi/);
  assert.match(regText, /govt_debt_gdp/);

  const src = await mcpCall({ jsonrpc: "2.0", id: 26, method: "resources/read", params: { uri: "statcite://registry/sources" } });
  const srcText = ((await src.json()) as any).result.contents[0].text as string;
  assert.match(srcText, /CC BY 4\.0/);
  assert.match(srcText, /attribution/i);

  const bad = await mcpCall({ jsonrpc: "2.0", id: 27, method: "resources/read", params: { uri: "statcite://nope" } });
  assert.equal(((await bad.json()) as any).error.code, -32002);
});

test("GUARD THE LAST HOP: every tool advertising outputSchema returns structuredContent on a real call", async () => {
  // The list of advertised tools comes from the live tools/list response, not
  // a hardcoded set — a future tool that adds outputSchema is covered the day
  // it ships or this test fails.
  const list = await mcpCall({ jsonrpc: "2.0", id: 28, method: "tools/list" });
  const withSchema = ((await list.json()) as any).result.tools.filter((t: any) => t.outputSchema).map((t: any) => t.name);
  assert.ok(withSchema.includes("verify_stat"), "verify_stat should advertise outputSchema");
  assert.ok(withSchema.includes("verify_claims"), "verify_claims should advertise outputSchema");

  const argsFor: Record<string, Record<string, unknown>> = {
    search: { query: "inflation barbados" },
    fetch: { id: "help/indicators" },
    verify_stat: { indicator: "inflation_cpi", country: "BRB", period: "2023", claimed_value: 1.4 },
    verify_claims: { claims: [{ indicator: "inflation_cpi", country: "BRB", period: "2023", claimed_value: 1.4 }] },
  };
  for (const name of withSchema) {
    assert.ok(argsFor[name], `no test args for tool '${name}' — add them here when adding outputSchema`);
    const { rpc, isError } = await mcpTool(name, argsFor[name]);
    assert.equal(isError, false, `${name} errored: ${JSON.stringify(rpc.result)}`);
    assert.ok(rpc.result.structuredContent, `${name} advertised outputSchema but returned no structuredContent`);
  }
});

test("verify_stat structuredContent carries the verdict fields the schema promises", async () => {
  const { rpc } = await mcpTool("verify_stat", { indicator: "inflation_cpi", country: "BRB", period: "2023", claimed_value: 1.4 });
  const sc = rpc.result.structuredContent;
  for (const k of ["verdict", "official_value", "citation", "diagnostics", "notes", "observation_status"]) {
    assert.ok(k in sc, `structuredContent missing '${k}'`);
  }
});

test("REST /v1/status reports version and per-upstream probes (stubbed upstreams -> ok)", async () => {
  const res = await call("/v1/status");
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.service, "StatCite");
  assert.ok(body.version.length >= 5);
  assert.ok(["ok", "degraded"].includes(body.status));
  for (const up of ["worldbank", "imf_datamapper", "dbnomics"]) {
    assert.ok(body.upstreams[up], `missing upstream probe ${up}`);
    assert.equal(typeof body.upstreams[up].ok, "boolean");
  }
});
