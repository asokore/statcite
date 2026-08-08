// REST API (/v1/*) — the same core, addressable by plain HTTP for agents,
// spreadsheets, notebooks, and Custom GPT Actions (see /openapi.json).

import type { Ctx } from "./core/types.ts";
import { ToolError } from "./core/types.ts";
import { UpstreamError, fetchJson } from "./core/upstream.ts";
import { getIndicator, getSeries, searchIndicators, listRegistry, compareSources } from "./core/series.ts";
import { countrySnapshot } from "./core/snapshot.ts";
import { inflationAdjust } from "./core/inflation.ts";
import { fxConvert } from "./core/fx.ts";
import { verifyStat } from "./core/verify.ts";
import { runVerifyClaims } from "./tools.ts";
import { SOURCES } from "./core/sources.ts";
import { corsHeaders, SERVER_VERSION } from "./mcp.ts";
import { parseTransform } from "./core/transforms.ts";
import { recordUsage, restOp, indicatorLabel, countryLabel, type Outcome } from "./core/analytics.ts";

function json(status: number, body: unknown, cacheSeconds = 3600): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 && cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
      ...corsHeaders(),
    },
  });
}

function errJson(status: number, message: string, details?: unknown): Response {
  return json(status, { error: { message, ...(details !== undefined ? { details } : {}) } });
}

/** Parameter-format error (thrown to produce a 400 with the parameter named). */
class ParamError extends Error {}

function qNum(q: URLSearchParams, name: string, required: boolean): number | undefined {
  const raw = q.get(name);
  if (raw == null || raw === "") {
    if (required) throw new ParamError(`Query parameter '${name}' is required and must be a number.`);
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new ParamError(`Query parameter '${name}' must be a number (got '${raw}').`);
  return n;
}

function qYear(q: URLSearchParams, name: string): string | undefined {
  const raw = q.get(name);
  if (raw == null || raw === "") return undefined;
  if (!/^\d{4}$/.test(raw)) throw new ParamError(`Query parameter '${name}' must be a 4-digit year (got '${raw}').`);
  return raw;
}

/** Mutable slot for dimensions only the route body knows (currently the verdict). */
interface UsageSlot {
  verdict?: string;
}

/**
 * REST entry point: routes the request, then records one aggregate usage event
 * (see core/analytics.ts). Recording happens after the Response object exists,
 * never throws, and adds no awaits to the response path.
 */
export async function handleRest(request: Request, ctx: Ctx): Promise<Response> {
  const started = Date.now();
  const slot: UsageSlot = {};
  const res = await routeRest(request, ctx, slot);
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const isVerifyClaims = path === "/v1/verify_claims";
    if (request.method === "GET" || (request.method === "POST" && isVerifyClaims)) {
      const q = url.searchParams;
      const indMatch = path.match(/^\/v1\/indicator\/([a-z0-9_]+)$/);
      const snapMatch = path.match(/^\/v1\/snapshot\/([^/]+)$/);
      let country: string | undefined = q.get("country") ?? undefined;
      if (!country && snapMatch) {
        try {
          country = decodeURIComponent(snapMatch[1]);
        } catch {
          country = undefined;
        }
      }
      const outcome: Outcome =
        res.status < 400 ? "ok" : res.status === 502 ? "upstream_error" : res.status >= 500 ? "crash" : "tool_error";
      recordUsage(ctx.analytics, {
        transport: "rest",
        op: isVerifyClaims ? "verify_claims" : restOp(path),
        indicator: indicatorLabel(indMatch ? indMatch[1] : (q.get("indicator") ?? q.get("id") ?? undefined)),
        country: countryLabel(country),
        verdict: slot.verdict,
        outcome,
        durationMs: Date.now() - started,
      });
    }
  } catch {
    // Analytics must never affect the response.
  }
  return res;
}

async function routeRest(request: Request, ctx: Ctx, usage: UsageSlot): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/v1/verify_claims") return verifyClaimsRoute(request, ctx);
  if (request.method !== "GET") return errJson(405, "Only GET is supported on /v1 endpoints (POST is accepted on /v1/verify_claims only).");

  const q = url.searchParams;

  try {
    if (path === "/v1" || path === "/v1/index") {
      return json(200, {
        service: "StatCite",
        version: SERVER_VERSION,
        description: "Official economic statistics with full citations, for AI agents and humans.",
        mcp_endpoint: `${ctx.baseUrl}/mcp`,
        openapi: `${ctx.baseUrl}/openapi.json`,
        docs: `${ctx.baseUrl}/docs.html`,
        endpoints: [
          "/v1/indicators",
          "/v1/indicator/{key}?country=BRB&start_year=2015&end_year=2025&transform=none|yoy|pct_change|index&latest_only=true",
          "/v1/series?id=worldbank/NY.GDP.MKTP.KD.ZG&country=USA",
          "/v1/search?q=government+debt",
          "/v1/snapshot/{country}",
          "/v1/verify?indicator=inflation_cpi&country=BRB&period=2024&value=1.4",
          "/v1/verify_claims (POST, JSON body { claims: [{ indicator, country, period, claimed_value }] }, max 15 claims)",
          "/v1/inflation?amount=100&from_year=1995&to_year=2025&country=USA",
          "/v1/fx?amount=100&from=USD&to=BBD&date=2024",
          "/v1/sources",
          "/v1/status",
          "/v1/compare?indicator=govt_debt_gdp&country=BRB&period=2023",
        ],
      }, 86400);
    }

    if (path === "/v1/indicators") {
      return json(200, { indicators: listRegistry() }, 86400);
    }

    if (path === "/v1/compare") {
      const indicator = q.get("indicator");
      const country = q.get("country");
      if (!indicator || !country) return errJson(400, "Query parameters 'indicator' and 'country' are required, e.g. /v1/compare?indicator=govt_debt_gdp&country=BRB&period=2023.");
      const result = await compareSources(ctx, indicator, country, q.get("period") ?? undefined);
      // Divergence state can change as either source revises; keep the cache short.
      return json(200, result, 3600);
    }

    if (path === "/v1/status") {
      // Merged status+health surface (GROWTH-PLAN Phase 1): version + live
      // upstream probes. Cached at the edge for 120s so a poller or badge can
      // never relay load to the upstream APIs; probes are the cheapest known
      // endpoint per source and share the Worker's normal fetch path (so a
      // probe result reflects what real requests would experience). Probe
      // failures report as degraded — never a thrown error; the status page
      // must not be the least reliable part of the system.
      const probes: Record<string, { ok: boolean; ms: number }> = {};
      const probe = async (name: string, fn: () => Promise<boolean>) => {
        const t0 = Date.now();
        try {
          probes[name] = { ok: await fn(), ms: Date.now() - t0 };
        } catch {
          probes[name] = { ok: false, ms: Date.now() - t0 };
        }
      };
      await Promise.all([
        probe("worldbank", async () => {
          await fetchJson("https://api.worldbank.org/v2/country/USA?format=json", { ttlSeconds: 120, timeoutMs: 5000 });
          return true;
        }),
        probe("imf_datamapper", async () => {
          await fetchJson("https://www.imf.org/external/datamapper/api/v1/regions", { ttlSeconds: 120, timeoutMs: 5000 });
          return true;
        }),
        probe("dbnomics", async () => {
          await fetchJson("https://api.db.nomics.world/v22/datasets/IMF/WEO:latest?limit=1", { ttlSeconds: 120, timeoutMs: 5000 });
          return true;
        }),
      ]);
      const allOk = Object.values(probes).every((p) => p.ok);
      return json(200, {
        service: "StatCite",
        version: SERVER_VERSION,
        status: allOk ? "ok" : "degraded",
        upstreams: probes,
        note: "Upstream probes are cached ~120s; 'degraded' means at least one primary source is unreachable right now — fallback chains may still serve affected indicators, with fallback_used disclosed per response.",
      }, 120);
    }

    const indMatch = path.match(/^\/v1\/indicator\/([a-z0-9_]+)$/);
    if (indMatch) {
      const country = q.get("country");
      if (!country) return errJson(400, "Query parameter 'country' is required (ISO3 code or name).");
      const latestOnly = q.get("latest_only") === "true";
      const result = await getIndicator(ctx, indMatch[1], country, {
        start: qYear(q, "start_year"),
        end: qYear(q, "end_year"),
        transform: parseTransform(q.get("transform")),
        limit: latestOnly ? 1 : 80,
        strictSource: q.get("strict_source") === "true",
      });
      // A fallback-sourced response must not linger in shared caches: once the
      // primary recovers, the same URL should serve the primary's value again.
      return json(200, result, result.fallback_used ? 0 : 3600);
    }

    if (path === "/v1/series") {
      const id = q.get("id");
      if (!id) return errJson(400, "Query parameter 'id' is required, e.g. id=worldbank/NY.GDP.MKTP.KD.ZG.");
      const result = await getSeries(ctx, id, {
        country: q.get("country") ?? undefined,
        start: qYear(q, "start_year"),
        end: qYear(q, "end_year"),
        transform: parseTransform(q.get("transform")),
        limit: 120,
        strictSource: q.get("strict_source") === "true",
      });
      return json(200, result, result.fallback_used ? 0 : 3600);
    }

    if (path === "/v1/search") {
      const query = q.get("q");
      if (!query) return errJson(400, "Query parameter 'q' is required.");
      return json(200, { query, results: await searchIndicators(ctx, query) });
    }

    const snapMatch = path.match(/^\/v1\/snapshot\/([^/]+)$/);
    if (snapMatch) {
      const snapshot = await countrySnapshot(ctx, decodeURIComponent(snapMatch[1]));
      // Same rule as /v1/indicator: a fallback-sourced number must not linger in
      // shared caches after the primary source recovers.
      return json(200, snapshot, snapshot.fallback_used ? 0 : 3600);
    }

    if (path === "/v1/verify") {
      const indicator = q.get("indicator");
      const period = q.get("period");
      if (!indicator || !period) {
        return errJson(400, "Required: indicator, period, value. Optional: country, tolerance_abs, tolerance_pct, as_of.");
      }
      const result = await verifyStat(ctx, {
        indicator,
        country: q.get("country") ?? undefined,
        period,
        claimed_value: qNum(q, "value", true)!,
        tolerance_abs: qNum(q, "tolerance_abs", false),
        tolerance_pct: qNum(q, "tolerance_pct", false),
        strict_source: q.get("strict_source") === "true",
        as_of: q.get("as_of") ?? undefined,
      });
      usage.verdict = result.verdict;
      return json(200, result, result.fallback_used ? 0 : 1800);
    }

    if (path === "/v1/inflation") {
      return json(
        200,
        await inflationAdjust(ctx, qNum(q, "amount", true)!, qNum(q, "from_year", true)!, qNum(q, "to_year", true)!, q.get("country") ?? "USA"),
      );
    }

    if (path === "/v1/fx") {
      const from = q.get("from");
      const to = q.get("to");
      if (!from || !to) return errJson(400, "Required: amount, from, to. Optional: date (YYYY-MM-DD or YYYY).");
      return json(200, await fxConvert(ctx, qNum(q, "amount", true)!, from, to, q.get("date") ?? undefined), 1800);
    }

    if (path === "/v1/sources") {
      return json(200, { sources: SOURCES }, 86400);
    }

    return errJson(404, `Unknown endpoint '${path}'. See ${ctx.baseUrl}/v1 for the endpoint list.`);
  } catch (e) {
    if (e instanceof ParamError) return errJson(400, e.message);
    if (e instanceof ToolError) return errJson(422, e.message, e.details);
    if (e instanceof UpstreamError) return errJson(502, `Upstream data source problem: ${e.message}`, { upstream_url: e.url });
    // Log the closed-set op name, not the raw path: /v1/snapshot/{country}
    // carries arbitrary user text in the path segment, and privacy.html
    // promises free-text input is never retained.
    console.error("rest crash", restOp(path), e);
    return errJson(500, "Internal error. Please retry; if persistent, report an issue.");
  }
}

async function verifyClaimsRoute(request: Request, ctx: Ctx): Promise<Response> {
  if (request.method !== "POST") {
    return errJson(
      405,
      'Use POST for /v1/verify_claims with a JSON body: { "claims": [{ "indicator": "inflation_cpi", "country": "BRB", "period": "2024", "claimed_value": 1.4 }] } (1–15 claims per call).',
    );
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/\bapplication\/json\b/i.test(contentType)) {
    return errJson(415, `Set 'content-type: application/json' and send a JSON body: { "claims": [...] } (got '${contentType || "no content-type"}').`);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errJson(422, 'Malformed JSON body. Send: { "claims": [{ "indicator": ..., "country": ..., "period": ..., "claimed_value": ... }] }.');
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return errJson(422, 'Body must be a JSON object with a \'claims\' array — wrap the claims as { "claims": [...] }.');
  }
  try {
    const b = body as Record<string, unknown>;
    return json(200, await runVerifyClaims(ctx, b.claims, b.strict_source === true), 0);
  } catch (e) {
    if (e instanceof ToolError) return errJson(422, e.message, e.details);
    if (e instanceof UpstreamError) return errJson(502, `Upstream data source problem: ${e.message}`, { upstream_url: e.url });
    console.error("rest crash", "/v1/verify_claims", e);
    return errJson(500, "Internal error. Please retry; if persistent, report an issue.");
  }
}
