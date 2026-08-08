// Stateless MCP Streamable HTTP endpoint (POST /mcp).
// Targets protocol revisions 2025-03-26 / 2025-06-18 / 2025-11-25:
//   - JSON-RPC batches accepted (required by 2025-03-26; removed in 2025-06-18 —
//     modern clients send single messages, but batches still get valid responses)
//   - plain application/json responses (SSE is optional and not needed)
//   - no session id (stateless servers MAY omit Mcp-Session-Id)
//   - notifications/responses -> 202 Accepted, empty body
//   - GET/DELETE -> 405
// Transport code is deliberately isolated so the 2026-07-28 stateless profile
// can be added without touching tool logic.

import type { Ctx } from "./core/types.ts";
import { ToolError } from "./core/types.ts";
import { UpstreamError } from "./core/upstream.ts";
import { TOOLS, toolByName, callTool } from "./tools.ts";
import { listRegistry } from "./core/series.ts";
import { SOURCES } from "./core/sources.ts";
import { sidsCountries } from "./core/countries.ts";

export const SERVER_VERSION = "1.8.1";
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-03-26", "2025-06-18", "2025-11-25"];
const LATEST_PROTOCOL = "2025-11-25";

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
    "access-control-allow-headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
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
export async function dispatchMessage(
  msg: JsonRpcMessage,
  ctx: Ctx,
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

  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const negotiated = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL;
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
        return { httpStatus: 200, body: errorObj(id, -32002, `Unknown resource '${uri}'. Available: ${RESOURCES.map((r) => r.uri).join(", ")}.`) };
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
      return { httpStatus: 200, body: errorObj(id, -32601, `Method '${msg.method}' not found.`) };
  }
}

export async function handleMcp(request: Request, ctx: Ctx): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "POST") {
    // Stateless server: no SSE stream (GET), no session to delete (DELETE).
    return new Response(null, { status: 405, headers: { allow: "POST, OPTIONS", ...corsHeaders() } });
  }

  // Protocol-version header: invalid (present but unsupported) -> 400. Missing is fine.
  const pv = request.headers.get("mcp-protocol-version");
  if (pv && !SUPPORTED_PROTOCOL_VERSIONS.includes(pv)) {
    return json(400, errorObj(null, -32000, `Unsupported MCP-Protocol-Version '${pv}'. Supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}.`));
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

  const r = await dispatchMessage(parsed as JsonRpcMessage, ctx);
  if (r.body === null) return new Response(null, { status: 202, headers: corsHeaders() });
  return json(r.httpStatus, r.body);
}
