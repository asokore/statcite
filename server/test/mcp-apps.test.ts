// MCP Apps citation card (src/ui/citation-card.ts, backlog A-072).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, mcpCall } from "./helpers.ts";
import { CITATION_CARD_HTML, CITATION_CARD_URI, MCP_APP_MIME, CARD_TOOLS } from "../src/ui/citation-card.ts";

beforeEach(() => installFetchStub());

const MODERN = "2026-07-28";
const META_PV = "io.modelcontextprotocol/protocolVersion";

async function list(era: "legacy" | "modern") {
  const body = era === "legacy"
    ? { jsonrpc: "2.0", id: 1, method: "tools/list" }
    : { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [META_PV]: MODERN } } };
  const headers: Record<string, string> = era === "modern" ? { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" } : {};
  const res = await mcpCall(body, headers);
  assert.equal(res.status, 200);
  return ((await res.json()) as any).result.tools as Array<Record<string, any>>;
}

for (const era of ["legacy", "modern"] as const) {
  test(`${era}: exactly the three figure tools link the card, the rest carry no _meta`, async () => {
    const tools = await list(era);
    const linked = tools.filter((t) => t._meta).map((t) => t.name).sort();
    assert.deepEqual(linked, [...CARD_TOOLS].sort());
    for (const t of tools.filter((x) => x._meta)) {
      assert.equal(t._meta.ui.resourceUri, CITATION_CARD_URI);
      assert.equal(t._meta["ui/resourceUri"], CITATION_CARD_URI, "deprecated flat key kept for older hosts");
    }
  });
}

test("the card resource is listed and read with the MCP Apps MIME type", async () => {
  const listRes = await mcpCall({ jsonrpc: "2.0", id: 2, method: "resources/list" });
  const listed = ((await listRes.json()) as any).result.resources.find((r: any) => r.uri === CITATION_CARD_URI);
  assert.ok(listed, "card resource missing from resources/list");
  assert.equal(listed.mimeType, MCP_APP_MIME);
  assert.equal(MCP_APP_MIME, "text/html;profile=mcp-app", "the spec requires this exact string");

  const readRes = await mcpCall({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: CITATION_CARD_URI } });
  const c = ((await readRes.json()) as any).result.contents[0];
  assert.equal(c.uri, CITATION_CARD_URI);
  assert.equal(c.mimeType, MCP_APP_MIME);
  assert.match(c.text, /^<!DOCTYPE html>/, "spec: content must be a full HTML5 document");
  assert.equal(c._meta, undefined, "no CSP domains declared, so the host applies its no-network default");
});

/** The check that matters: the page names no external origin. */
function externalOrigins(html: string): string[] {
  return html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
}

test("the card loads nothing from outside and uses no innerHTML", () => {
  assert.deepEqual(externalOrigins(CITATION_CARD_HTML), []);
  assert.doesNotMatch(CITATION_CARD_HTML, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(CITATION_CARD_HTML, /<(img|link|iframe|object|embed)\b/i);
});

test("mutation: the origin check fails on a planted script, font and fetch", () => {
  for (const planted of [
    '<script src="https://unpkg.com/x.js"></script>',
    "@import url(//fonts.example.com/a.css);",
    'fetch("https://statcite.com/v1/status")',
  ]) {
    const mutated = CITATION_CARD_HTML.replace("</body>", () => planted + "</body>");
    assert.notEqual(mutated, CITATION_CARD_HTML, "mutation did not apply");
    assert.ok(externalOrigins(mutated).length > 0, `origin check missed: ${planted}`);
  }
});

test("the card implements the handshake fields the SDK sends", () => {
  assert.match(CITATION_CARD_HTML, /request\("ui\/initialize"/);
  for (const field of ["appCapabilities", "appInfo", 'protocolVersion: "2026-01-26"']) {
    assert.ok(CITATION_CARD_HTML.includes(field), `ui/initialize lacks ${field}`);
  }
  assert.match(CITATION_CARD_HTML, /notify\("ui\/notifications\/initialized"\)/);
  assert.match(CITATION_CARD_HTML, /"ui\/notifications\/tool-result"/);
  assert.match(CITATION_CARD_HTML, /event\.source !== window\.parent/, "messages from other windows must be ignored");
});
