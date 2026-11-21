// MCP Apps citation card (src/ui/citation-card.ts, backlog A-072).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, mcpCall, mcpTool } from "./helpers.ts";
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

// ---------------------------------------------------------------------------
// Runtime: execute the card's own script against stub window and document
// objects and feed it real tools/call results. String checks above cannot see
// a broken handshake, a misread field or a rounded figure. These can.

type Card = ReturnType<typeof runCard>;

/** A ResizeObserver stub that fires its callback as soon as observe() is
 * called, as a browser does on the next frame, usually before the host has
 * answered ui/initialize. */
class EagerResizeObserver {
  constructor(private cb: () => void) {}
  observe() { this.cb(); }
}

function runCard(html = CITATION_CARD_HTML, resizeObserver: unknown = undefined) {
  const script = html.split("<script>")[1].split("</script>")[0];
  const sent: any[] = [];
  const copied: string[] = [];
  let listener: ((e: any) => void) | null = null;
  const els = new Map<string, any>();
  const makeEl = (id: string) => ({
    id, textContent: "", hidden: false, onclick: null as null | (() => void), children: [] as any[],
    get firstChild() { return this.children[0] ?? null; },
    appendChild(c: any) { this.children.push(c); },
    removeChild(c: any) { this.children.splice(this.children.indexOf(c), 1); },
  });
  const rootStyle: Record<string, string> = {};
  const documentElement = {
    clientWidth: 420,
    // Height follows the text on the page, so a render that changes content changes the size.
    getBoundingClientRect: () => ({ height: 100 + [...els.values()].reduce((a, e) => a + String(e.textContent).length, 0) }),
    style: { colorScheme: "", setProperty: (k: string, v: string) => { rootStyle[k] = v; } },
  };
  const parent = { postMessage: (m: unknown) => sent.push(JSON.parse(JSON.stringify(m))) };
  const win = {
    parent,
    addEventListener: (t: string, fn: (e: any) => void) => { if (t === "message") listener = fn; },
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
  };
  const doc = {
    getElementById: (id: string) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    createElement: (tag: string) => makeEl(tag),
    createRange: () => ({ selectNodeContents() {} }),
    documentElement,
  };
  const nav = { clipboard: { writeText: (t: string) => { copied.push(t); return Promise.resolve(); } } };
  new Function("window", "document", "navigator", "ResizeObserver", script)(win, doc, nav, resizeObserver);
  return {
    sent, copied, rootStyle, documentElement,
    text: (id: string) => String(doc.getElementById(id).textContent),
    el: (id: string) => doc.getElementById(id),
    notes: () => (doc.getElementById("notes").children as any[]).map((c) => String(c.textContent)),
    deliver: (data: unknown, source: unknown = parent) => listener!({ source, data }),
  };
}

const tick = () => new Promise((r) => setImmediate(r));
/** Mirrors the card's fmt(): the value as returned, grouping only, plain-decimal String() below 0.001. */
const plainDecimal = (v: number) => {
  const m = /^(-?)(\d)(?:\.(\d+))?e-(\d+)$/.exec(String(v));
  return m ? `${m[1]}0.${"0".repeat(Number(m[4]) - 1)}${m[2]}${m[3] ?? ""}` : String(v);
};
const asReturned = (v: number) => (Math.abs(v) < 0.001 ? plainDecimal(v) : v.toLocaleString("en-GB", { maximumFractionDigits: 20 }));

/** For a card with no claimed value: from 0.01 up, the headline is the value to
 * at most two decimal places, within half a hundredth of it. Below 0.01 it is
 * three significant digits. The unrounded value is on the line below whenever
 * rounding changed the headline. */
function assertHeadline(card: Card, v: number) {
  const head = card.text("value");
  const shown = Number(head.replace(/,/g, ""));
  if (Math.abs(v) >= 0.01) {
    assert.ok(/^-?[\d,]+(\.\d{1,2})?$/.test(head), `headline has more than two decimals: ${head}`);
    assert.ok(Math.abs(shown - v) <= 0.005 + 1e-12, `headline ${head} is not ${v} rounded`);
  } else {
    assert.ok(Math.abs(shown - v) <= Math.abs(v) * 0.005 + 1e-300, `headline ${head} is not ${v} to three significant digits`);
  }
  if (head === asReturned(v)) {
    assert.equal(card.el("exact").hidden, true, "an exact line is shown although nothing was rounded");
  } else {
    assert.equal(card.el("exact").hidden, false, "the headline was rounded but the exact figure is hidden");
    assert.equal(card.text("exact"), `Unrounded value: ${asReturned(v)}`);
  }
}

async function handshake(card: Card, hostContext?: unknown) {
  const init = card.sent[0];
  card.deliver({ jsonrpc: "2.0", id: init.id, result: { protocolVersion: "2026-01-26", hostContext } });
  await tick();
}

async function showTool(card: Card, name: string, args: Record<string, unknown>) {
  const { rpc, payload } = await mcpTool(name, args);
  card.deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: rpc.result });
  return payload;
}

test("runtime: initialize, then initialized only after the reply, then size-changed; host theme applied", async () => {
  const card = runCard();
  assert.equal(card.sent.length, 1);
  assert.equal(card.sent[0].method, "ui/initialize");
  assert.equal(card.sent[0].params.protocolVersion, "2026-01-26");
  assert.ok(card.sent[0].params.appInfo?.name && card.sent[0].params.appCapabilities);
  await handshake(card, { theme: "dark", styles: { variables: { "--color-text-primary": "#eee", "not a var": "x" } } });
  const methods = card.sent.map((m) => m.method);
  assert.deepEqual(methods.slice(0, 3), ["ui/initialize", "ui/notifications/initialized", "ui/notifications/size-changed"]);
  assert.equal(card.documentElement.style.colorScheme, "dark");
  assert.equal(card.rootStyle["--color-text-primary"], "#eee");
  assert.equal(card.rootStyle["not a var"], undefined);
  card.deliver({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: "light" } });
  assert.equal(card.documentElement.style.colorScheme, "light");
});

test("runtime: messages from another window are ignored; host requests get ping/teardown {} and others -32601", async () => {
  const card = runCard();
  await handshake(card);
  card.deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { name: "Planted" } } }, {});
  assert.notEqual(card.text("head"), "Planted", "a message from another window was rendered");
  card.deliver({ jsonrpc: "2.0", id: 77, method: "tools/call", params: {} });
  card.deliver({ jsonrpc: "2.0", id: 78, method: "ping" });
  card.deliver({ jsonrpc: "2.0", id: 79, method: "ui/resource-teardown", params: {} });
  const reply = (id: number) => card.sent.find((m) => m.id === id && !m.method);
  assert.equal(reply(77).error.code, -32601);
  assert.deepEqual(reply(78).result, {});
  assert.deepEqual(reply(79).result, {});
});

test("runtime: get_indicator headline is the latest value not marked as a projection, with its note", async () => {
  const card = runCard();
  await handshake(card);
  const payload = await showTool(card, "get_indicator", { indicator: "govt_debt_gdp", country: "USA" });
  const obs = (payload.observations as Array<{ period: string; value: number | null; note?: string }>).filter((o) => o.value != null);
  const projected = obs.filter((o) => /projection/i.test(o.note ?? ""));
  assert.ok(projected.length > 0, "fixture must contain projection periods, or this test proves nothing");
  const outturn = obs.filter((o) => !/projection/i.test(o.note ?? "")).at(-1)!;
  assertHeadline(card, outturn.value!);
  assert.match(card.text("period"), new RegExp(`period ${outturn.period}$`));
  assert.ok(card.notes().includes("Later periods in this result are marked as projections or future data."), "the card's own projection line is missing");
  assert.equal(card.text("ctext"), payload.citation.citation_text);
  assert.ok(card.sent.some((m) => m.method === "ui/notifications/size-changed"));
});

test("runtime: verify_stat shows the claimed figure unrounded, the verdict and the citation", async () => {
  const card = runCard();
  await handshake(card);
  const payload = await showTool(card, "verify_stat", { indicator: "inflation_cpi", country: "BRB", period: "2023", claimed_value: 4.123456 });
  assert.ok(payload.verdict, `verify_stat returned no verdict: ${JSON.stringify(payload).slice(0, 300)}`);
  assert.match(card.text("period"), /claimed 4\.123456$/);
  assert.equal(typeof payload.official_value, "number", "fixture must return an official value");
  assertHeadline(card, payload.official_value);
  assert.equal(card.el("verdict").hidden, false);
  assert.match(card.text("verdict"), new RegExp(String(payload.verdict).replace(/_/g, " ")));
  assert.equal(card.text("ctext"), payload.citation.citation_text);
});

test("runtime: a transformed series shows and copies the computed-by-StatCite notice", async () => {
  const card = runCard();
  await handshake(card);
  const payload = await showTool(card, "get_indicator", { indicator: "inflation_cpi", country: "BRB", transform: "yoy" });
  const notices: string[] = payload.citation?.notices ?? [];
  assert.ok(notices.some((n) => /computed by StatCite/.test(n)), "fixture result lacks the derivation notice");
  assert.equal(card.el("cnotice").hidden, false);
  assert.match(card.text("cnotice"), /computed by StatCite/);
  card.el("copy").onclick!();
  assert.equal(card.copied.length, 1);
  assert.ok(card.copied[0].startsWith(payload.citation.citation_text));
  assert.match(card.copied[0], /computed by StatCite/, "the notice must travel with the copied citation");
});

test("runtime: a tool error shows the error message, not raw JSON", async () => {
  const card = runCard();
  await handshake(card);
  await showTool(card, "get_indicator", { indicator: "no_such_indicator", country: "USA" });
  assert.equal(card.text("head"), "StatCite returned an error");
  assert.ok(card.text("sub").length > 0);
  assert.doesNotMatch(card.text("sub"), /^\{/);
});

test("runtime: with a ResizeObserver, no size-changed goes out before initialized, and one follows it", async () => {
  const card = runCard(CITATION_CARD_HTML, EagerResizeObserver);
  assert.deepEqual(card.sent.map((m) => m.method), ["ui/initialize"], "something was sent before the host replied");
  await handshake(card);
  const methods = card.sent.map((m) => m.method);
  assert.deepEqual(methods.slice(0, 3), ["ui/initialize", "ui/notifications/initialized", "ui/notifications/size-changed"]);
});

test("runtime: verify disclosures (null official value, fallback, projection, as_of, diagnostics) all reach the card", async () => {
  const card = runCard();
  await handshake(card);
  const deliver = (sc: Record<string, unknown>) =>
    card.deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { content: [{ type: "text", text: "{}" }], structuredContent: sc } });
  deliver({ verdict: "cannot_verify", official_value: null, claimed_value: 2, period: "1900", explanation: "x", citation: { citation_text: "C." } });
  assert.equal(card.text("value"), "No official value");
  assert.equal(card.text("period"), "Period 1900, claimed 2");
  deliver({
    verdict: "cannot_verify", official_value: 1.5, claimed_value: 1.5, period: "2024", explanation: "See diagnostics for likely causes.",
    fallback_used: true, is_projection: true, diagnostics: ["Scale slip: the claim is 100 times the official value."],
    as_of: { requested: "2019-04", resolved_vintage: "WEO_2018_OCT" }, citation: { citation_text: "C." },
  });
  assert.match(card.text("period"), /^Indicative value for 2024/);
  const n = card.notes();
  assert.ok(n.includes("Scale slip: the claim is 100 times the official value."), "diagnostics missing");
  assert.ok(n.some((x) => /fallback source/.test(x)), "fallback note missing");
  assert.ok(n.some((x) => /projection or future data/.test(x)), "projection note missing");
  assert.ok(n.some((x) => /WEO_2018_OCT as of 2019-04/.test(x)), "as_of note missing");
});

test("runtime: an ECCB future-data note is not taken as the headline; cancel resets the card", async () => {
  const card = runCard();
  await handshake(card);
  const future = "The ECCB shades 2026 as future data on this table and does not define the term, so do not treat it as a final figure.";
  card.deliver({
    jsonrpc: "2.0", method: "ui/notifications/tool-result",
    params: { structuredContent: { name: "Real GDP growth", observations: [{ period: "2025", value: 3.1 }, { period: "2026", value: 4.2, note: future }], citation: { citation_text: "C." } } },
  });
  assert.equal(card.text("value"), "3.1");
  assert.equal(card.el("exact").hidden, true, "3.1 needs no exact line");
  assert.match(card.text("period"), /period 2025$/);
  card.deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-cancelled", params: {} });
  assert.equal(card.text("head"), "The tool call was cancelled");
  assert.equal(card.text("value"), "");
  assert.equal(card.el("exact").hidden, true);
  assert.equal(card.el("cite").hidden, true);
  assert.equal(card.el("notes").hidden, true);
});

/** Feed one synthetic series value and return the card. */
async function headlineFor(v: number, html = CITATION_CARD_HTML) {
  const card = runCard(html);
  await handshake(card);
  card.deliver({
    jsonrpc: "2.0", method: "ui/notifications/tool-result",
    params: { structuredContent: { name: "X", observations: [{ period: "2025", value: v }], citation: { citation_text: "Source, exact figure 0.846576563196289." } } },
  });
  return card;
}

const HEADLINE_CASES: Array<[number, string, string | null]> = [
  [0.846576563196289, "0.85", "Unrounded value: 0.846576563196289"],
  [1.005, "1.01", "Unrounded value: 1.005"],
  [0.285, "0.29", "Unrounded value: 0.285"],
  [-2.345, "-2.35", "Unrounded value: -2.345"],
  [99.995, "100", "Unrounded value: 99.995"],
  [1234567.891, "1,234,567.89", "Unrounded value: 1,234,567.891"],
  [124.4, "124.4", null],
  [2, "2", null],
  [0.3, "0.3", null],
  // Below 0.01 the headline keeps three significant digits, never a bare 0 or -0.
  [0.004, "0.004", null],
  [-0.003, "-0.003", null],
  [0.000001234, "0.00000123", "Unrounded value: 0.000001234"],
  [-0.0041234, "-0.00412", "Unrounded value: -0.0041234"],
  [-0, "0", null],
  // Past 20 decimal places the unrounded line must still be the raw value, never 0 or -0.
  // Below 1e-6 String() switches to exponent form; both lines stay in decimals.
  [1e-21, "0.000000000000000000001", null],
  [-1e-21, "-0.000000000000000000001", null],
  [1e-7, "0.0000001", null],
  [-2.5e-8, "-0.000000025", null],
  [1.234e-7, "0.000000123", "Unrounded value: 0.0000001234"],
  [0.00012345678901234567, "0.000123", "Unrounded value: 0.00012345678901234567"],
];

test("runtime: the headline rounds to two decimals half away from zero, and shows the exact figure below when it rounded", async () => {
  for (const [v, head, exact] of HEADLINE_CASES) {
    const card = await headlineFor(v);
    assert.equal(card.text("value"), head, `headline for ${v}`);
    assert.equal(card.el("exact").hidden, exact === null, `exact line visibility for ${v}`);
    if (exact) assert.equal(card.text("exact"), exact);
    assert.equal(card.text("ctext"), "Source, exact figure 0.846576563196289.", "the citation text must never be rounded");
  }
});

/** A verify result with an official and a claimed value, on a given card. */
function deliverVerify(card: Card, official: number, claimed: number) {
  card.deliver({
    jsonrpc: "2.0", method: "ui/notifications/tool-result",
    params: { structuredContent: { verdict: "mismatch", official_value: official, claimed_value: claimed, period: "2024", citation: { citation_text: "C." } } },
  });
}

test("runtime: a verify headline adds decimals until it differs from the claim, so a mismatch never looks equal", async () => {
  const card = runCard();
  await handshake(card);
  deliverVerify(card, 4.1249, 4.12);
  assert.equal(card.text("value"), "4.125", "4.1249 against a claim of 4.12 must not read 4.12");
  assert.match(card.text("period"), /claimed 4\.12$/);
  assert.equal(card.text("exact"), "Unrounded value: 4.1249");
  deliverVerify(card, 4.1200001, 4.12);
  assert.equal(card.text("value"), "4.1200001");
  assert.equal(card.el("exact").hidden, true);
  deliverVerify(card, 4.12, 4.12);
  assert.equal(card.text("value"), "4.12");
  assert.equal(card.el("exact").hidden, true);
  // Below 0.01 the headline is in significant digits, and must still expand.
  deliverVerify(card, 0.0041234, 0.00412);
  assert.equal(card.text("value"), "0.004123", "0.0041234 against a claim of 0.00412 must not read 0.00412");
  deliverVerify(card, 0.001234, 0.00123);
  assert.equal(card.text("value"), "0.001234");
  // A claim that arrives as a numeric string gets the same guard.
  deliverVerify(card, 4.1249, "4.12" as unknown as number);
  assert.equal(card.text("value"), "4.125");
  deliverVerify(card, 1234.5049, "1,234.5" as unknown as number);
  assert.equal(card.text("value"), "1,234.505", "a grouped string claim must get the same guard");
  // In exponent territory the comparison must still be like with like.
  deliverVerify(card, 1.234e-7, 1.23e-7);
  assert.equal(card.text("value"), "0.0000001234");
});

test("runtime: an unrounded-value line never carries over to the next result on the same card", async () => {
  const card = runCard();
  await handshake(card);
  const series = (v: number) => card.deliver({
    jsonrpc: "2.0", method: "ui/notifications/tool-result",
    params: { structuredContent: { name: "X", observations: [{ period: "2025", value: v }], citation: { citation_text: "C." } } },
  });
  for (const next of [
    () => series(3.1),
    () => card.deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { isError: true, content: [{ type: "text", text: "{\"error\":\"x\"}" }] } }),
    () => card.deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-cancelled", params: {} }),
    () => deliverVerify(card, 4.12, 4.12),
  ]) {
    series(0.846576563196289);
    assert.equal(card.el("exact").hidden, false, "setup: the first result must show the unrounded line");
    next();
    assert.equal(card.text("exact"), "", "the unrounded text carried over");
    assert.equal(card.el("exact").hidden, true, "the unrounded line stayed visible");
  }
});

test("mutation: the headline cases catch toFixed rounding and a hidden exact line", async () => {
  const mutate = (from: string, to: string) => {
    assert.ok(CITATION_CARD_HTML.includes(from), `anchor missing: ${from}`);
    const m = CITATION_CARD_HTML.replace(from, () => to);
    assert.notEqual(m, CITATION_CARD_HTML, "mutation did not apply");
    return m;
  };
  const caught = async (html: string) => {
    for (const [v, head, exact] of HEADLINE_CASES) {
      const card = await headlineFor(v, html);
      if (card.text("value") !== head || card.el("exact").hidden !== (exact === null)) return true;
    }
    return false;
  };
  assert.ok(await caught(mutate('return v.toLocaleString("en-GB", { maximumFractionDigits: places || 2 });', "return v.toFixed(places || 2);")), "toFixed rounding went undetected");
  assert.ok(await caught(mutate('$("exact").hidden = false;', "")), "a hidden exact line went undetected");
  assert.ok(await caught(mutate("var exact = fmt(v), places = 2, head = short(v, places);", "var exact = fmt(v), places = 2, head = fmt(v);")), "an unrounded headline went undetected");
  assert.ok(await caught(mutate("if (v !== 0 && Math.abs(v) < 0.01) return", "if (false) return")), "a small value shown as 0 went undetected");
});

test("mutation: the verify and carry-over tests are load-bearing", async () => {
  const mutate = (from: string, to: string) => {
    assert.ok(CITATION_CARD_HTML.includes(from), `anchor missing: ${from}`);
    const m = CITATION_CARD_HTML.replace(from, () => to);
    assert.notEqual(m, CITATION_CARD_HTML, "mutation did not apply");
    return m;
  };
  const noLoop = runCard(mutate("while (head === said && places < 20)", "while (false)"));
  await handshake(noLoop);
  deliverVerify(noLoop, 4.1249, 4.12);
  assert.equal(noLoop.text("value"), "4.12", "the mutation must make the mismatch look equal, or this proves nothing");
  const fixedSig = runCard(mutate("maximumSignificantDigits: Math.min(21, (places || 2) + 1)", "maximumSignificantDigits: 3"));
  await handshake(fixedSig);
  deliverVerify(fixedSig, 0.0041234, 0.00412);
  assert.equal(fixedSig.text("value"), "0.00412", "with fixed significant digits a small mismatch must look equal, which the verify test asserts against");
  const noCoerce = runCard(mutate('if (typeof claimed === "string" &&', 'if (false &&'));
  await handshake(noCoerce);
  deliverVerify(noCoerce, 4.1249, "4.12" as unknown as number);
  assert.equal(noCoerce.text("value"), "4.12", "without coercion a string claim must look equal, which the verify test asserts against");
  const expFmt = runCard(mutate("if (Math.abs(v) < 0.001) return plain(v);", "if (Math.abs(v) < 0.001) return String(v);"));
  await handshake(expFmt);
  deliverVerify(expFmt, 1.234e-7, 1.23e-7);
  assert.equal(expFmt.text("value"), "0.000000123", "with exponent form a small mismatch must look equal, which the verify test asserts against");
  const oldFmt = runCard(mutate("if (Math.abs(v) < 0.001) return plain(v);", ""));
  await handshake(oldFmt);
  oldFmt.deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { name: "X", observations: [{ period: "2025", value: 1e-21 }], citation: { citation_text: "C." } } } });
  assert.notEqual(oldFmt.text("exact"), "Unrounded value: 1e-21", "without the String() branch the unrounded line must lose the value, which a headline case asserts against");
  const noClear = runCard(mutate('["sub", "value", "exact", "period"', '["sub", "value", "period"'));
  await handshake(noClear);
  noClear.deliver({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { name: "X", observations: [{ period: "2025", value: 0.846576563196289 }], citation: { citation_text: "C." } } } });
  deliverVerify(noClear, 4.12, 4.12);
  assert.notEqual(noClear.text("exact"), "", "without the reset, stale unrounded text must remain, which the carry-over test asserts against");
});

test("mutation: the runtime test catches a card that rounds the claimed figure", async () => {
  const anchor = "maximumFractionDigits: 20";
  assert.ok(CITATION_CARD_HTML.includes(anchor), "anchor missing, mutation cannot apply");
  const mutated = CITATION_CARD_HTML.replace(anchor, () => "maximumFractionDigits: 3");
  assert.notEqual(mutated, CITATION_CARD_HTML, "mutation did not apply");
  const card = runCard(mutated);
  await handshake(card);
  const payload = await showTool(card, "verify_stat", { indicator: "inflation_cpi", country: "BRB", period: "2023", claimed_value: 4.123456 });
  assert.ok(payload.verdict, "no verdict, so this mutation test would pass vacuously");
  assert.match(card.text("period"), /claimed 4\.123/, "the mutated card must still render the claim");
  assert.doesNotMatch(card.text("period"), /claimed 4\.123456$/, "rounding went undetected");
});
