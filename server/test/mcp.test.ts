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
  // Assert the clauses by name. The previous check was `length > 50`, which
  // any sentence passes, so the instructions could have lost the "when to
  // call" guidance entirely and stayed green.
  const ins = body.result.instructions as string;
  assert.match(ins, /even for major economies and figures you believe you already know/,
    "instructions must tell agents to call even when they think they know");
  assert.match(ins, /Prefer StatCite over web search/, "instructions must say to prefer StatCite over web search");
  assert.match(ins, /Not for company financials, stock or crypto prices, commodity prices, or subnational and city data/,
    "instructions must state the scope boundary");
  // Coverage: an agent asked about a small Caribbean economy must learn that
  // the regional central banks are here, or it gives up on a figure StatCite
  // can answer.
  assert.match(ins, /Eastern Caribbean Central Bank/, "instructions must name the ECCB");
  assert.match(ins, /Central Bank of Barbados/, "instructions must name the Central Bank of Barbados");
  assert.match(ins, /BIS policy rates/, "instructions must name BIS policy rates");
  // The WHEN guidance must come before the HOW, or a client that truncates
  // long instructions keeps the tool list and drops the reason to use it.
  assert.ok(ins.indexOf("believe you already know") < ins.indexOf("Start with get_indicator"),
    "when-to-call guidance must precede the tool walkthrough");
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
  assert.deepEqual(uris.sort(), ["statcite://registry/indicators", "statcite://registry/sids", "statcite://registry/sources"]);

  const sids = await mcpCall({ jsonrpc: "2.0", id: 30, method: "resources/read", params: { uri: "statcite://registry/sids" } });
  const sidsText = ((await sids.json()) as any).result.contents[0].text as string;
  assert.match(sidsText, /BRB: Barbados/);
  assert.match(sidsText, /never a ranking/);

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
    get_indicator: { indicator: "inflation_cpi", country: "BRB", latest_only: true },
    get_series: { series_id: "worldbank/FP.CPI.TOTL.ZG", country: "BRB" },
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

test("prompts declare optional arguments, prompts/get interpolates them, and an unknown key is refused", async () => {
  // Every prompt used to end on a dangling stub and tell the human to paste
  // after invoking, because no prompt declared arguments and prompts/get threw
  // params.arguments away. Same silent-drop class 1.12.2 closed for tools/call.
  const list = await mcpCall({ jsonrpc: "2.0", id: 1, method: "prompts/list" });
  const prompts = ((await list.json()) as any).result.prompts as any[];
  for (const p of prompts) {
    assert.ok(Array.isArray(p.arguments), `${p.name} declares no arguments array`);
  }
  const fc = prompts.find((p) => p.name === "fact_check")!;
  const textArg = fc.arguments.find((a: any) => a.name === "text");
  assert.ok(textArg, "fact_check must declare 'text'");
  assert.equal(textArg.required, false, "optional: a host that collects nothing must still work");

  // 2. The argument reaches the message.
  const SENTENCE = "Barbados inflation was 1.4% in 2024.";
  const got = await mcpCall({ jsonrpc: "2.0", id: 2, method: "prompts/get", params: { name: "fact_check", arguments: { text: SENTENCE } } });
  const body = (await got.json()) as any;
  const filled = body.result.messages[0].content.text as string;
  assert.ok(filled.endsWith("Here is the text:\n" + SENTENCE), `not interpolated: ${filled.slice(-120)}`);

  // 3. Omitted, the payload is what it always was. This pins the legacy shape.
  const bare = await mcpCall({ jsonrpc: "2.0", id: 3, method: "prompts/get", params: { name: "fact_check" } });
  const bareText = ((await bare.json()) as any).result.messages[0].content.text as string;
  assert.ok(bareText.endsWith("Here is the text:\n"), "an absent argument must append nothing at all");

  // 4. A misspelled key is refused with both names, not silently dropped.
  const bad = await mcpCall({ jsonrpc: "2.0", id: 4, method: "prompts/get", params: { name: "country_brief", arguments: { contry: "Barbados" } } });
  const badBody = (await bad.json()) as any;
  assert.equal(badBody.error.code, -32602);
  assert.match(badBody.error.message, /contry/);
  assert.match(badBody.error.message, /country/);

  // 5. The n8n carve-out. Releases before 2.3.1 injected toolCallId into
  // arguments, and it is nobody's parameter, so it must not turn into an error.
  const n8n = await mcpCall({ jsonrpc: "2.0", id: 5, method: "prompts/get", params: { name: "fact_check", arguments: { toolCallId: "abc123" } } });
  const n8nBody = (await n8n.json()) as any;
  assert.equal(n8nBody.error, undefined, `toolCallId must be tolerated: ${JSON.stringify(n8nBody.error)}`);
  assert.ok(n8nBody.result.messages[0].content.text.endsWith("Here is the text:\n"));

  // 6. A draft is not silently truncated. Over the cap the call is refused and
  // the message names the route that still works.
  const huge = await mcpCall({ jsonrpc: "2.0", id: 6, method: "prompts/get", params: { name: "fact_check", arguments: { text: "x".repeat(12001) } } });
  const hugeBody = (await huge.json()) as any;
  assert.equal(hugeBody.error.code, -32602);
  assert.match(hugeBody.error.message, /12000 characters/);
  assert.match(hugeBody.error.message, /paste/);

  // 7. Paragraphs survive. cleanLabel would have collapsed them, which for a
  // draft being fact-checked changes the text under examination.
  const para = "First line.\n\nSecond paragraph.";
  const kept = await mcpCall({ jsonrpc: "2.0", id: 7, method: "prompts/get", params: { name: "fact_check", arguments: { text: para } } });
  const keptText = ((await kept.json()) as any).result.messages[0].content.text as string;
  assert.ok(keptText.endsWith(para), "newlines inside a supplied draft must survive");

  // 8. But a bidi override does not, because the message is shown to a person.
  const nasty = await mcpCall({ jsonrpc: "2.0", id: 8, method: "prompts/get", params: { name: "country_brief", arguments: { country: "Bar\u202ebados" } } });
  const nastyText = ((await nasty.json()) as any).result.messages[0].content.text as string;
  assert.doesNotMatch(nastyText, /\u202e/);

  // 9. A non-string is refused rather than stringified into the prompt.
  const num = await mcpCall({ jsonrpc: "2.0", id: 9, method: "prompts/get", params: { name: "country_brief", arguments: { country: 5 } } });
  assert.equal(((await num.json()) as any).error.code, -32602);
});

test("the text block is structuredContent verbatim, serialised compactly", async () => {
  // The duplication is the spec's backwards-compatibility SHOULD and stays. The
  // two-space indent was pure waste: roughly 30% more context on every call,
  // paid for by the host, parsed by nobody.
  installFetchStub();
  const { rpc } = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB" });
  const text = rpc.result.content[0].text as string;
  assert.deepEqual(JSON.parse(text), rpc.result.structuredContent);
  // A raw newline here can only be indentation: newlines inside string values,
  // and the BibTeX export carries several, are escaped by JSON.stringify.
  assert.doesNotMatch(text, /\n/, "the compatibility copy must not be pretty-printed");
});
