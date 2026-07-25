// Upstream fetch with layered caching (per-isolate memory + Cloudflare edge cache),
// timeouts, one retry, and a polite user agent.

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

async function doFetch(url: string, timeoutMs: number, ttlSeconds: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      redirect: "follow",
      signal: controller.signal,
      // Cloudflare edge cache for upstream GETs (effective on custom domains; ignored elsewhere).
      cf: { cacheTtl: ttlSeconds, cacheEverything: true },
    } as RequestInit);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch JSON with caching. ttlSeconds controls both the memory cache and the
 * edge cache hint. Retries once on transient failures.
 */
export async function fetchJson(
  url: string,
  { ttlSeconds = 21600, timeoutMs = 8000 }: { ttlSeconds?: number; timeoutMs?: number } = {},
): Promise<unknown> {
  const hit = mem.get(url);
  const now = Date.now();
  if (hit && hit.exp > now) return hit.data;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await doFetch(url, timeoutMs, ttlSeconds);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(`Upstream returned HTTP ${res.status}`, url, res.status);
        await res.body?.cancel();
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new UpstreamError(`Upstream returned HTTP ${res.status}: ${body}`, url, res.status);
      }
      const data = (await res.json()) as unknown;
      if (mem.size >= MEM_MAX) {
        const first = mem.keys().next().value;
        if (first !== undefined) mem.delete(first);
      }
      mem.set(url, { exp: now + ttlSeconds * 1000, data });
      return data;
    } catch (e) {
      lastErr = e;
      if (e instanceof UpstreamError && e.status && e.status < 500 && e.status !== 429) throw e;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
    }
  }
  if (lastErr instanceof Error) {
    throw lastErr instanceof UpstreamError
      ? lastErr
      : new UpstreamError(`Failed to reach upstream: ${lastErr.message}`, url);
  }
  throw new UpstreamError("Failed to reach upstream", url);
}

/** Test hook: clear the per-isolate memory cache. */
export function _clearMemCache(): void {
  mem.clear();
}
