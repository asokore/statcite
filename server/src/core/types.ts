// Shared types for the StatCite core.

export interface Ctx {
  /** Public base URL of this deployment (for self-links in docs/errors). */
  baseUrl: string;
  /** INERT: FRED is permanently disabled (adapters/fred.ts declines regardless of
   * any configured key — its ToU prohibit AI/ML use and caching/redistribution,
   * v1.3.2). Field kept only so deployments with the old secret still bound don't
   * break; nothing reads it to enable anything. */
  fredApiKey?: string;
  /** Injected clock for testability. */
  now?: () => Date;
  /**
   * Optional aggregate usage sink (Workers Analytics Engine binding).
   * Structural type so core/ stays free of Workers imports. Carries only
   * aggregate, non-identifying fields — see core/analytics.ts.
   */
  analytics?: { writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void };
  /**
   * Internal, adapter-owned: per-request memo for IMF DataMapper fetches (values +
   * metadata), keyed by URL, storing the in-flight/settled promise — including
   * rejections. Lazily created by adapters/datamapper.ts. Scope is one HTTP
   * request (Ctx is created once per request and, for MCP JSON-RPC batches,
   * shared across every message in that batch) — never the isolate. Without
   * this, concurrent callers sharing one Ctx (verify_claims' 4-way concurrency)
   * would each independently retry the same failing DataMapper URL.
   */
  _dmMemo?: Map<string, Promise<unknown>>;
}

export interface Observation {
  /** Period label: "2024", "2024Q1", or "2024-05" / "2024-05-01" depending on frequency. */
  period: string;
  value: number | null;
  note?: string;
}

/**
 * The StatCite citation object. Every numeric payload ships one of these.
 * Fields are stable API surface — agents rely on them for report citations.
 */
export interface Citation {
  source: string;
  dataset: string;
  series_id: string;
  series_name: string;
  /** Canonical human-facing URL for the series at the source. */
  source_url: string;
  /** The API call that produced the data (reproducibility). */
  api_url?: string;
  license: string;
  /** Attribution line required or recommended by the source's terms. */
  attribution: string;
  /** ISO timestamp when StatCite retrieved the data from the source. */
  retrieved_at: string;
  /** Ready-to-paste citation sentence. */
  citation_text: string;
  /** Extra source-mandated notices (e.g. the FRED endorsement disclaimer). */
  notices?: string[];
}

export interface SeriesResult {
  series_id: string;
  name: string;
  country?: { iso3: string; name: string };
  unit?: string;
  frequency?: string;
  observations: Observation[];
  citation: Citation;
  notes: string[];
  /** Present and true when the primary source failed and a fallback source served
   * this result — the value may reflect a different statistical definition than the
   * primary would have returned. Absent on primary-source responses. */
  fallback_used?: boolean;
  /** Why the fallback served: "transient" — the primary errored and may recover
   * (same query can return a different source/value later); "definitive" — the
   * primary permanently lacks this series/country (e.g. Taiwan in WDI), making the
   * fallback the stable de-facto source. verify_stat demotes transient-fallback
   * verdicts to cannot_verify but judges definitive-fallback ones normally. */
  fallback_reason?: "transient" | "definitive";
}

export type IndicatorKind =
  | "percent" // shares & rates expressed in % (inflation, unemployment, % of GDP)
  | "level" // counts and currency levels (GDP in USD, population)
  | "index" // index numbers (CPI index)
  | "years" // life expectancy
  | "rate"; // exchange-rate style values

export interface IndicatorDef {
  key: string;
  label: string;
  unit: string;
  kind: IndicatorKind;
  /** World Bank WDI indicator code (primary source when present). */
  wb?: string;
  /** DBnomics fallback/primary: [provider, dataset, seriesCodeTemplate] where {ISO3} is substituted. */
  dbnomics?: [string, string, string];
  /** IMF DataMapper primary (current-vintage WEO/Fiscal Monitor): [code, dataset]. */
  datamapper?: [string, "WEO" | "FM"];
  /** FRED series id for a US high-frequency variant — INERT: FRED is permanently
   * disabled (its terms prohibit AI/ML use and caching/redistribution, v1.3.2).
   * Kept so the six US-only keys stay recognized and decline with an explanation
   * instead of 404ing; never re-enable without re-reading the current FRED ToU. */
  fred?: string;
  /** The source publishes this series as a MODELED estimate (e.g. the World
   * Bank's ILO-modeled unemployment series) — a published figure, but a model
   * output, not a measured outturn. Drives observation_status "modeled_estimate"
   * in verify results (v1.4.1) so "actual" is never claimed for it. */
  modeled?: boolean;
  synonyms: string[];
  notes?: string;
}

/** Error meant to surface to the calling agent as a helpful tool error (not a crash). */
export class ToolError extends Error {
  details?: Record<string, unknown>;
  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ToolError";
    this.details = details;
  }
}

export function nowIso(ctx: Ctx): string {
  return (ctx.now ? ctx.now() : new Date()).toISOString();
}

export function today(ctx: Ctx): string {
  return nowIso(ctx).slice(0, 10);
}
