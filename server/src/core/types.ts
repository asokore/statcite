// Shared types for the StatCite core.

export interface Ctx {
  /** Public base URL of this deployment (for self-links in docs/errors). */
  baseUrl: string;
  /** Optional FRED API key — unlocks fred/* series (US monthly data). */
  fredApiKey?: string;
  /** Injected clock for testability. */
  now?: () => Date;
  /**
   * Optional aggregate usage sink (Workers Analytics Engine binding).
   * Structural type so core/ stays free of Workers imports. Carries only
   * aggregate, non-identifying fields — see core/analytics.ts.
   */
  analytics?: { writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void };
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
  /** FRED series id for a higher-frequency US variant (requires FRED_API_KEY). */
  fred?: string;
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
