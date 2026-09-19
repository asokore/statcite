// REST API (/v1/*) — the same core, addressable by plain HTTP for agents,
// spreadsheets, notebooks, and Custom GPT Actions (see /openapi.json).

import type { Ctx } from "./core/types.ts";
import { ToolError, toolErrorCode, type ErrorCode } from "./core/types.ts";
import { UpstreamError, fetchJson, isMemCached } from "./core/upstream.ts";
import { getIndicator, getSeries, searchIndicators, listRegistry, compareSources } from "./core/series.ts";
import { countrySnapshot } from "./core/snapshot.ts";
import { inflationAdjust } from "./core/inflation.ts";
import { fxConvert } from "./core/fx.ts";
import { verifyStat } from "./core/verify.ts";
import { runVerifyClaims, MAX_STR_LEN } from "./tools.ts";
import { SOURCES } from "./core/sources.ts";
import { corsHeaders, SERVER_VERSION } from "./mcp.ts";
import { parseTransform } from "./core/transforms.ts";
import { recordUsage, restOp, indicatorLabel, countryLabel, seriesIdCountry, type Outcome } from "./core/analytics.ts";
import { readBodyCapped, MAX_BODY_BYTES } from "./body.ts";
import { caribstatUrl, parseCaribstatId } from "./adapters/caribstat.ts";
import { quoteInput } from "./core/text.ts";

function json(status: number, body: unknown, cacheSeconds = 3600): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 && cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
      // These responses are public, max-age=3600 and CORS-open, and the edge
      // serves four content-codings from one URL. Without Vary a shared cache
      // may hand a brotli body to a client that asked for identity.
      vary: "Accept-Encoding",
      // The static pages get HSTS from site/_headers, which does not reach the
      // Worker routes, so the API had no upgrade policy at all.
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      // Machine responses are not pages. Raw /v1/ JSON carrying an old version
      // number was ranking as a brand result on Bing and DuckDuckGo. This does
      // not block crawling, which robots.txt leaves open for agents.
      "x-robots-tag": "noindex",
      ...corsHeaders(),
    },
  });
}

const STATUS_CODE: Record<number, ErrorCode> = {
  400: "invalid_parameter",
  404: "unknown_endpoint",
  405: "method_not_allowed",
  415: "unsupported_media_type",
  422: "invalid_request",
  502: "upstream_unavailable",
  500: "internal_error",
};

/** Error envelope: { error: { code, message, details? } }. `code` is from the
 * closed ERROR_CODES list, so a client can branch without parsing the prose. */
function errJson(status: number, message: string, details?: unknown, code?: ErrorCode): Response {
  const c = code ?? STATUS_CODE[status] ?? "invalid_request";
  return json(status, { error: { code: c, message, ...(details !== undefined ? { details } : {}) } });
}

/** A 405 that names the methods it will accept, as RFC 9110 requires. */
function json405(message: string, allow: string): Response {
  const r = errJson(405, message);
  const h = new Headers(r.headers);
  h.set("allow", allow);
  return new Response(r.body, { status: 405, headers: h });
}

/** Strip the body from a response, preserving status and every header. */
function toHead(r: Response): Response {
  return new Response(null, { status: r.status, headers: r.headers });
}

/**
 * The indicator key in /v1/indicator/{key}, normalised the way people type it.
 * '/v1/indicator/GDP-growth' used to fall through to "Unknown endpoint", a 404
 * that says the route does not exist when only the spelling was off. Case,
 * hyphens and spaces are folded to the registry form, and a key that still
 * does not exist reaches getIndicator, which refuses it with suggestions.
 * Returned as a match-like array so both call sites keep reading [1].
 */
function indicatorPathKey(path: string): [string, string] | null {
  const m = /^\/v1\/indicator\/([^/]+)$/.exec(path);
  if (!m) return null;
  let raw = m[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // leave it as sent
  }
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return key ? [m[0], key] : null;
}

/** Parameter-format error (thrown to produce a 400 with the parameter named). */
class ParamError extends Error {}

/** Accepted query parameters for GET /v1/verify. `claimed_value` is an alias
 *  for `value`, matching verify_claims and the verify_stat MCP tool. */
const VERIFY_PARAMS = [
  "indicator", "country", "period", "value", "claimed_value",
  "tolerance_abs", "tolerance_pct", "strict_source", "as_of",
] as const;

/**
 * Query booleans, parsed properly.
 *
 * `q.get(name) === "true"` looks harmless and is not. `strict_source=1` read as
 * false does not fail, it SILENTLY DOWNGRADES: the caller asked for a
 * primary-source-only guarantee and quietly received a fallback value with a
 * 200. `latest_only=1` returned all 65 observations instead of one. Both were
 * live on 2026-08-13.
 *
 * An unparseable value is a 400 rather than a default, because for a
 * reproducibility flag the safe direction is refusing the request, not guessing
 * the permissive reading of it.
 */
function qBool(q: URLSearchParams, name: string, fallback = false): boolean {
  const raw = q.get(name);
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(v)) return true;
  if (["false", "0", "no", "off"].includes(v)) return false;
  throw new ParamError(
    `Query parameter '${name}' must be a boolean (true/false, 1/0, yes/no, on/off). Received '${raw}'.`,
  );
}

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

/**
 * Reject query parameters this route does not accept.
 *
 * The service already refuses rather than guesses for unknown VALUES
 * (transform=bogus is a 422 naming the valid list) and for unknown indicators.
 * Names were the one place silence won, and silence is worst exactly where it
 * costs most: `tolerance=0.001` on /v1/verify is dropped, the lenient default
 * applies, and the caller who asked for a strict check is told "match".
 *
 * Suggestion uses the same closest-match idiom as the unknown-indicator error,
 * because a caller who typo'd `tolerence_abs` needs the real name, not a list.
 */
function rejectUnknownParams(q: URLSearchParams, allowed: readonly string[]): void {
  // A repeated name is refused too. q.get() reads the first value and drops
  // the rest, so ?tolerance_abs=0.5&tolerance_abs=0.01 silently checked at 0.5.
  // One counting pass. getAll() per distinct name rescans the whole list, which
  // made a URL of a few thousand short names cost several times the CPU budget.
  const counts = new Map<string, number>();
  for (const k of q.keys()) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [k, n] of counts) {
    if (n > 1) {
      throw new ParamError(
        `Query parameter '${quoteInput(k, 40)}' was given ${n} times. Each parameter takes one value. For several countries or indicators, make one call for each.`,
      );
    }
  }
  const unknown = [...counts.keys()].filter((k) => !allowed.includes(k));
  if (!unknown.length) return;
  const near = (name: string): string => {
    const lower = name.toLowerCase().replace(/[^a-z]/g, "");
    const hit = allowed.find((a) => a.toLowerCase().replace(/[^a-z]/g, "") === lower);
    return hit ? ` Did you mean '${hit}'?` : "";
  };
  const first = unknown[0];
  const more = unknown.slice(1);
  throw new ParamError(
    `Unknown query parameter '${quoteInput(first, 64)}'.${near(first)}` +
      (more.length ? ` Also unknown: ${more.slice(0, 5).map((k) => quoteInput(k, 40)).join(", ")}${more.length > 5 ? ` and ${more.length - 5} more` : ""}.` : "") +
      ` This route accepts: ${allowed.join(", ")}.` +
      " Parameters are rejected rather than ignored, because a dropped tolerance or filter silently changes the answer.",
  );
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
export async function handleRest(request: Request, baseCtx: Ctx): Promise<Response> {
  // Everything below answers an HTTP caller, who has no MCP tools.
  const ctx: Ctx = { ...baseCtx, surface: "rest" };
  const started = Date.now();
  const slot: UsageSlot = {};
  const routed = await routeRest(request, ctx, slot);
  // Strip the body once, here, rather than at every return point inside
  // routeRest. HEAD must be byte-identical to GET in status and headers and
  // carry no body, and doing it in one place is what guarantees the two can
  // never drift apart.
  const res = request.method === "HEAD" ? toHead(routed) : routed;
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const isVerifyClaims = path === "/v1/verify_claims";
    if (request.method === "GET" || (request.method === "POST" && isVerifyClaims)) {
      const q = url.searchParams;
      const indMatch = indicatorPathKey(path);
      const snapMatch = path.match(/^\/v1\/snapshot\/([^/]+)$/);
      // The snapshot route takes its country from the path. A stray ?country=
      // must not be logged as the country that was served.
      let country: string | undefined = snapMatch ? undefined : (q.get("country") ?? undefined);
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
        country: countryLabel(country ?? seriesIdCountry(q.get("id"))),
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
  // HEAD must behave as GET-without-a-body. Rejecting it with 405 breaks every
  // generic HTTP client, link checker and cache warmer that probes with HEAD
  // before fetching, and a 405 carrying no Allow header does not even tell them
  // what to use instead.
  const isHead = request.method === "HEAD";
  if (request.method !== "GET" && !isHead) {
    return json405("Only GET and HEAD are supported on /v1 endpoints (POST is accepted on /v1/verify_claims only).", "GET, HEAD, OPTIONS");
  }

  const q = url.searchParams;

  try {
    // One length cap for every query value and path parameter, the same 200
    // characters MCP applies to its string arguments. Without it a REST caller
    // could send a long country or query straight into the name matchers and
    // the caribstat row parser, which cost far more CPU than the plan allows.
    for (const [k, v] of q) {
      if (v.length > MAX_STR_LEN) {
        throw new ParamError(`Query parameter '${quoteInput(k, 40)}' is ${v.length} characters long. The limit is ${MAX_STR_LEN}.`);
      }
      if (k.length > 64) {
        throw new ParamError(`A query parameter name is ${k.length} characters long. No parameter name is longer than 64.`);
      }
    }
    const pathParam = path.match(/^\/v1\/(?:indicator|snapshot)\/([^/]+)$/)?.[1];
    if (pathParam !== undefined && pathParam.length > MAX_STR_LEN) {
      throw new ParamError(`The path parameter is ${pathParam.length} characters long. The limit is ${MAX_STR_LEN}.`);
    }

    if (path === "/v1" || path === "/v1/index") {
      return json(200, {
        service: "StatCite",
        version: SERVER_VERSION,
        description: "Official economic statistics with full citations, for AI agents and humans.",
        mcp_endpoint: `${ctx.baseUrl}/mcp`,
        openapi: `${ctx.baseUrl}/openapi.json`,
        docs: `${ctx.baseUrl}/docs`,
        endpoints: [
          "/v1/indicators",
          "/v1/indicator/{key}?country=BRB&start_year=2015&end_year=2025&transform=none|yoy|pct_change|index&latest_only=true",
          "/v1/series?id=worldbank/NY.GDP.MKTP.KD.ZG&country=USA",
          "/v1/series?id=caribstat/ECCB/total-public-sector-debt/AIA.a (regional central bank series; ECCB geographies and Barbados)",
          "/v1/search?q=government+debt",
          "/v1/snapshot/{country}",
          "/v1/verify?indicator=inflation_cpi&country=BRB&period=2024&value=1.4",
          "/v1/verify_claims (POST, JSON body { claims: [{ indicator, country, period, claimed_value }] }, max 15 claims)",
          "/v1/inflation?amount=100&from_year=1995&to_year=2024&country=USA",
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
      rejectUnknownParams(q, ["indicator", "country", "period"]);
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
      const probes: Record<string, { ok: boolean; ms: number | null; cached: boolean }> = {};
      // `cached` is not decoration. A probe served from the 120s cache measures
      // ~0ms and returns ok:true without contacting the upstream at all, so
      // without this field the status page reports five green sources with
      // ms:0 as though it had just checked them. A health page must never
      // assert freshness it did not observe: a cached probe reports ms:null.
      const probe = async (name: string, url: string, fn: () => Promise<boolean>) => {
        const cached = isMemCached(url);
        const t0 = Date.now();
        try {
          probes[name] = { ok: await fn(), ms: cached ? null : Date.now() - t0, cached };
        } catch {
          probes[name] = { ok: false, ms: cached ? null : Date.now() - t0, cached };
        }
      };
      await Promise.all([
        probe("worldbank", "https://api.worldbank.org/v2/country/USA?format=json", async () => {
          await fetchJson("https://api.worldbank.org/v2/country/USA?format=json", { ttlSeconds: 120, timeoutMs: 5000 });
          return true;
        }),
        probe("imf_datamapper", "https://www.imf.org/external/datamapper/api/v1/regions", async () => {
          await fetchJson("https://www.imf.org/external/datamapper/api/v1/regions", { ttlSeconds: 120, timeoutMs: 5000 });
          return true;
        }),
        probe("dbnomics", "https://api.db.nomics.world/v22/datasets/IMF/WEO:latest?limit=1", async () => {
          await fetchJson("https://api.db.nomics.world/v22/datasets/IMF/WEO:latest?limit=1", { ttlSeconds: 120, timeoutMs: 5000 });
          return true;
        }),
        probe("bis", "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.US?lastNObservations=1&format=sdmx-json", async () => {
          // NEVER probe BIS with HEAD: it returns 500 to HEAD on URLs that
          // serve 200 to GET (verified 2026-08-08). And BIS content-negotiates
          // JSON only via the vendor media type — a plain Accept yields XML,
          // so a naive probe would report a false outage.
          await fetchJson("https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.US?lastNObservations=1&format=sdmx-json", {
            ttlSeconds: 120,
            timeoutMs: 5000,
            accept: "application/vnd.sdmx.data+json",
          });
          return true;
        }),
        probe("ecb_data", "https://data-api.ecb.europa.eu/service/data/HICP/M.U2.N.000000.4D0.ANR?format=jsondata&lastNObservations=1", async () => {
          await fetchJson("https://data-api.ecb.europa.eu/service/data/HICP/M.U2.N.000000.4D0.ANR?format=jsondata&lastNObservations=1", {
            ttlSeconds: 120,
            timeoutMs: 5000,
          });
          return true;
        }),
        // fx_convert's live upstream. Deliberately /latest rather than
        // /currencies, which the adapter caches for a day: a probe that always
        // reports cached:true measures nothing.
        probe("ecb_fx", "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD", async () => {
          await fetchJson("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD", { ttlSeconds: 120, timeoutMs: 5000 });
          return true;
        }),
        // Every caribstat/ series, which is the only coverage for Anguilla and
        // Montserrat. The URL is built by the adapter's own helpers so a corpus
        // reshuffle cannot turn this red by itself.
        probe("caribstat", caribstatUrl(parseCaribstatId("caribstat/ECCB/consumer-price-index/AIA.a")), async () => {
          await fetchJson(caribstatUrl(parseCaribstatId("caribstat/ECCB/consumer-price-index/AIA.a")), { ttlSeconds: 120, timeoutMs: 5000 });
          return true;
        }),
      ]);
      const allOk = Object.values(probes).every((p) => p.ok);
      return json(200, {
        service: "StatCite",
        version: SERVER_VERSION,
        status: allOk ? "ok" : "degraded",
        upstreams: probes,
        note: "Upstream probes are cached ~120s and a cached probe reports ms:null with cached:true, so a green row is never mistaken for a fresh measurement. Each hits the cheapest real endpoint for that source (never HEAD, BIS 500s on HEAD). 'degraded' means at least one of the seven probed upstreams is unreachable right now: the World Bank, IMF DataMapper, DBnomics, BIS, the ECB Data Portal, ECB reference rates via Frankfurter (fx_convert), and the CaribStat origin serving the ECCB and Central Bank of Barbados series. The dated-WEO-vintage endpoint used only by as_of and the revision probe is not measured here. Fallback chains may still serve affected indicators, with fallback_used disclosed per response.",
      }, 120);
    }

    const indMatch = indicatorPathKey(path);
    if (indMatch) {
      rejectUnknownParams(q, ["country", "latest_only", "start_year", "end_year", "transform", "strict_source"]);
      const country = q.get("country");
      if (!country) return errJson(400, "Query parameter 'country' is required (ISO3 code or name).");
      const latestOnly = qBool(q, "latest_only");
      const result = await getIndicator(ctx, indMatch[1], country, {
        start: qYear(q, "start_year"),
        end: qYear(q, "end_year"),
        transform: parseTransform(q.get("transform")),
        limit: latestOnly ? 1 : 80,
        strictSource: qBool(q, "strict_source"),
      });
      // A fallback-sourced response must not linger in shared caches: once the
      // primary recovers, the same URL should serve the primary's value again.
      return json(200, result, result.fallback_used ? 0 : 3600);
    }

    if (path === "/v1/series") {
      rejectUnknownParams(q, ["id", "country", "row", "latest_only", "start_year", "end_year", "transform", "strict_source"]);
      const idParam = q.get("id");
      if (!idParam) return errJson(400, "Query parameter 'id' is required, e.g. id=worldbank/NY.GDP.MKTP.KD.ZG.");
      // A caribstat row selector is written '#Row Label'. In a URL a raw '#'
      // starts a fragment and never reaches the server, so a caller following
      // StatCite's own pointer silently got the table's first row instead. 'row'
      // is the fragment-free spelling; '%23' still works.
      const row = q.get("row");
      let id = idParam;
      if (row !== null) {
        if (!idParam.startsWith("caribstat/")) {
          return errJson(400, `'row' selects a row inside a caribstat table and does not apply to '${quoteInput(idParam, 80)}'. Drop it, or use a caribstat/ id.`);
        }
        if (idParam.includes("#")) {
          return errJson(400, "The row is given twice: once in the id after '#' and once as 'row'. Send one spelling, not both.");
        }
        id = `${idParam}#${row}`;
      }
      const result = await getSeries(ctx, id, {
        country: q.get("country") ?? undefined,
        start: qYear(q, "start_year"),
        end: qYear(q, "end_year"),
        transform: parseTransform(q.get("transform")),
        limit: qBool(q, "latest_only") ? 1 : 120,
        strictSource: qBool(q, "strict_source"),
      });
      return json(200, result, result.fallback_used ? 0 : 3600);
    }

    if (path === "/v1/search") {
      rejectUnknownParams(q, ["q"]);
      const query = q.get("q");
      if (!query) return errJson(400, "Query parameter 'q' is required.");
      const found = await searchIndicators(ctx, query);
      return json(200, {
        query,
        results: found.results,
        total_indicator_matches: found.total_indicator_matches,
        truncated: found.truncated,
        ...(found.truncated
          ? { note: `Showing the top ${found.results.filter((r) => r.type === "indicator").length} of ${found.total_indicator_matches} matching registry indicators. GET /v1/indicators returns the complete registry (48 keys, 42 active) in one 14 KB response.` }
          : {}),
      });
    }

    const snapMatch = path.match(/^\/v1\/snapshot\/([^/]+)$/);
    if (snapMatch) {
      let snapCountry: string;
      try {
        snapCountry = decodeURIComponent(snapMatch[1]);
      } catch {
        // A malformed percent escape used to reach decodeURIComponent unguarded
        // and surface as a 500.
        throw new ParamError(`The country in /v1/snapshot/{country} is not valid percent-encoding: '${quoteInput(snapMatch[1], 60)}'.`);
      }
      const snapshot = await countrySnapshot(ctx, snapCountry);
      // Same rule as /v1/indicator: a fallback-sourced number must not linger in
      // shared caches after the primary source recovers.
      return json(200, snapshot, snapshot.fallback_used ? 0 : 3600);
    }

    if (path === "/v1/verify") {
      rejectUnknownParams(q, VERIFY_PARAMS);
      const indicator = q.get("indicator");
      const period = q.get("period");
      if (!indicator || !period) {
        return errJson(400, "Required: indicator, period, value. Optional: country, tolerance_abs, tolerance_pct, strict_source, as_of.");
      }
      // `claimed_value` is what verify_claims and the verify_stat MCP tool both
      // require, and it is the name this endpoint returns in its OWN response
      // body, so without the alias /v1/verify cannot round-trip its own output.
      if (q.has("value") && q.has("claimed_value")) {
        // Taking one and dropping the other would judge a number the caller
        // may not have meant. Refuse, as for any other ambiguous input.
        return errJson(400, "Send value or claimed_value, not both. They are the same parameter.");
      }
      const valueParam = q.has("value") ? "value" : "claimed_value";
      const result = await verifyStat(ctx, {
        indicator,
        country: q.get("country") ?? undefined,
        period,
        claimed_value: qNum(q, valueParam, true)!,
        tolerance_abs: qNum(q, "tolerance_abs", false),
        tolerance_pct: qNum(q, "tolerance_pct", false),
        // qBool, not `=== "true"`: strict_source=1 read as false does not fail,
        // it silently downgrades a reproducibility guarantee the caller asked
        // for. This route was the last one still using the raw comparison.
        strict_source: qBool(q, "strict_source"),
        as_of: q.get("as_of") ?? undefined,
      });
      usage.verdict = result.verdict;
      return json(200, result, result.fallback_used ? 0 : 1800);
    }

    if (path === "/v1/inflation") {
      rejectUnknownParams(q, ["amount", "from_year", "to_year", "country"]);
      return json(
        200,
        await inflationAdjust(ctx, qNum(q, "amount", true)!, qNum(q, "from_year", true)!, qNum(q, "to_year", true)!, q.get("country") ?? "USA"),
      );
    }

    if (path === "/v1/fx") {
      rejectUnknownParams(q, ["amount", "from", "to", "date"]);
      const from = q.get("from");
      const to = q.get("to");
      if (!from || !to) return errJson(400, "Required: amount, from, to. Optional: date (YYYY-MM-DD or YYYY).");
      // A future date is the CALLER's error, not an upstream outage. Letting it
      // through produced a 502 "Upstream data source problem", which blames the
      // ECB for a request it was never going to be able to answer and tells the
      // caller to retry something that can never succeed.
      const fxDate = q.get("date");
      if (fxDate) {
        const year = Number(fxDate.slice(0, 4));
        const thisYear = new Date().getUTCFullYear();
        if (Number.isFinite(year) && year > thisYear) {
          return errJson(422, `ECB reference rates are only published up to the present day; '${fxDate}' is in the future.`);
        }
      }
      return json(200, await fxConvert(ctx, qNum(q, "amount", true)!, from, to, q.get("date") ?? undefined), 1800);
    }

    if (path === "/v1/sources") {
      return json(200, { sources: SOURCES }, 86400);
    }

    return errJson(404, `Unknown endpoint '${path}'. See ${ctx.baseUrl}/v1 for the endpoint list.`);
  } catch (e) {
    if (e instanceof ParamError) return errJson(400, e.message);
    if (e instanceof ToolError) return errJson(422, e.message, e.details, toolErrorCode(e));
    if (e instanceof UpstreamError) return errJson(502, `Upstream data source problem: ${e.message}`, { upstream_url: e.url });
    // Log the closed-set op name, not the raw path: /v1/snapshot/{country}
    // carries arbitrary user text in the path segment, and privacy.html
    // promises free-text input is never retained.
    console.error("rest crash", restOp(path), e);
    return errJson(500, "Internal error. Please retry; if persistent, report an issue.");
  }
}

async function verifyClaimsRoute(request: Request, ctx: Ctx): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "POST") {
    return json405(
      'Use POST for /v1/verify_claims with a JSON body: { "claims": [{ "indicator": "inflation_cpi", "country": "BRB", "period": "2024", "claimed_value": 1.4 }] } (1–15 claims per call).',
      "POST, OPTIONS",
    );
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/\bapplication\/json\b/i.test(contentType)) {
    return errJson(415, `Set 'content-type: application/json' and send a JSON body: { "claims": [...] } (got '${contentType ? quoteInput(contentType, 60) : "no content-type"}').`);
  }
  // Capped read: the body used to be buffered in full, whatever its size,
  // before any limit applied.
  const read = await readBodyCapped(request);
  if (!read.ok) {
    return errJson(413, `The request body is over ${MAX_BODY_BYTES} bytes. A verify_claims call takes at most 15 claims, which is a few KB.`, undefined, "invalid_body");
  }
  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return errJson(422, 'Malformed JSON body. Send: { "claims": [{ "indicator": ..., "country": ..., "period": ..., "claimed_value": ... }] }.', undefined, "invalid_body");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return errJson(422, 'Body must be a JSON object with a \'claims\' array. Wrap the claims as { "claims": [...] }.', undefined, "invalid_body");
  }
  const b = body as Record<string, unknown>;
  // The same refusal the claim objects and the GET routes apply. A dropped
  // top-level key, or strict_source sent as the string "true", used to change
  // the result without any sign that it had.
  const BODY_KEYS = ["claims", "strict_source"];
  const unknownTop = Object.keys(b).filter((k) => !BODY_KEYS.includes(k));
  if (unknownTop.length) {
    const more = unknownTop.slice(1);
    return errJson(
      400,
      `Unknown body key '${quoteInput(unknownTop[0], 64)}'.` +
        (more.length ? ` Also unknown: ${more.slice(0, 5).map((k) => quoteInput(k, 40)).join(", ")}${more.length > 5 ? ` and ${more.length - 5} more` : ""}.` : "") +
        " The body accepts: claims, strict_source. Per-claim settings such as tolerance_abs go inside each claim object.",
      { unknown_keys: unknownTop.slice(0, 10).map((k) => quoteInput(k, 64)), unknown_count: unknownTop.length, accepted_keys: BODY_KEYS },
      "invalid_body",
    );
  }
  if (b.strict_source != null && typeof b.strict_source !== "boolean") {
    return errJson(400, `'strict_source' must be a JSON boolean, true or false, not ${quoteInput(JSON.stringify(b.strict_source), 40)}.`);
  }
  try {
    return json(200, await runVerifyClaims(ctx, b.claims, b.strict_source === true), 0);
  } catch (e) {
    if (e instanceof ToolError) return errJson(422, e.message, e.details, toolErrorCode(e));
    if (e instanceof UpstreamError) return errJson(502, `Upstream data source problem: ${e.message}`, { upstream_url: e.url });
    console.error("rest crash", "/v1/verify_claims", e);
    return errJson(500, "Internal error. Please retry; if persistent, report an issue.");
  }
}
