// StatCite Worker entry: routes /mcp (MCP Streamable HTTP), /v1 (REST), /health;
// everything else falls through to static assets (the website in ../site).

import { handleMcp, corsHeaders, SERVER_VERSION } from "./mcp.ts";
import { handleRest } from "./rest.ts";
import type { Ctx } from "./core/types.ts";

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  BASE_URL?: string;
  /** INERT — FRED is permanently disabled (adapters/fred.ts declines regardless;
   * ToU prohibit AI/ML use and caching/redistribution, v1.3.2). Kept so a
   * deployment with the old secret still bound doesn't break. */
  FRED_API_KEY?: string;
  /**
   * Workers Analytics Engine dataset (aggregate usage; no personal data).
   * Optional: absent in local dev and tests, in which case usage is only
   * emitted as a `STATCITE_USAGE …` console line. See core/analytics.ts.
   */
  STATCITE_USAGE?: { writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void };
}

function makeCtx(env: Env): Ctx {
  return {
    baseUrl: (env.BASE_URL ?? "https://statcite.com").replace(/\/$/, ""),
    fredApiKey: env.FRED_API_KEY || undefined,
    analytics: env.STATCITE_USAGE,
  };
}

/** The Worker's own routes. Everything else is a static asset, which gets its
 * headers from site/_headers instead. */
function isWorkerRoute(path: string): boolean {
  return path === "/mcp" || path === "/mcp/" || path === "/v1" || path.startsWith("/v1/") || path === "/health";
}

/** Security headers every Worker response carries, whatever produced it. */
export const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
};

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * True when the visitor reached this Worker over plain HTTP. Cloudflare passes
 * the visitor's scheme both in the request URL and in the CF-Visitor header.
 * Local development over http://localhost is left alone.
 */
function arrivedOverHttp(request: Request, url: URL): boolean {
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return false;
  // `wrangler dev` rewrites the URL onto the first configured route, so a local
  // request arrives as http://statcite.com/... and would redirect to itself in
  // a loop. Miniflare marks those requests with MF-Original-Hostname, while
  // Cloudflare's edge always sets CF-Visitor, so real visitors are unaffected.
  if (request.headers.has("mf-original-hostname") && !request.headers.has("cf-visitor")) return false;
  if (url.protocol === "http:") return true;
  return /"scheme"\s*:\s*"http"/.test(request.headers.get("cf-visitor") ?? "");
}

async function routeWorker(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const ctx = makeCtx(env);
  // The API and MCP endpoint answered plain HTTP with data. The zone's own
  // HTTPS redirect is the owner's setting, so the Worker enforces it for its
  // routes itself. 308 keeps the method and body, so a POST to /mcp is
  // retried over HTTPS by clients that follow redirects, and the body names
  // the HTTPS address for those that do not.
  if (arrivedOverHttp(request, url)) {
    const target = new URL(url.href);
    target.protocol = "https:";
    return new Response(
      JSON.stringify({ error: { code: "invalid_request", message: `StatCite is served over HTTPS only. Use ${target.href}` } }),
      { status: 308, headers: { location: target.href, "content-type": "application/json", "cache-control": "no-store", ...corsHeaders() } },
    );
  }
  if (path === "/mcp" || path === "/mcp/") return handleMcp(request, ctx);
  if (path === "/v1" || path.startsWith("/v1/")) return handleRest(request, ctx);
  return new Response(JSON.stringify({ ok: true, service: "statcite", version: SERVER_VERSION }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex", ...corsHeaders() },
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (isWorkerRoute(url.pathname)) return withSecurityHeaders(await routeWorker(request, env, url));
  // Static site (landing page, docs, llms.txt, openapi.json, legal).
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      console.error("unhandled", e);
      return new Response(JSON.stringify({ error: { code: "internal_error", message: "Internal error" } }), {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders(), ...SECURITY_HEADERS },
      });
    }
  },
};
