// DUAL-ERA MCP Streamable HTTP endpoint (POST /mcp).
//
// This server speaks two eras of the protocol on ONE endpoint, because the
// 2026-07-28 revision is breaking and the installed base is not going to move
// at once. The spec's own terms:
//
//   LEGACY (2025-03-26 / 2025-06-18 / 2025-11-25) — session era. The client
//     opens with an `initialize` handshake; version and capabilities are
//     negotiated once and remembered.
//   MODERN (2026-07-28) — stateless era. There is no handshake at all. Every
//     request carries its own protocol version, client identity and
//     capabilities in `params._meta`, and the server accepts or rejects each
//     request independently.
//
// Era is detected PER REQUEST from the declared version (header or `_meta`),
// never from connection state — that is what makes one endpoint able to serve
// both. A legacy client sees byte-identical behaviour to before this change;
// that property is the whole point and is covered by regression tests.
//
// What MODERN requires that legacy did not (all implemented below):
//   - `server/discover` MUST exist (advertises supported versions + identity)
//   - `MCP-Protocol-Version`, `Mcp-Method` and, where applicable, `Mcp-Name`
//     headers MUST be present and MUST match the body — mismatch is
//     -32020 HeaderMismatch + HTTP 400. This exists so intermediaries (load
//     balancers, gateways) can route on headers without parsing the body,
//     and cannot be lied to about what the body actually says.
//   - every result carries `resultType: "complete"`
//   - list/read results carry `ttlMs` + `cacheScope` (CacheableResult)
//   - unsupported version -> -32022 + HTTP 400, listing supported versions
//   - unknown method -> -32601 + HTTP 404 (legacy answered 200)
//   - `initialize` and `ping` do not exist; `Mcp-Session-Id` and
//     `Last-Event-ID` are ignored, never minted or echoed
//
// StatCite was already stateless and already minted no session ids, so the
// modern era costs nothing operationally — it is additive framing over the
// same tool logic, which this file still does not touch.

import type { Ctx } from "./core/types.ts";
import { ToolError } from "./core/types.ts";
import { UpstreamError } from "./core/upstream.ts";
import { TOOLS, toolByName, callTool } from "./tools.ts";
import { listRegistry } from "./core/series.ts";
import { SOURCES } from "./core/sources.ts";
import { sidsCountries } from "./core/countries.ts";

export const SERVER_VERSION = "1.11.0";

/** Session-era revisions: opened with `initialize`, negotiated once. */
export const LEGACY_PROTOCOL_VERSIONS = ["2025-03-26", "2025-06-18", "2025-11-25"];
/** Stateless-era revisions: per-request `_meta`, no handshake. */
export const MODERN_PROTOCOL_VERSIONS = ["2026-07-28"];
/** Everything the endpoint accepts, newest first — the list `server/discover`
 * and `UnsupportedProtocolVersionError` both advertise. */
export const SUPPORTED_PROTOCOL_VERSIONS = [...MODERN_PROTOCOL_VERSIONS, ...LEGACY_PROTOCOL_VERSIONS];
/** Newest LEGACY version. `initialize` may only ever negotiate a legacy
 * revision: the handshake does not exist in the modern era, so echoing
 * "2026-07-28" back to a client that just sent `initialize` would promise a
 * profile that request proves the client is not speaking. */
const LATEST_LEGACY_PROTOCOL = "2025-11-25";

/** MCP-reserved error codes (2026-07-28 renumbered these out of the
 * implementation-defined -32000..-32019 range into -32020..-32099). */
const ERR_HEADER_MISMATCH = -32020;
const ERR_UNSUPPORTED_PROTOCOL_VERSION = -32022;

/** `_meta` keys the modern era defines. Exact strings; a typo here is silent. */
const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

/** Freshness hint for cacheable results. Every list this server serves is
 * derived from build-time constants, so it can only change on deploy: one
 * hour is a safe under-estimate, and `public` is honest because the lists do
 * not vary per client (statelessness is what makes that true). */
const CACHE_TTL_MS = 3_600_000;
const CACHE_SCOPE = "public";
/** Results the spec's CacheableResult interface applies to. */
const CACHEABLE_METHODS = new Set([
  "server/discover",
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/read",
  "resources/templates/list",
]);

const INSTRUCTIONS =
  "StatCite provides official economic statistics with full citations. " +
  "Use get_indicator for common indicators (inflation_cpi, gdp_growth, unemployment_rate, govt_debt_gdp, …) with an ISO3 country code or name; " +
  "use verify_stat to check any economic figure before publishing it; " +
  "use inflation_adjust and fx_convert for value conversions. " +
  "Every response includes a citation object — reproduce it (or citation.citation_text) when presenting the number to users. " +
  "Free service; please keep request volumes reasonable.";

type JsonRpcId = string | number | null;

// ---------------------------------------------------------------------------
// Prompts — reusable workflow templates (prompts/list + prompts/get).
//
// fact_check is deliberately the constraint-compliant form of a document-level
// audit: the CLIENT model extracts the claims (it is a language model; that is
// its job), and verify_claims adjudicates them — no NLP or free-text parsing
// ever enters this Worker. All three prompts teach the same house rule: verify
// before publishing, cite what the tool returns, and pass through cannot_verify
// honestly instead of papering over it.
// ---------------------------------------------------------------------------

const PROMPTS = [
  {
    name: "fact_check",
    title: "Fact-check the economic statistics in a text",
    description:
      "Extract every checkable macroeconomic claim from a draft/article (indicator + country + period + value), verify them all with verify_claims, and report verdicts with citations. Paste or reference the text after invoking.",
    messages: (): Array<{ role: string; content: { type: string; text: string } }> => [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Fact-check the economic statistics in the text I provide.\n\n" +
            "1. Extract every checkable macroeconomic claim: an indicator (inflation, GDP growth, GDP, unemployment, government debt, fiscal balance, current account, trade, FDI, population, …), a country, a period (usually a year), and the claimed value. Skip vague claims with no number.\n" +
            "2. Map each claim to a StatCite registry key (use search_indicators if unsure) and call verify_claims with up to 15 claims per call, in the order they appear.\n" +
            "3. Report a table: claim as written | verdict (match / close / mismatch / cannot_verify) | official value | citation. Quote citation.citation_text for corrected figures.\n" +
            "4. Never soften a mismatch and never guess where the tool says cannot_verify — report the reason it gives. If a claim is a projection-year figure, say so (the result flags it).\n\n" +
            "Here is the text:\n",
        },
      },
    ],
  },
  {
    name: "country_brief",
    title: "One-country economic brief (fully cited)",
    description:
      "Build a compact, fully cited macroeconomic brief for one country from country_snapshot plus targeted get_indicator calls. Provide the country name after invoking.",
    messages: () => [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Write a one-page economic brief for the country I name.\n\n" +
            "1. Call country_snapshot for the headline picture (growth, inflation, unemployment, debt, current account).\n" +
            "2. Deepen with get_indicator where the snapshot flags something notable (e.g. a debt spike: pull the 10-year series).\n" +
            "3. Every figure cites its source using the citation object returned with it; keep projections labeled as projections, and note any value the tools could not provide rather than filling the gap from memory.\n" +
            "4. Structure: one paragraph of narrative, then a figures table with citations, then caveats (data vintages, projections, gaps).\n\n" +
            "Country:\n",
        },
      },
    ],
  },
  {
    name: "cite_this_stat",
    title: "Get a citation-ready version of one statistic",
    description:
      "Turn a single economic figure into a verified, citation-ready sentence: verify it first, then format the official value with its full citation. Provide the claim after invoking.",
    messages: () => [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "I will give you one economic statistic I want to use in a document.\n\n" +
            "1. Verify it with verify_stat (map to a registry key via search_indicators if needed).\n" +
            "2. If it matches or is close: give me the exact sentence to use, with the official value (not my possibly-rounded one) and the citation from citation.citation_text.\n" +
            "3. If it mismatches: say so plainly, give the correct figure and citation, and note the likely error class if the diagnostics identify one (wrong year, unit scaling, percent-vs-decimal).\n" +
            "4. If it cannot be verified: report the tool's reason; do not substitute a number from memory.\n\n" +
            "The statistic:\n",
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Resources — read-only reference documents (resources/list + resources/read).
// Generated from the same registry/source constants the tools use, so they can
// never drift from what the server actually serves.
// ---------------------------------------------------------------------------

function registryResourceText(): string {
  const rows = listRegistry().map((r) => `- ${r.key}: ${r.label} [${r.unit}] — sources: ${r.sources.join(" -> ")}`);
  return `StatCite indicator registry (${rows.length} indicators). Keys are stable API identifiers for get_indicator / verify_stat / verify_claims.\n\n${rows.join("\n")}`;
}

function sourcesResourceText(): string {
  const rows = SOURCES.map(
    (s) =>
      `## ${s.name}\nid: ${s.id}\nlicense: ${s.license}\nattribution: ${s.attribution_required}\nterms: ${s.terms_url}\ncoverage: ${s.coverage}\naccess: ${s.access}`,
  );
  return `StatCite data sources, licenses, and required attributions. Reproduce the attribution string when republishing values.\n\n${rows.join("\n\n")}`;
}

function sidsResourceText(): string {
  const rows = sidsCountries().map((c) => `- ${c.iso3}: ${c.name}`);
  return (
    `Small Island Developing States (UN OHRLLS list, 39 states; the ${rows.length} below resolve in StatCite's country table). ` +
    `A data-availability grouping for small-economy statistics - never a ranking. Query them individually via get_indicator/country_snapshot.\n\n` +
    rows.join("\n")
  );
}

const RESOURCES = [
  {
    uri: "statcite://registry/indicators",
    name: "indicator-registry",
    title: "Indicator registry (keys, labels, units, source chains)",
    description: "Every indicator key this server accepts, with its label, unit, and source fallback chain. Generated from the live registry constant.",
    mimeType: "text/plain",
    text: registryResourceText,
  },
  {
    uri: "statcite://registry/sources",
    name: "sources-and-licenses",
    title: "Data sources, licenses, and required attributions",
    description: "License and required-attribution details for every upstream source, including access method and coverage. Generated from the live source table.",
    mimeType: "text/plain",
    text: sourcesResourceText,
  },
  {
    uri: "statcite://registry/sids",
    name: "sids-states",
    title: "Small Island Developing States (UN OHRLLS list)",
    description: "The 39 states on the UN OHRLLS SIDS list with their ISO3 codes — a data-availability grouping for small-economy coverage, never a ranking. Upstream coverage varies by source and series.",
    mimeType: "text/plain",
    text: sidsResourceText,
  },
];

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
}

export function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    // Mcp-Method/Mcp-Name are the 2026-07-28 standard request headers; without
    // them in allow-headers a browser-based modern client is blocked by CORS
    // preflight before it can send a single compliant request.
    "access-control-allow-headers":
      "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, Mcp-Method, Mcp-Name",
    "access-control-expose-headers": "Mcp-Session-Id, Mcp-Protocol-Version",
    "access-control-max-age": "86400",
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

function resultObj(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

// ---------------------------------------------------------------------------
// Era detection and modern-era header validation (2026-07-28).
// ---------------------------------------------------------------------------

export type Era = "legacy" | "modern";

/** Decode the spec's Base64 sentinel for header values that cannot be carried
 * as plain ASCII: `=?base64?<b64>?=`. Markers are case-sensitive and must
 * appear exactly. A value that is not wrapped is returned unchanged; a wrapped
 * value that fails to decode returns undefined so the caller reports a
 * mismatch rather than silently comparing garbage. */
export function decodeMcpHeaderValue(raw: string): string | undefined {
  if (!(raw.startsWith("=?base64?") && raw.endsWith("?="))) return raw;
  const b64 = raw.slice("=?base64?".length, -"?=".length);
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** The protocol version a request declares in its body `_meta`. */
function metaProtocolVersion(params: Record<string, unknown>): string | undefined {
  const meta = params._meta as Record<string, unknown> | undefined;
  const v = meta && typeof meta === "object" ? meta[META_PROTOCOL_VERSION] : undefined;
  return typeof v === "string" ? v : undefined;
}

/** Which era a single message is speaking. Deliberately derived from the
 * DECLARED VERSION only (header or `_meta`), never from connection state —
 * there is no connection state in either era here, and that is what lets one
 * endpoint serve both. `server/discover` is modern-only by definition, so it
 * identifies its own era even from a bare probe with no headers. */
export function requestEra(method: string | undefined, params: Record<string, unknown>, headerVersion?: string | null): Era {
  if (method === "server/discover") return "modern";
  const metaVersion = metaProtocolVersion(params);
  const hdrVersion = headerVersion ?? undefined;
  // Modern when EITHER source declares a modern revision. Declaring modern in
  // one place and legacy in the other is not a legacy request — it is a
  // header/body disagreement, and it must reach validation to be refused
  // rather than be quietly served under the older, unvalidated rules. Serving
  // it as legacy would let an intermediary route on a modern header while the
  // server executed legacy semantics, which is the exact split-brain the
  // header rules exist to prevent.
  const declaresModern = (v?: string) => Boolean(v && MODERN_PROTOCOL_VERSIONS.includes(v));
  return declaresModern(metaVersion) || declaresModern(hdrVersion) ? "modern" : "legacy";
}

/** The `Mcp-Name` source field for the methods that require the header:
 * `params.name` for tools/call and prompts/get, `params.uri` for
 * resources/read. Any other method requires no name header. */
function mcpNameSource(method: string, params: Record<string, unknown>): string | undefined {
  if (method === "tools/call" || method === "prompts/get") {
    return typeof params.name === "string" ? params.name : "";
  }
  if (method === "resources/read") {
    return typeof params.uri === "string" ? params.uri : "";
  }
  return undefined;
}

/**
 * Modern-era header validation. The point of these headers is that an
 * intermediary can route or rate-limit on them WITHOUT parsing the body — so
 * the server's job is to guarantee header and body cannot disagree. A
 * mismatch is a security-relevant condition (two components acting on
 * different sources of truth), not a formatting nit, hence a hard 400.
 *
 * Returns an error message, or null when the request is clean.
 */
export function validateModernHeaders(
  method: string,
  params: Record<string, unknown>,
  headers: { protocolVersion?: string | null; mcpMethod?: string | null; mcpName?: string | null },
): string | null {
  const bodyVersion = metaProtocolVersion(params);
  const hdrVersion = headers.protocolVersion ?? undefined;
  if (!hdrVersion) return "MCP-Protocol-Version header is required on 2026-07-28 requests.";
  if (bodyVersion !== undefined && bodyVersion !== hdrVersion) {
    return `MCP-Protocol-Version header '${hdrVersion}' does not match body _meta['${META_PROTOCOL_VERSION}'] '${bodyVersion}'.`;
  }

  const hdrMethod = headers.mcpMethod ?? undefined;
  if (!hdrMethod) return "Mcp-Method header is required on 2026-07-28 requests.";
  if (hdrMethod !== method) return `Mcp-Method header '${hdrMethod}' does not match body method '${method}'.`;

  const nameSource = mcpNameSource(method, params);
  if (nameSource !== undefined) {
    const rawName = headers.mcpName ?? undefined;
    if (!rawName) return `Mcp-Name header is required for '${method}' requests.`;
    const decoded = decodeMcpHeaderValue(rawName);
    if (decoded === undefined) return "Mcp-Name header is not valid Base64-sentinel-encoded UTF-8.";
    if (decoded !== nameSource) return `Mcp-Name header '${decoded}' does not match the request body value '${nameSource}'.`;
  }
  return null;
}

/** Shape a legacy result into a modern one: required `resultType`, the
 * SHOULD-level `serverInfo`, and the CacheableResult fields where the spec
 * requires them. Applied only to modern responses, so legacy payloads stay
 * byte-identical to what shipped before this revision. */
function toModernResult(method: string, result: unknown): unknown {
  if (result === null || typeof result !== "object" || Array.isArray(result)) return result;
  const r = result as Record<string, unknown>;
  const existingMeta = (r._meta ?? {}) as Record<string, unknown>;
  return {
    resultType: "complete",
    ...r,
    ...(CACHEABLE_METHODS.has(method) ? { ttlMs: CACHE_TTL_MS, cacheScope: CACHE_SCOPE } : {}),
    _meta: {
      ...existingMeta,
      [META_SERVER_INFO]: { name: "statcite", title: "StatCite — Verified Economic Statistics", version: SERVER_VERSION },
    },
  };
}

function errorObj(id: JsonRpcId, code: number, message: string, data?: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function toolTextObj(id: JsonRpcId, payload: unknown, isError = false): Record<string, unknown> {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const result: Record<string, unknown> = { content: [{ type: "text", text }], isError };
  if (!isError && payload !== null && typeof payload === "object") {
    result.structuredContent = payload;
  }
  return resultObj(id, result);
}

/**
 * Handle one JSON-RPC message. Returns the response object, or null for
 * notifications/client-responses (which produce no body). `httpStatus` is a
 * hint used only for single (non-batch) messages.
 */
async function dispatchCore(
  msg: JsonRpcMessage,
  ctx: Ctx,
  era: Era,
): Promise<{ body: Record<string, unknown> | null; httpStatus: number }> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0") {
    return { body: errorObj(null, -32600, "Invalid Request: expected a JSON-RPC 2.0 message."), httpStatus: 400 };
  }

  // Notifications and client responses: accept and discard.
  const isNotification = msg.method !== undefined && msg.id === undefined;
  const isClientResponse = msg.method === undefined && (msg.result !== undefined || msg.error !== undefined);
  if (isNotification || isClientResponse) {
    return { body: null, httpStatus: 202 };
  }
  if (typeof msg.method !== "string" || msg.id == null) {
    return { body: errorObj(null, -32600, "Invalid Request: requests need an id and a method."), httpStatus: 400 };
  }
  if (typeof msg.id !== "string" && typeof msg.id !== "number") {
    return { body: errorObj(null, -32600, "Invalid Request: id must be a string or number."), httpStatus: 400 };
  }

  const id = msg.id as JsonRpcId;
  const params = (msg.params ?? {}) as Record<string, unknown>;

  // Methods that exist in one era only. `initialize`/`ping` were removed in
  // 2026-07-28; `server/discover` did not exist before it. Answering the wrong
  // one would tell the client its era is supported when it is not.
  if (era === "modern" && (msg.method === "initialize" || msg.method === "ping")) {
    return {
      httpStatus: 404,
      body: errorObj(id, -32601, `Method '${msg.method}' does not exist in protocol revision 2026-07-28 (it was removed with the handshake). Send requests directly; call 'server/discover' for identity and supported versions.`),
    };
  }
  if (era === "legacy" && msg.method === "server/discover") {
    return {
      httpStatus: 200,
      body: errorObj(id, -32601, "Method 'server/discover' requires protocol revision 2026-07-28. Declare it via the MCP-Protocol-Version header and params._meta, or use 'initialize' for the session-era revisions."),
    };
  }

  switch (msg.method) {
    // Modern-era discovery. MUST be implemented by 2026-07-28 servers: it is
    // how a client learns supported versions and identity without a handshake,
    // and how a dual-era client tells a modern server from a legacy one.
    case "server/discover":
      return {
        httpStatus: 200,
        body: resultObj(id, {
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
          },
          instructions: INSTRUCTIONS,
        }),
      };
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      // Only ever negotiate a LEGACY revision here — see LATEST_LEGACY_PROTOCOL.
      const negotiated = LEGACY_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_LEGACY_PROTOCOL;
      return {
        httpStatus: 200,
        body: resultObj(id, {
          protocolVersion: negotiated,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
          },
          serverInfo: {
            name: "statcite",
            title: "StatCite — Verified Economic Statistics",
            version: SERVER_VERSION,
          },
          instructions: INSTRUCTIONS,
        }),
      };
    }
    case "ping":
      return { httpStatus: 200, body: resultObj(id, {}) };
    case "tools/list":
      return {
        httpStatus: 200,
        body: resultObj(id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
            annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
          })),
        }),
      };
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const tool = toolByName.get(name);
      if (!tool) {
        return {
          httpStatus: 200,
          body: errorObj(id, -32602, `Unknown tool '${name}'. Available: ${TOOLS.map((t) => t.name).join(", ")}.`),
        };
      }
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const payload = await callTool(ctx, tool, args);
        return { httpStatus: 200, body: toolTextObj(id, payload) };
      } catch (e) {
        // Tool-level failures are tool results (isError), not protocol errors (SEP-1303).
        if (e instanceof ToolError) {
          return { httpStatus: 200, body: toolTextObj(id, { error: e.message, ...(e.details ? { details: e.details } : {}) }, true) };
        }
        if (e instanceof UpstreamError) {
          return {
            httpStatus: 200,
            body: toolTextObj(
              id,
              { error: `Upstream data source problem: ${e.message}`, upstream_url: e.url, hint: "Usually transient — retry shortly." },
              true,
            ),
          };
        }
        console.error("tool crash", name, e);
        return {
          httpStatus: 200,
          body: toolTextObj(id, { error: `Internal error running '${name}'. Please retry; if persistent, report at ${ctx.baseUrl}.` }, true),
        };
      }
    }
    case "resources/list":
      return {
        httpStatus: 200,
        body: resultObj(id, {
          resources: RESOURCES.map((r) => ({ uri: r.uri, name: r.name, title: r.title, description: r.description, mimeType: r.mimeType })),
        }),
      };
    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : "";
      const res = RESOURCES.find((r) => r.uri === uri);
      if (!res) {
        // 2026-07-28 realigned resource-not-found with JSON-RPC: -32002 became
        // -32602 (Invalid Params). Legacy clients still get -32002, which is
        // what their revision defines.
        const code = era === "modern" ? -32602 : -32002;
        return { httpStatus: 200, body: errorObj(id, code, `Unknown resource '${uri}'. Available: ${RESOURCES.map((r) => r.uri).join(", ")}.`) };
      }
      return {
        httpStatus: 200,
        body: resultObj(id, { contents: [{ uri: res.uri, mimeType: res.mimeType, text: res.text() }] }),
      };
    }
    case "prompts/list":
      return {
        httpStatus: 200,
        body: resultObj(id, {
          prompts: PROMPTS.map((p) => ({ name: p.name, title: p.title, description: p.description })),
        }),
      };
    case "prompts/get": {
      const name = typeof params.name === "string" ? params.name : "";
      const prompt = PROMPTS.find((p) => p.name === name);
      if (!prompt) {
        return { httpStatus: 200, body: errorObj(id, -32602, `Unknown prompt '${name}'. Available: ${PROMPTS.map((p) => p.name).join(", ")}.`) };
      }
      return { httpStatus: 200, body: resultObj(id, { description: prompt.description, messages: prompt.messages() }) };
    }
    default:
      // Modern era pairs an unknown method with HTTP 404 so a dual-era client
      // can distinguish "this endpoint exists but not that method" from a
      // legacy server that does not host the modern endpoint at all.
      return { httpStatus: era === "modern" ? 404 : 200, body: errorObj(id, -32601, `Method '${msg.method}' not found.`) };
  }
}

/**
 * Dispatch one JSON-RPC message in the given era. Legacy is the default and
 * is deliberately untouched by the modern path: the only difference a legacy
 * client can observe is none at all.
 */
export async function dispatchMessage(
  msg: JsonRpcMessage,
  ctx: Ctx,
  era: Era = "legacy",
): Promise<{ body: Record<string, unknown> | null; httpStatus: number }> {
  const out = await dispatchCore(msg, ctx, era);
  if (era !== "modern" || !out.body || out.body.result === undefined) return out;
  const method = typeof msg.method === "string" ? msg.method : "";
  return { ...out, body: { ...out.body, result: toModernResult(method, out.body.result) } };
}

export async function handleMcp(request: Request, ctx: Ctx): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "POST") {
    // Stateless server: no SSE stream (GET), no session to delete (DELETE).
    return new Response(null, { status: 405, headers: { allow: "POST, OPTIONS", ...corsHeaders() } });
  }

  // Protocol-version header: present but unsupported -> 400 with the modern
  // UnsupportedProtocolVersionError, which carries the supported list so a
  // client can retry with a mutually supported version instead of guessing.
  // Missing is still fine: legacy clients before 2025-06-18 never sent it.
  const pv = request.headers.get("mcp-protocol-version");
  if (pv && !SUPPORTED_PROTOCOL_VERSIONS.includes(pv)) {
    return json(
      400,
      errorObj(null, ERR_UNSUPPORTED_PROTOCOL_VERSION, `Unsupported protocol version '${pv}'.`, {
        supported: SUPPORTED_PROTOCOL_VERSIONS,
        requested: pv,
      }),
    );
  }

  let parsed: unknown;
  try {
    const text = await request.text();
    if (text.length > 262144) return json(400, errorObj(null, -32600, "Request body too large."));
    parsed = JSON.parse(text);
  } catch {
    return json(400, errorObj(null, -32700, "Parse error: body must be JSON."));
  }

  // JSON-RPC batch (2025-03-26 clients). Sequential processing preserves order.
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return json(400, errorObj(null, -32600, "Invalid Request: empty batch."));
    }
    // A tiny per-message body (e.g. country_snapshot at ~113 bytes) lets ~2,300
    // messages fit the 256KB request cap, each fanning out to multiple upstream
    // subrequests — one request could exhaust the Worker's subrequest budget.
    // 20 mirrors the verify_claims per-call cap (tools.ts MAX_CLAIMS) for the
    // same free-tier-budget reason.
    if (parsed.length > 20) {
      return json(400, errorObj(null, -32600, "Invalid Request: batch too large (max 20 messages)."));
    }
    const bodies: Record<string, unknown>[] = [];
    for (const m of parsed) {
      const r = await dispatchMessage(m as JsonRpcMessage, ctx);
      if (r.body) bodies.push(r.body);
    }
    if (bodies.length === 0) return new Response(null, { status: 202, headers: corsHeaders() });
    return json(200, bodies);
  }

  const msg = parsed as JsonRpcMessage;
  const era = requestEra(msg?.method, (msg?.params ?? {}) as Record<string, unknown>, pv);

  // Modern era only: headers and body must agree before anything is executed.
  // `server/discover` is deliberately exempt — it is the probe a dual-era
  // client uses to find out what this server speaks, so refusing it for a
  // missing header would break the very negotiation it exists to serve.
  if (era === "modern" && msg?.method && msg.method !== "server/discover" && msg.id != null) {
    const problem = validateModernHeaders(msg.method, (msg.params ?? {}) as Record<string, unknown>, {
      protocolVersion: pv,
      mcpMethod: request.headers.get("mcp-method"),
      mcpName: request.headers.get("mcp-name"),
    });
    if (problem) {
      return json(400, errorObj((msg.id as JsonRpcId) ?? null, ERR_HEADER_MISMATCH, `Header mismatch: ${problem}`));
    }
  }

  const r = await dispatchMessage(msg, ctx, era);
  if (r.body === null) return new Response(null, { status: 202, headers: corsHeaders() });
  return json(r.httpStatus, r.body);
}
