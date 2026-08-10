// MCP protocol revision 2026-07-28 — the dual-era transport.
//
// The 2026-07-28 revision is BREAKING: it deletes the `initialize` handshake,
// sessions, `ping`, and the GET stream, and replaces them with per-request
// metadata. StatCite serves both eras on one endpoint, so the tests that
// matter most here are not the new features — they are the ones proving a
// LEGACY client cannot tell this release apart from the last one.
//
// Every assertion below is written against the spec text, not against the
// implementation: exact `_meta` key strings, exact error codes from the
// renumbered MCP-reserved range (-32020 HeaderMismatch, -32022
// UnsupportedProtocolVersion), and the exact HTTP statuses the revision pairs
// them with.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, decodeMcpHeaderValue, requestEra } from "../src/mcp.ts";

const MODERN = "2026-07-28";
const META_PV = "io.modelcontextprotocol/protocolVersion";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

const env = { ASSETS: { fetch: async () => new Response("site") }, BASE_URL: "https://statcite.com" } as unknown as Env;

/** POST one JSON-RPC message with explicit control over the HTTP headers, so
 * header/body disagreement can be exercised on purpose. */
async function post(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any; res: Response }> {
  const res = await handleRequest(
    new Request("https://statcite.com/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    }),
    env,
  );
  let parsed: any = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, json: parsed, res };
}

/** A well-formed modern request: `_meta` in the body plus the three standard
 * headers the revision requires. */
function modern(method: string, params: Record<string, unknown> = {}, id = 1) {
  const withMeta = { ...params, _meta: { [META_PV]: MODERN, "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0" } } };
  const headers: Record<string, string> = { "mcp-protocol-version": MODERN, "mcp-method": method };
  const nameSource =
    method === "tools/call" || method === "prompts/get" ? (params.name as string) : method === "resources/read" ? (params.uri as string) : undefined;
  if (nameSource !== undefined) headers["mcp-name"] = nameSource;
  return { body: { jsonrpc: "2.0", id, method, params: withMeta }, headers };
}

// ---------------------------------------------------------------------------
// The load-bearing half: legacy clients must observe NO change.
// ---------------------------------------------------------------------------

test("LEGACY: initialize still negotiates a session-era version and is untouched", async () => {
  const { status, json } = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(status, 200);
  assert.equal(json.result.protocolVersion, "2025-06-18");
  assert.equal(json.result.serverInfo.name, "statcite");
  assert.ok(json.result.capabilities.tools, "capabilities must still be advertised");
  // The modern shaping must NOT leak into a legacy result.
  assert.equal(json.result.resultType, undefined, "resultType must not appear on a legacy result");
  assert.equal(json.result.ttlMs, undefined, "ttlMs must not appear on a legacy result");
  assert.equal(json.result._meta, undefined, "serverInfo _meta must not appear on a legacy result");
});

test("LEGACY: initialize asking for a MODERN version negotiates DOWN, never echoes it", async () => {
  // `initialize` does not exist in 2026-07-28, so echoing that version back
  // would promise a profile this very request proves the client is not using.
  const { json } = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MODERN } });
  assert.equal(json.result.protocolVersion, "2025-11-25");
});

test("LEGACY: ping still works and tools/list is unshaped", async () => {
  const ping = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
  assert.equal(ping.status, 200);
  assert.deepEqual(ping.json.result, {});

  const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(list.status, 200);
  assert.ok(list.json.result.tools.length > 0);
  assert.equal(list.json.result.resultType, undefined);
  assert.equal(list.json.result.cacheScope, undefined);
});

test("LEGACY: a legacy client needs no headers at all and unknown methods stay HTTP 200", async () => {
  const { status, json } = await post({ jsonrpc: "2.0", id: 1, method: "nope/nope" });
  assert.equal(status, 200, "legacy unknown-method must not become 404");
  assert.equal(json.error.code, -32601);
});

test("LEGACY: resource-not-found keeps its -32002 code", async () => {
  const { json } = await post({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "statcite://nope" } });
  assert.equal(json.error.code, -32002);
});

// ---------------------------------------------------------------------------
// Modern era: discovery, statelessness, result shaping.
// ---------------------------------------------------------------------------

test("MODERN: server/discover advertises supported versions, capabilities and identity", async () => {
  const { body, headers } = modern("server/discover");
  const { status, json } = await post(body, headers);
  assert.equal(status, 200);
  const r = json.result;
  assert.equal(r.resultType, "complete", "every 2026-07-28 result carries resultType");
  assert.ok(r.supportedVersions.includes(MODERN), "must advertise the modern revision");
  assert.ok(r.supportedVersions.includes("2025-11-25"), "dual-era: legacy revisions are still supported");
  assert.deepEqual(r.supportedVersions, SUPPORTED_PROTOCOL_VERSIONS);
  assert.ok(r.capabilities.tools, "capabilities must be advertised");
  assert.equal(r._meta[META_SERVER_INFO].name, "statcite");
  assert.equal(r._meta[META_SERVER_INFO].version, SERVER_VERSION);
  // server/discover is a cacheable result.
  assert.equal(typeof r.ttlMs, "number");
  assert.equal(r.cacheScope, "public");
});

test("MODERN: server/discover answers a BARE probe with no headers", async () => {
  // This is the dual-era handshake-detection probe. Refusing it for a missing
  // header would break the negotiation the method exists to serve.
  const { status, json } = await post({ jsonrpc: "2.0", id: 1, method: "server/discover" });
  assert.equal(status, 200);
  assert.equal(json.result.resultType, "complete");
  assert.ok(json.result.supportedVersions.includes(MODERN));
});

test("MODERN: list results carry the CacheableResult fields", async () => {
  for (const method of ["tools/list", "prompts/list", "resources/list"]) {
    const { body, headers } = modern(method);
    const { json } = await post(body, headers);
    assert.equal(json.result.resultType, "complete", `${method} resultType`);
    assert.equal(typeof json.result.ttlMs, "number", `${method} ttlMs`);
    assert.ok(["public", "private"].includes(json.result.cacheScope), `${method} cacheScope`);
  }
});

test("MODERN: a real tool call works and its result is modern-shaped", async () => {
  const { body, headers } = modern("tools/call", { name: "list_sources", arguments: {} });
  const { status, json } = await post(body, headers);
  assert.equal(status, 200);
  assert.equal(json.result.resultType, "complete");
  assert.equal(json.result._meta[META_SERVER_INFO].name, "statcite");
  // tools/call is NOT a cacheable result — data changes independently of deploys.
  assert.equal(json.result.ttlMs, undefined, "tools/call must not claim cacheability");
  assert.ok(json.result.content[0].text.includes("statcite") || json.result.content[0].text.length > 0);
});

test("MODERN: initialize and ping no longer exist, with HTTP 404", async () => {
  for (const method of ["initialize", "ping"]) {
    const { status, json } = await post(
      { jsonrpc: "2.0", id: 1, method, params: { _meta: { [META_PV]: MODERN } } },
      { "mcp-protocol-version": MODERN, "mcp-method": method },
    );
    assert.equal(status, 404, `${method} must be 404 in the modern era`);
    assert.equal(json.error.code, -32601);
  }
});

test("MODERN: unknown method pairs -32601 with HTTP 404", async () => {
  const { body, headers } = modern("nope/nope");
  const { status, json } = await post(body, headers);
  assert.equal(status, 404);
  assert.equal(json.error.code, -32601);
});

test("MODERN: resource-not-found is realigned to -32602", async () => {
  const { body, headers } = modern("resources/read", { uri: "statcite://nope" });
  const { json } = await post(body, headers);
  assert.equal(json.error.code, -32602, "2026-07-28 moved this from -32002 to Invalid Params");
});

// ---------------------------------------------------------------------------
// Header/body agreement — the security-relevant part.
// ---------------------------------------------------------------------------

test("HEADER MISMATCH: Mcp-Method disagreeing with the body is -32020 + HTTP 400", async () => {
  const { body } = modern("tools/list");
  const { status, json } = await post(body, { "mcp-protocol-version": MODERN, "mcp-method": "tools/call" });
  assert.equal(status, 400);
  assert.equal(json.error.code, -32020);
  assert.match(json.error.message, /Mcp-Method/);
});

test("HEADER MISMATCH: Mcp-Name disagreeing with params.name is refused", async () => {
  // An intermediary routing on Mcp-Name must never be able to send traffic to
  // one tool while the server executes another.
  const { body } = modern("tools/call", { name: "list_sources", arguments: {} });
  const { status, json } = await post(body, {
    "mcp-protocol-version": MODERN,
    "mcp-method": "tools/call",
    "mcp-name": "verify_stat",
  });
  assert.equal(status, 400);
  assert.equal(json.error.code, -32020);
  assert.match(json.error.message, /Mcp-Name/);
});

test("HEADER MISMATCH: a missing required header is refused", async () => {
  const { body } = modern("tools/call", { name: "list_sources", arguments: {} });
  const { status, json } = await post(body, { "mcp-protocol-version": MODERN, "mcp-method": "tools/call" });
  assert.equal(status, 400);
  assert.equal(json.error.code, -32020);
  assert.match(json.error.message, /Mcp-Name header is required/);
});

test("HEADER MISMATCH: header version disagreeing with body _meta version is refused", async () => {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [META_PV]: "2025-11-25" } } };
  const { status, json } = await post(body, { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" });
  assert.equal(status, 400);
  assert.equal(json.error.code, -32020);
});

test("Mcp-Name accepts the Base64 sentinel encoding for non-ASCII values", async () => {
  // Round-trip through the real decoder, then prove it is actually used: a
  // correctly-encoded name matching the body must be ACCEPTED.
  const uri = "statcite://registry/sources";
  const encoded = `=?base64?${btoa(uri)}?=`;
  assert.equal(decodeMcpHeaderValue(encoded), uri, "decoder must round-trip the sentinel form");
  const { body } = modern("resources/read", { uri });
  const { status, json } = await post(body, {
    "mcp-protocol-version": MODERN,
    "mcp-method": "resources/read",
    "mcp-name": encoded,
  });
  assert.equal(status, 200, JSON.stringify(json).slice(0, 200));
  assert.equal(json.result.resultType, "complete");
});

test("decodeMcpHeaderValue leaves plain values alone and rejects broken Base64", async () => {
  assert.equal(decodeMcpHeaderValue("get_indicator"), "get_indicator");
  assert.equal(decodeMcpHeaderValue("=?base64?!!!not-base64!!!?="), undefined);
});

// ---------------------------------------------------------------------------
// Version negotiation.
// ---------------------------------------------------------------------------

test("an unsupported protocol version returns -32022 listing what IS supported", async () => {
  const { status, json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "mcp-protocol-version": "1900-01-01" });
  assert.equal(status, 400);
  assert.equal(json.error.code, -32022, "renumbered into the MCP-reserved range");
  assert.deepEqual(json.error.data.supported, SUPPORTED_PROTOCOL_VERSIONS);
  assert.equal(json.error.data.requested, "1900-01-01");
});

test("era is decided by the declared version, not by connection state", () => {
  assert.equal(requestEra("tools/list", {}, null), "legacy", "no declaration at all = legacy");
  assert.equal(requestEra("tools/list", {}, "2025-11-25"), "legacy");
  assert.equal(requestEra("tools/list", {}, MODERN), "modern", "header alone selects modern");
  assert.equal(requestEra("tools/list", { _meta: { [META_PV]: MODERN } }, null), "modern", "_meta alone selects modern");
  assert.equal(requestEra("server/discover", {}, null), "modern", "discover is modern by definition");
  // A split declaration is MODERN, not legacy, so that header validation gets
  // the chance to refuse it. Treating it as legacy would let an intermediary
  // route on a modern header while the server ran legacy semantics.
  assert.equal(requestEra("tools/list", { _meta: { [META_PV]: "2025-11-25" } }, MODERN), "modern");
  assert.equal(requestEra("tools/list", { _meta: { [META_PV]: MODERN } }, "2025-11-25"), "modern");
});

test("GET and DELETE are 405 in both eras (no GET stream, no session to delete)", async () => {
  for (const method of ["GET", "DELETE"]) {
    const res = await handleRequest(new Request("https://statcite.com/mcp", { method }), env);
    assert.equal(res.status, 405, `${method} must be 405`);
  }
});

test("no session id is ever minted, and a client-sent one is ignored", async () => {
  const { body, headers } = modern("tools/list");
  const { status, res } = await post(body, { ...headers, "mcp-session-id": "should-be-ignored", "last-event-id": "42" });
  assert.equal(status, 200, "a stray session header must not break the request");
  assert.equal(res.headers.get("mcp-session-id"), null, "the server must not mint or echo a session id");
});

test("CORS preflight allows the standard modern request headers", async () => {
  const res = await handleRequest(new Request("https://statcite.com/mcp", { method: "OPTIONS" }), env);
  const allow = (res.headers.get("access-control-allow-headers") ?? "").toLowerCase();
  // Without these a browser-based modern client is blocked at preflight before
  // it can send one compliant request.
  for (const h of ["mcp-method", "mcp-name", "mcp-protocol-version"]) {
    assert.ok(allow.includes(h), `preflight must allow ${h}`);
  }
});
