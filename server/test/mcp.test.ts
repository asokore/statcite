import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, call, mcpCall, testEnv } from "./helpers.ts";

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
