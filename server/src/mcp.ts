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

export const SERVER_VERSION = "1.1.0";
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
async function dispatchMessage(
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
          capabilities: { tools: { listChanged: false } },
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
      return { httpStatus: 200, body: resultObj(id, { resources: [] }) };
    case "prompts/list":
      return { httpStatus: 200, body: resultObj(id, { prompts: [] }) };
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
