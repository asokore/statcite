// What the endpoint advertises about itself must be true, and its errors must
// be matchable by the client that caused them. Each test here names a defect
// found live on 2026-09-12.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, LEGACY_PROTOCOL_VERSIONS } from "../src/mcp.ts";

const MODERN = "2026-07-28";
const META_PV = "io.modelcontextprotocol/protocolVersion";
const env = { ASSETS: { fetch: async () => new Response("site") }, BASE_URL: "https://statcite.com" } as unknown as Env;

async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = await handleRequest(
    new Request("https://statcite.com/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
  );
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

test("an unsupported-version error echoes the request id so the client can match it", async () => {
  const { status, json } = await post({ jsonrpc: "2.0", id: 7, method: "tools/list" }, { "mcp-protocol-version": "1900-01-01" });
  assert.equal(status, 400);
  assert.equal(json.error.code, -32022);
  assert.equal(json.id, 7, "the error must carry the id of the request that caused it");
  const s = await post({ jsonrpc: "2.0", id: "abc", method: "tools/list" }, { "mcp-protocol-version": "1900-01-01" });
  assert.equal(s.json.id, "abc");
});

test("an unparseable body with an unsupported version still gets a well-formed error", async () => {
  const { status, json } = await post("{not json", { "mcp-protocol-version": "1900-01-01" });
  assert.equal(status, 400);
  assert.equal(json.id, null);
  assert.ok(json.error, "must be a JSON-RPC error");
});

test("a batch that declares 2026-07-28 is refused, not run under legacy semantics", async () => {
  const viaHeader = await post([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { "mcp-protocol-version": MODERN });
  assert.equal(viaHeader.status, 400);
  assert.equal(viaHeader.json.error.code, -32600);
  assert.match(viaHeader.json.error.message, /batching/);
  const viaMeta = await post([{ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [META_PV]: MODERN } } }]);
  assert.equal(viaMeta.status, 400, "a modern _meta declaration inside the batch must also be refused");
  // Legacy batches keep working.
  const legacy = await post([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  assert.equal(legacy.status, 200);
  assert.ok(Array.isArray(legacy.json));
});

test("the GET descriptor lists every accepted protocol version", async () => {
  const res = await handleRequest(new Request("https://statcite.com/mcp", { method: "GET" }), env);
  assert.equal(res.status, 405);
  const body = await res.json() as any;
  assert.deepEqual(body.mcp.protocol_versions, SUPPORTED_PROTOCOL_VERSIONS);
});

test("advertised version lists really are newest first", () => {
  const sorted = [...LEGACY_PROTOCOL_VERSIONS].sort().reverse();
  assert.deepEqual(LEGACY_PROTOCOL_VERSIONS, sorted);
  assert.deepEqual(SUPPORTED_PROTOCOL_VERSIONS, [...SUPPORTED_PROTOCOL_VERSIONS].sort().reverse());
});

test("serverInfo carries a PNG icon on this origin and a websiteUrl, in both eras", async () => {
  const legacy = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
  const modernRes = await post(
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [META_PV]: MODERN } } },
    { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" },
  );
  const infos = [legacy.json.result.serverInfo, modernRes.json.result._meta["io.modelcontextprotocol/serverInfo"]];
  for (const info of infos) {
    assert.equal(info.name, "statcite");
    assert.equal(info.version, SERVER_VERSION);
    assert.equal(info.websiteUrl, "https://statcite.com");
    assert.equal(info.icons[0].mimeType, "image/png");
    assert.equal(new URL(info.icons[0].src).host, "statcite.com");
  }
});

test("resources/templates/list answers instead of -32601, in both eras", async () => {
  const legacy = await post({ jsonrpc: "2.0", id: 1, method: "resources/templates/list" });
  assert.equal(legacy.json.error, undefined, JSON.stringify(legacy.json));
  assert.deepEqual(legacy.json.result.resourceTemplates, []);
  const m = await post(
    { jsonrpc: "2.0", id: 2, method: "resources/templates/list", params: { _meta: { [META_PV]: MODERN } } },
    { "mcp-protocol-version": MODERN, "mcp-method": "resources/templates/list" },
  );
  assert.equal(m.json.error, undefined, JSON.stringify(m.json));
  assert.deepEqual(m.json.result.resourceTemplates, []);
});
