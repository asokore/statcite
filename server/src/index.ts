// StatCite Worker entry: routes /mcp (MCP Streamable HTTP), /v1 (REST), /health;
// everything else falls through to static assets (the website in ../site).

import { handleMcp, corsHeaders, SERVER_VERSION } from "./mcp.ts";
import { handleRest } from "./rest.ts";
import type { Ctx } from "./core/types.ts";

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  BASE_URL?: string;
  FRED_API_KEY?: string;
}

function makeCtx(env: Env): Ctx {
  return {
    baseUrl: (env.BASE_URL ?? "https://statcite.com").replace(/\/$/, ""),
    fredApiKey: env.FRED_API_KEY || undefined,
  };
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const ctx = makeCtx(env);

  if (path === "/mcp" || path === "/mcp/") return handleMcp(request, ctx);
  if (path === "/v1" || path.startsWith("/v1/")) return handleRest(request, ctx);
  if (path === "/health") {
    return new Response(JSON.stringify({ ok: true, service: "statcite", version: SERVER_VERSION }), {
      headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders() },
    });
  }
  // Static site (landing page, docs, llms.txt, openapi.json, legal).
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      console.error("unhandled", e);
      return new Response(JSON.stringify({ error: { message: "Internal error" } }), {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }
  },
};
