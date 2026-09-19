// Shared types for the StatCite core.

export interface Ctx {
  /** Which public surface is serving this request. Undefined means MCP, so any
   * caller that does not set it keeps the wording it has today. Read only by
   * message builders, so a body names a call the reader can actually make. */
  surface?: "mcp" | "rest";
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
  /** Failures per upstream host WITHIN one HTTP request, never the isolate.
   * verify_claims takes up to 15 claims and each can try three sources three
   * times, so one dead host used to cost dozens of subrequests against the
   * 50-subrequest ceiling and starve the claims that could have been answered. */
  _hostState?: Map<string, number>;
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
  /** Ready-to-paste reference-manager formats, derived from the fields above
   * (never independently authored, so they cannot disagree with them).
   * APA follows the dataset pattern with (n.d.) + retrieval date because the
   * underlying series are continuously updated works. Frozen API surface. */
  export_formats?: { bibtex: string; apa: string };
  /** Extra source-mandated notices (e.g. the FRED endorsement disclaimer). */
  notices?: string[];
}

export interface SeriesResult {
  series_id: string;
  name: string;
  country?: { iso3: string; name: string };
  /** null means no unit could be determined; an ABSENT key would be ambiguous. */
  unit?: string | null;
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
  /** Set when the PRIMARY source served a "latest" value whose period is far
   * behind the clock. It is a statement about the serving source's own horizon
   * and nothing else. It does not claim that any other source publishes a more
   * recent period, because sometimes none does: for several economies the whole
   * statistical record stops, and a flag that implied otherwise would be a
   * fabrication dressed as a disclosure. */
  stale_primary?: boolean;
  /** Clock year minus the served period's year. */
  stale_primary_years?: number;
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
  /** SDMX source (BIS policy rates, ECB monetary statistics). `key` may carry
   * an {ISO2} placeholder substituted with the resolved country's ISO2 code;
   * a key without it is a fixed single-series flow (e.g. euro-area HICP). */
  sdmx?: { provider: "BIS" | "ECB"; flow: string; key: string; sourceUrl: string };
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

/** Every error code StatCite returns. A closed list, documented in
 * openapi.json components.schemas.Error, and asserted equal to it by a test. */
export const ERROR_CODES = [
  "invalid_parameter",
  "invalid_body",
  "invalid_request",
  "unknown_endpoint",
  "method_not_allowed",
  "unsupported_media_type",
  "unknown_indicator",
  "unknown_country",
  "no_published_data",
  "out_of_range",
  "data_gap",
  "primary_source_unavailable",
  "upstream_unavailable",
  "internal_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Error meant to surface to the calling agent as a helpful tool error (not a crash). */
export class ToolError extends Error {
  details?: Record<string, unknown>;
  code?: ErrorCode;
  constructor(message: string, details?: Record<string, unknown>, code?: ErrorCode) {
    super(message);
    this.name = "ToolError";
    this.details = details;
    this.code = code;
  }
}

/** The code for a ToolError: set explicitly where the thrower knows it, else
 * read from the honest-absence details every data path already emits. */
export function toolErrorCode(e: ToolError): ErrorCode {
  if (e.code) return e.code;
  const d = (e.details ?? {}) as Record<string, unknown>;
  if (d.unknown_indicator === true) return "unknown_indicator";
  if (d.unknown_country === true) return "unknown_country";
  if (d.gap_in_published_range === true) return "data_gap";
  if (d.no_published_data === true) return "no_published_data";
  if (d.available_range) return "out_of_range";
  if (d.strict_source === true) return "primary_source_unavailable";
  return "invalid_request";
}

export function nowIso(ctx: Ctx): string {
  return (ctx.now ? ctx.now() : new Date()).toISOString();
}

export function today(ctx: Ctx): string {
  return nowIso(ctx).slice(0, 10);
}
