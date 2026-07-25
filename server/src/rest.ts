// REST API (/v1/*) — the same core, addressable by plain HTTP for agents,
// spreadsheets, notebooks, and Custom GPT Actions (see /openapi.json).

import type { Ctx } from "./core/types.ts";
import { ToolError } from "./core/types.ts";
import { UpstreamError } from "./core/upstream.ts";
import { getIndicator, getSeries, searchIndicators, listRegistry } from "./core/series.ts";
import { countrySnapshot } from "./core/snapshot.ts";
import { inflationAdjust } from "./core/inflation.ts";
import { fxConvert } from "./core/fx.ts";
import { verifyStat } from "./core/verify.ts";
import { SOURCES } from "./core/sources.ts";
import { corsHeaders, SERVER_VERSION } from "./mcp.ts";
import { parseTransform } from "./core/transforms.ts";

function json(status: number, body: unknown, cacheSeconds = 3600): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? `public, max-age=${cacheSeconds}` : "no-store",
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

export async function handleRest(request: Request, ctx: Ctx): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "GET") return errJson(405, "Only GET is supported on /v1 endpoints.");

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
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
          "/v1/inflation?amount=100&from_year=1995&to_year=2025&country=USA",
          "/v1/fx?amount=100&from=USD&to=BBD&date=2024",
          "/v1/sources",
        ],
      }, 86400);
    }

    if (path === "/v1/indicators") {
      return json(200, { indicators: listRegistry() }, 86400);
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
      });
      return json(200, result);
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
      });
      return json(200, result);
    }

    if (path === "/v1/search") {
      const query = q.get("q");
      if (!query) return errJson(400, "Query parameter 'q' is required.");
      return json(200, { query, results: await searchIndicators(ctx, query) });
    }

    const snapMatch = path.match(/^\/v1\/snapshot\/([^/]+)$/);
    if (snapMatch) {
      return json(200, await countrySnapshot(ctx, decodeURIComponent(snapMatch[1])));
    }

    if (path === "/v1/verify") {
      const indicator = q.get("indicator");
      const period = q.get("period");
      if (!indicator || !period) {
        return errJson(400, "Required: indicator, period, value. Optional: country, tolerance_abs, tolerance_pct.");
      }
      const result = await verifyStat(ctx, {
        indicator,
        country: q.get("country") ?? undefined,
        period,
        claimed_value: qNum(q, "value", true)!,
        tolerance_abs: qNum(q, "tolerance_abs", false),
        tolerance_pct: qNum(q, "tolerance_pct", false),
      });
      return json(200, result, 1800);
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
    console.error("rest crash", path, e);
    return errJson(500, "Internal error. Please retry; if persistent, report an issue.");
  }
}
