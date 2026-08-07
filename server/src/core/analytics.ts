// Usage analytics — aggregate-only, privacy-clean, zero runtime dependencies.
//
// WHY: BRIEF.md §7 — "you can't see which tools are called or which indicators
// matter. That's the feedback loop the whole strategy depends on."
//
// WHAT IS RECORDED (and nothing else):
//   transport (mcp|rest) · op (tool/endpoint name) · indicator key · country ISO3
//   · verify verdict kind · outcome · duration (ms + bucket)
//
// WHAT IS NEVER RECORDED: IP, user agent, headers, session/id, full query
// strings, free-text search queries, claimed values, or anything else that
// could identify a caller. site/privacy.html promises no profiling and no
// personal data; that promise is enforced here structurally — every string
// written is drawn from a CLOSED SET (a registry indicator key, a known ISO3
// code, a fixed enum) rather than passed through from the request. Hostile or
// personal input degrades to "other"/"" instead of being stored.
//
// SINKS (both free on the Workers free plan):
//   1. Workers Analytics Engine, binding STATCITE_USAGE — free plan includes
//      100,000 data points written/day and 10,000 read queries/day; retention
//      3 months. Optional: an absent binding (local dev, tests) is a no-op.
//   2. A structured console line `STATCITE_USAGE {json}` captured by Workers
//      observability (already enabled in wrangler.jsonc), readable with
//      `wrangler tail`. Costs nothing and works with no extra setup.
//
// CONTRACT: recordUsage() NEVER throws and never awaits. A broken sink, a
// malformed event, or a missing binding must not affect the response path.

import { getIndicatorDef } from "./indicators.ts";
import { resolveCountry } from "./countries.ts";

/** Structural shape of a Workers Analytics Engine dataset binding. */
export interface UsageSink {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

export type Transport = "mcp" | "rest";

/** Outcome kinds — a closed set, never derived from user input. */
export type Outcome = "ok" | "tool_error" | "upstream_error" | "crash";

export interface UsageEvent {
  transport: Transport;
  /** Tool name (MCP) or REST endpoint name. From our own route table only. */
  op: string;
  /** Registry indicator key, "<provider>/*", "other", or undefined. */
  indicator?: string;
  /** ISO3 country code, or undefined. Never a raw user string. */
  country?: string;
  /** verify_stat verdict kind, or undefined. */
  verdict?: string;
  outcome: Outcome;
  durationMs: number;
}

const VERDICTS = new Set(["match", "close", "mismatch", "cannot_verify"]);
const OUTCOMES = new Set<string>(["ok", "tool_error", "upstream_error", "crash"]);
const SERIES_PROVIDERS = new Set(["worldbank", "dbnomics", "fred"]);

/** REST endpoint names — a closed set keyed off our own routing table. */
const REST_OPS = new Map<string, string>([
  ["/v1", "index"],
  ["/v1/index", "index"],
  ["/v1/indicators", "indicators"],
  ["/v1/series", "series"],
  ["/v1/search", "search"],
  ["/v1/verify", "verify"],
  ["/v1/inflation", "inflation"],
  ["/v1/fx", "fx"],
  ["/v1/sources", "sources"],
  ["/v1/status", "status"],
]);

/** Map a REST path to a stable op name. Unknown paths collapse to "unknown". */
export function restOp(path: string): string {
  const p = path.replace(/\/+$/, "") || "/v1";
  const known = REST_OPS.get(p);
  if (known) return known;
  if (/^\/v1\/indicator\/[a-z0-9_]+$/.test(p)) return "indicator";
  if (/^\/v1\/snapshot\/[^/]+$/.test(p)) return "snapshot";
  return "unknown";
}

/**
 * Indicator label. Registry keys pass through (they are public API and carry
 * the signal we want); explicit series ids collapse to their provider; anything
 * else — including free text a caller invented — becomes "other".
 */
export function indicatorLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s || s.length > 120) return "other";
  if (getIndicatorDef(s)) return s;
  const provider = s.split("/")[0]?.toLowerCase();
  if (provider && SERIES_PROVIDERS.has(provider)) return `${provider}/*`;
  return "other";
}

/**
 * Country label: resolved ISO3 only. Anything that does not resolve to a known
 * country is dropped, so a raw user string can never reach the sink.
 */
export function countryLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  // Cheap guard: real country inputs are short and alphabetic-ish. This also
  // stops long/hostile strings from entering the name matcher at all.
  if (s.length < 2 || s.length > 40 || !/^[A-Za-z0-9 .'()-]+$/.test(s)) return undefined;
  const c = resolveCountry(s, { strict: true });
  if (!c) return undefined;
  return /^[A-Z0-9]{2,3}$/.test(c.iso3) ? c.iso3 : undefined;
}

/** verify_stat verdict, restricted to the known verdict kinds. */
export function verdictLabel(raw: unknown): string | undefined {
  return typeof raw === "string" && VERDICTS.has(raw) ? raw : undefined;
}

/** Coarse latency bucket — keeps queries cheap and reveals nothing per-caller. */
export function durationBucket(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  if (ms < 50) return "lt50ms";
  if (ms < 200) return "lt200ms";
  if (ms < 500) return "lt500ms";
  if (ms < 1000) return "lt1s";
  if (ms < 3000) return "lt3s";
  return "gte3s";
}

function safeOp(raw: unknown): string {
  // op always originates in our own code; this is belt-and-braces so a future
  // call site cannot accidentally pipe user text into the index column.
  return typeof raw === "string" && /^[a-z0-9_]{1,40}$/.test(raw) ? raw : "unknown";
}

/**
 * The Analytics Engine schema. Positions are the schema — appending is safe,
 * reordering is not. Documented in docs/LAUNCH.md ("Reading usage analytics").
 *   index1 : op
 *   blob1..7 : transport, op, indicator, country, verdict, outcome, duration bucket
 *   double1..3 : count(=1), duration_ms, ok(1|0)
 */
export function buildDataPoint(ev: UsageEvent): { indexes: string[]; blobs: string[]; doubles: number[] } {
  const op = safeOp(ev.op);
  const transport = ev.transport === "rest" ? "rest" : "mcp";
  const outcome = OUTCOMES.has(ev.outcome) ? ev.outcome : "crash";
  const ms = Number.isFinite(ev.durationMs) && ev.durationMs >= 0 ? Math.round(ev.durationMs) : 0;
  return {
    indexes: [op],
    blobs: [
      transport,
      op,
      indicatorLabel(ev.indicator) ?? "",
      // No raw pass-through, even for short code-shaped strings: the closed-set
      // guarantee must hold inside this function, not by call-site discipline.
      // Callers already resolve through countryLabel, so anything it cannot
      // re-resolve here was never a recordable country to begin with.
      countryLabel(ev.country) ?? "",
      verdictLabel(ev.verdict) ?? "",
      outcome,
      durationBucket(ms),
    ],
    doubles: [1, ms, outcome === "ok" ? 1 : 0],
  };
}

/**
 * Record one usage event. Non-blocking, never throws.
 * `writeDataPoint` is fire-and-forget by design (no await, no waitUntil).
 */
export function recordUsage(sink: UsageSink | undefined, ev: UsageEvent): void {
  try {
    const dp = buildDataPoint(ev);
    if (sink) {
      try {
        sink.writeDataPoint(dp);
      } catch {
        // A failing analytics binding must never break a request.
      }
    }
    // Always emit the free, zero-setup line too (wrangler tail / Logs view).
    // console.error, not console.log: Workers captures both identically for
    // wrangler tail/Logs, but stdio MCP transports (e.g. server/src/stdio-entry.ts,
    // used by Glama's build-and-scan flow) require stdout to carry ONLY
    // JSON-RPC messages — a stray console.log line here breaks any real
    // line-oriented stdio client parsing every stdout line as a message.
    try {
      console.error(
        `STATCITE_USAGE ${JSON.stringify({
          transport: dp.blobs[0],
          op: dp.blobs[1],
          indicator: dp.blobs[2] || undefined,
          country: dp.blobs[3] || undefined,
          verdict: dp.blobs[4] || undefined,
          outcome: dp.blobs[5],
          bucket: dp.blobs[6],
          ms: dp.doubles[1],
        })}`,
      );
    } catch {
      // ignore
    }
  } catch {
    // Analytics is best-effort. Silence is correct here.
  }
}
