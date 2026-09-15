// Upstream fetch with layered caching (per-isolate memory + Cloudflare edge cache),
// timeouts, retries, and a polite user agent.

import { ToolError } from "./types.ts";

const USER_AGENT = "StatCite/1.0 (+https://statcite.com; data API for AI agents)";

interface MemEntry {
  exp: number;
  data: unknown;
  bytes: number;
}
const mem = new Map<string, MemEntry>();
const MEM_MAX = 400;
// Entries are also bounded by size. A count alone let attacker-chosen URLs pin
// up to 400 large bodies in one isolate. Measured 2026-09-15: the largest
// legitimate upstream body is a 951 KB Central Bank of Barbados trade table.
const MEM_BYTES_MAX = 32 * 1024 * 1024;
const MEM_ENTRY_BYTES_MAX = 2 * 1024 * 1024;
let memBytes = 0;

/** Largest upstream response body read, in bytes. A body past this aborts. */
export const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;

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

function doFetch(url: string, signal: AbortSignal, ttlSeconds: number, accept?: string): Promise<Response> {
  return fetch(url, {
    // `accept` is overridable because some official APIs content-negotiate
    // JSON only via a vendor media type: BIS returns SDMX **XML** for a plain
    // `application/json` Accept, and 200-with-XML is a silent-corruption
    // class, not an error class.
    headers: { "user-agent": USER_AGENT, accept: accept ?? "application/json" },
    redirect: "follow",
    signal,
    // Cloudflare edge cache for upstream GETs (effective on custom domains; ignored elsewhere).
    cf: { cacheTtl: ttlSeconds, cacheEverything: true },
  } as RequestInit);
}

/**
 * Read a response body as text, refusing to buffer more than maxBytes.
 * Content-Length is checked first when present, but it can be missing or give
 * the compressed size, so the counting reader is what actually enforces it.
 */
async function readCapped(res: Response, maxBytes: number, url: string): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new UpstreamError(`Upstream response too large (${declared} bytes, limit ${maxBytes})`, url, res.status);
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UpstreamError(`Upstream response too large (over ${maxBytes} bytes)`, url, res.status);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/** A short, safe excerpt of an upstream error body for the error message:
 * plain text only, control characters removed, at most 120 characters. JSON
 * and HTML bodies are dropped, because an agent reads this message and raw
 * third-party markup is neither useful nor safe to reflect. */
function errorSnippet(body: string): string {
  const t = body.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
  if (!t || /^[<{[]/.test(t)) return "";
  return t.length > 120 ? t.slice(0, 117) + "..." : t;
}

function memPut(url: string, entry: MemEntry): void {
  if (entry.bytes > MEM_ENTRY_BYTES_MAX) return;
  const old = mem.get(url);
  if (old) {
    memBytes -= old.bytes;
    mem.delete(url);
  }
  while (mem.size > 0 && (mem.size >= MEM_MAX || memBytes + entry.bytes > MEM_BYTES_MAX)) {
    const first = mem.keys().next().value;
    if (first === undefined) break;
    memBytes -= mem.get(first)?.bytes ?? 0;
    mem.delete(first);
  }
  mem.set(url, entry);
  memBytes += entry.bytes;
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
/**
 * Is this URL already in the in-memory cache and still fresh?
 *
 * Exists for /v1/status. A probe wrapped around a cached fetchJson measures
 * ~0ms and reports ok:true without touching the upstream, so the status page
 * was reporting five green upstreams with ms:0 as though it had just checked
 * them. That is a health page asserting health it did not observe.
 */
export function isMemCached(url: string): boolean {
  const hit = mem.get(url);
  return !!hit && hit.exp > Date.now();
}

export async function fetchJson(
  url: string,
  {
    ttlSeconds = 21600,
    timeoutMs = 8000,
    validate,
    accept,
    maxBytes = MAX_UPSTREAM_BYTES,
  }: { ttlSeconds?: number; timeoutMs?: number; validate?: (data: unknown) => boolean; accept?: string; maxBytes?: number } = {},
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
    // The timer covers the whole attempt, body read included. It used to be
    // cleared as soon as headers arrived, so a slow or endless body had no
    // deadline at all.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, controller.signal, ttlSeconds, accept);
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
        let snippet = "";
        try {
          snippet = errorSnippet(await readCapped(res, 1024, url));
        } catch {
          // an oversized error body is not worth reporting
        }
        throw new UpstreamError(`Upstream returned HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`, url, res.status);
      }
      const text = await readCapped(res, maxBytes, url);
      const data = JSON.parse(text) as unknown;
      if (validate && !validate(data)) {
        lastErr = new ShapeError("Upstream returned a response that failed shape validation", url);
        if (!isLastAttempt) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw lastErr;
      }
      memPut(url, { exp: now + ttlSeconds * 1000, data, bytes: text.length });
      return data;
    } catch (e) {
      lastErr = e;
      if (e instanceof UpstreamError && e.status && e.status < 500 && e.status !== 429) throw e;
      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
    } finally {
      clearTimeout(timer);
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
  memBytes = 0;
}

/** Test hook: current memory cache size in entries and approximate bytes. */
export function _memCacheStats(): { entries: number; bytes: number } {
  return { entries: mem.size, bytes: memBytes };
}
