// Upstream fetch with layered caching (per-isolate memory + Cloudflare edge cache),
// timeouts, retries, and a polite user agent.

import { ToolError } from "./types.ts";

const USER_AGENT = "StatCite/1.0 (+https://statcite.com; data API for AI agents)";

interface MemEntry {
  exp: number;
  data: unknown;
}
const mem = new Map<string, MemEntry>();
const MEM_MAX = 400;

/** Strip secrets from URLs before they can appear in any error/response path. */
export function redactUrl(url: string): string {
  return url.replace(/api_key=[^&]+/gi, "api_key=REDACTED");
}

export class UpstreamError extends Error {
  status?: number;
  url: string;
  constructor(message: string, url: string, status?: number) {
    super(redactUrl(message));
    this.name = "UpstreamError";
    this.url = redactUrl(url);
    this.status = status;
  }
}

async function doFetch(url: string, timeoutMs: number, ttlSeconds: number, accept?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      // `accept` is overridable because some official APIs content-negotiate
      // JSON only via a vendor media type: BIS returns SDMX **XML** for a plain
      // `application/json` Accept, and 200-with-XML is a silent-corruption
      // class, not an error class.
      headers: { "user-agent": USER_AGENT, accept: accept ?? "application/json" },
      redirect: "follow",
      signal: controller.signal,
      // Cloudflare edge cache for upstream GETs (effective on custom domains; ignored elsewhere).
      cf: { cacheTtl: ttlSeconds, cacheEverything: true },
    } as RequestInit);
  } finally {
    clearTimeout(timer);
  }
}

// Backoff schedule for retryable failures (429/5xx/network-level errors — timeouts,
// aborts, DNS/connection resets). A single 300ms retry only survives a sub-second
// blip; a real upstream wobble (rolling restarts, rate-limit windows) can last
// several seconds, and giving up too early routes the caller into series.ts's
// source fallback — which for indicators with a non-identical fallback source
// (e.g. World Bank WDI vs IMF WEO) silently swaps in a different statistical
// concept, not just a slower copy of the same number. Three attempts with rising
// backoff makes that misfire meaningfully less likely without materially
// changing latency on the common (first-attempt-succeeds) path.
const RETRY_DELAYS_MS = [300, 900];

/** Thrown by fetchJson when a `validate` hook rejects an otherwise-2xx, parseable
 * body — e.g. an API that returns HTTP 200 for both real data and decoy/error
 * envelopes (see adapters/datamapper.ts). Distinct from UpstreamError so callers
 * can tell "the shape was wrong" apart from "the transport/status failed." */
export class ShapeError extends Error {
  url: string;
  constructor(message: string, url: string) {
    super(redactUrl(message));
    this.name = "ShapeError";
    this.url = redactUrl(url);
  }
}

/**
 * Fetch JSON with caching. ttlSeconds controls both the memory cache and the
 * edge cache hint. Retries on transient failures per RETRY_DELAYS_MS; a definitive
 * client error (4xx other than 429) fails immediately, never retried.
 *
 * `validate`, when given, is checked on every parsed 2xx body BEFORE it is
 * written to the cache — a body that fails validation is never cached (an API
 * that returns 200 for decoy/error envelopes must not poison the cache for
 * ttlSeconds with garbage). Validation failures are retried on the same
 * schedule as a 5xx, then surfaced as ShapeError so the caller can classify
 * "parseable but wrong shape" separately from a transport failure.
 */
export async function fetchJson(
  url: string,
  {
    ttlSeconds = 21600,
    timeoutMs = 8000,
    validate,
    accept,
  }: { ttlSeconds?: number; timeoutMs?: number; validate?: (data: unknown) => boolean; accept?: string } = {},
): Promise<unknown> {
  const hit = mem.get(url);
  const now = Date.now();
  // Re-validate on cache read, not only on write: today every URL with a
  // validate hook has exactly one call site, but the "never serve an
  // unvalidated body" guarantee must hold structurally, not by call-site
  // discipline — a future hookless caller for the same URL would otherwise
  // let an unvalidated body be served to a strict caller from cache.
  if (hit && hit.exp > now && (!validate || validate(hit.data))) return hit.data;

  let lastErr: unknown;
  const maxAttempts = RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1;
    try {
      const res = await doFetch(url, timeoutMs, ttlSeconds, accept);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(`Upstream returned HTTP ${res.status}`, url, res.status);
        await res.body?.cancel();
        if (!isLastAttempt) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new UpstreamError(`Upstream returned HTTP ${res.status}: ${body}`, url, res.status);
      }
      const data = (await res.json()) as unknown;
      if (validate && !validate(data)) {
        lastErr = new ShapeError("Upstream returned a response that failed shape validation", url);
        if (!isLastAttempt) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw lastErr;
      }
      if (mem.size >= MEM_MAX) {
        const first = mem.keys().next().value;
        if (first !== undefined) mem.delete(first);
      }
      mem.set(url, { exp: now + ttlSeconds * 1000, data });
      return data;
    } catch (e) {
      lastErr = e;
      if (e instanceof UpstreamError && e.status && e.status < 500 && e.status !== 429) throw e;
      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
    }
  }
  if (lastErr instanceof ShapeError) throw lastErr;
  if (lastErr instanceof Error) {
    throw lastErr instanceof UpstreamError
      ? lastErr
      : new UpstreamError(`Failed to reach upstream: ${lastErr.message}`, url);
  }
  throw new UpstreamError("Failed to reach upstream", url);
}

/**
 * Request-scoped fetch memo: dedupes identical concurrent fetches AND memoizes
 * rejections for the life of the request. Without this, N concurrent callers
 * sharing one Ctx (e.g. verify_claims' 4-way concurrency) each independently
 * retry the same failing URL, multiplying an outage's subrequest cost by N.
 * Callers own the Map (typically stashed on Ctx) so scope matches one HTTP
 * request, never the isolate.
 */
export function memoFetchJson(
  memo: Map<string, Promise<unknown>>,
  url: string,
  opts?: { ttlSeconds?: number; timeoutMs?: number; validate?: (data: unknown) => boolean },
): Promise<unknown> {
  let p = memo.get(url);
  if (!p) {
    p = fetchJson(url, opts);
    memo.set(url, p);
  }
  return p;
}

/** True for failure classes that are plausibly transient (worth flagging as such
 * in a fallback disclosure) rather than a definitive "this data doesn't exist". */
export function isTransientUpstreamError(e: unknown): boolean {
  if (e instanceof ToolError) return false; // adapter-level "no data for this query" — definitive
  if (e instanceof UpstreamError) {
    if (e.status === 429 || (e.status && e.status >= 500)) return true;
    if (e.status === undefined) return true; // network/timeout failure, no HTTP status at all
    return false; // a definitive 4xx (other than 429)
  }
  return true; // unexpected exception shape (e.g. a raw parse error) — treat as transient
}

/** Test hook: clear the per-isolate memory cache. */
export function _clearMemCache(): void {
  mem.clear();
}
