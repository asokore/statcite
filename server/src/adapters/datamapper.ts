// IMF DataMapper API adapter — current-vintage WEO / Fiscal Monitor data, no auth.
// Docs: https://www.imf.org/external/datamapper/api/help
//
// Design record: docs/DESIGN-weo-datamapper.md (adversarially reviewed 2026-07-25).
// Load-bearing facts this adapter depends on — re-verify before touching thresholds:
//   - Country path segments are IGNORED: the bare code endpoint always returns ALL
//     ~226-229 economies in one payload; fetch once, index client-side.
//   - The API returns HTTP 200 for decoy shapes too: an empty envelope for an
//     unknown/retired code, and (when a country segment is used) a countries-list
//     envelope for an unknown code. Status codes carry no signal — shape must be
//     validated on every response.
//   - The edition string + IMF load timestamp live ONLY on the bare /indicators
//     endpoint (covers ~132 showcased indicators) — /indicators/{code} is silently
//     treated as a values request by this API, not a metadata lookup, and a bare
//     code with no data (e.g. GGR_NGDP) also 200s with the empty envelope.
//   - WEO-dataset codes are rounded to 1 decimal; Fiscal Monitor (FM) codes are
//     full precision.

import { fetchJson, memoFetchJson, ShapeError, UpstreamError } from "../core/upstream.ts";
import { ToolError } from "../core/types.ts";
import type { Ctx, Observation } from "../core/types.ts";
import { expectedWeoEdition } from "../core/weo-calendar.ts";

const BASE = "https://www.imf.org/external/datamapper/api/v1";
const METADATA_URL = `${BASE}/indicators`;

const VALUES_TTL_SECONDS = 3600;
const RELEASE_WINDOW_TTL_SECONDS = 300;
const METADATA_TTL_SECONDS = 3600;

/** A values payload with fewer country keys than this is treated as truncated/garbled,
 * never as "this country has no data" — real payloads carry 212-229 keys. */
const MIN_COUNTRY_KEYS = 150;

/** DataMapper (and DBnomics-WEO) key a StatCite ISO3 must be translated to — both
 * services key these two economies differently than StatCite's resolver. */
const COUNTRY_ALIASES: Record<string, string> = {
  PSE: "WBG", // West Bank and Gaza
  XKX: "UVK", // Kosovo
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export interface DmEdition {
  /** Verbatim IMF label, e.g. "World Economic Outlook (April 2026)" — pass through untouched, never rephrase. */
  label: string;
  year?: number;
  month?: number; // 1-12
  /** IMF's own load timestamp, e.g. "2026-04-08 16:07:34" — a load moment, never a release date. */
  lastModified?: string;
}

export interface DmSeries {
  code: string;
  dataset: "WEO" | "FM";
  countryIso3: string;
  observations: Observation[];
  /** Undefined in degraded mode: metadata endpoint unreachable, or this code absent from it. */
  edition?: DmEdition;
  /** Max year present anywhere in the payload (any country) — the payload-anchored horizon. */
  horizonYear: number;
  valuesApiUrl: string;
  metaApiUrl: string;
  humanUrl: string;
}

function isWithinReleaseWindow(now: Date): boolean {
  const year = now.getUTCFullYear();
  const windowMs = 10 * 24 * 3600 * 1000;
  for (const month of [4, 10]) {
    // Check both the current-year and prior-year occurrence so a window spanning
    // a Dec31/Jan1 boundary (not reachable for Apr/Oct in practice, kept for safety).
    for (const y of [year, year - 1, year + 1]) {
      if (Math.abs(now.getTime() - Date.UTC(y, month - 1, 1)) <= windowMs) return true;
    }
  }
  return false;
}

function isValuesEnvelope(data: unknown, code: string): boolean {
  if (!data || typeof data !== "object") return false;
  const values = (data as { values?: unknown }).values;
  if (!values || typeof values !== "object") return false;
  const inner = (values as Record<string, unknown>)[code];
  if (!inner || typeof inner !== "object") return false;
  const countryKeys = Object.keys(inner as Record<string, unknown>).filter(Boolean);
  return countryKeys.length >= MIN_COUNTRY_KEYS;
}

function isIndicatorsEnvelope(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const indicators = (data as { indicators?: unknown }).indicators;
  return Boolean(indicators && typeof indicators === "object" && Object.keys(indicators as object).length > 50);
}

/** Parse a verbatim IMF edition label like "World Economic Outlook (April 2026)"
 * or "Fiscal Monitor (April 2026)" into {year, month}. Never used to rewrite the
 * label itself — only to drive the calendar/horizon sentinels. */
export function parseEditionLabel(label: string | undefined): { year: number; month: number } | undefined {
  if (!label) return undefined;
  const m = label.match(/\(([A-Za-z]+)\s+(\d{4})\)\s*$/);
  if (!m) return undefined;
  const month = MONTHS[m[1].toLowerCase()];
  const year = parseInt(m[2], 10);
  if (!month || !Number.isFinite(year)) return undefined;
  return { year, month };
}

/** Payload-anchored projection boundary (design D3): the payload's own horizon
 * minus 5 (verified across 7 WEO/FM codes: horizon = edition year + 5), clamped
 * to the calendar-expected edition year when the gap exceeds 1 (a truncated or
 * mid-load payload) — the edition *string* never drives the boundary, so cache
 * skew and Update-month labels can't corrupt the actual/projection flag. */
export function computeBoundaryYear(horizonYear: number, now: Date = new Date()): { boundaryYear: number; clamped: boolean } {
  const naive = horizonYear - 5;
  const calendarYear = parseInt(expectedWeoEdition(now).slice(0, 4), 10);
  if (Math.abs(naive - calendarYear) > 1) return { boundaryYear: calendarYear, clamped: true };
  return { boundaryYear: naive, clamped: false };
}

function memo(ctx: Ctx): Map<string, Promise<unknown>> {
  if (!ctx._dmMemo) ctx._dmMemo = new Map();
  return ctx._dmMemo;
}

/** The full per-indicator metadata table (edition label, dataset, last-modified).
 * One request, shared via the per-Ctx memo across every DataMapper code a single
 * HTTP request touches — fetching it again for a 2nd/3rd/... code costs nothing. */
export async function fetchDataMapperMetadata(
  ctx: Ctx,
): Promise<Record<string, { label: string; source: string; dataset: string; "last-modified"?: string }> | undefined> {
  try {
    const data = (await memoFetchJson(memo(ctx), METADATA_URL, {
      ttlSeconds: METADATA_TTL_SECONDS,
      validate: isIndicatorsEnvelope,
    })) as { indicators: Record<string, { label: string; source: string; dataset: string; "last-modified"?: string }> };
    return data.indicators;
  } catch {
    return undefined; // degraded mode — caller falls back to a year-only, two-sided label
  }
}

export async function fetchDataMapperSeries(
  ctx: Ctx,
  code: string,
  dataset: "WEO" | "FM",
  countryIso3: string,
  now: Date = new Date(),
): Promise<DmSeries> {
  const url = `${BASE}/${encodeURIComponent(code)}`;
  const ttl = isWithinReleaseWindow(now) ? RELEASE_WINDOW_TTL_SECONDS : VALUES_TTL_SECONDS;

  let data: unknown;
  try {
    data = await memoFetchJson(memo(ctx), url, { ttlSeconds: ttl, validate: (d) => isValuesEnvelope(d, code) });
  } catch (e) {
    if (e instanceof ShapeError) {
      const meta = await fetchDataMapperMetadata(ctx);
      if (meta && !meta[code]) {
        // Confirmed absent from the IMF's own indicator registry — a permanent
        // misconfiguration (typo, retired/renamed code), not a network blip.
        // This must never read as "transiently unavailable, retry" — that would
        // stand for months masking a config error (design D8/F3/F10).
        throw new ToolError(
          `IMF DataMapper has no series for code '${code}' (confirmed absent from the live /indicators registry).`,
          { code },
        );
      }
      throw new UpstreamError(`IMF DataMapper returned no usable data for series '${code}' (decoy/empty envelope)`, url);
    }
    throw e;
  }

  const values = (data as { values: Record<string, Record<string, Record<string, number | null>>> }).values[code];
  let horizonYear = 0;
  for (const iso of Object.keys(values)) {
    if (!iso) continue;
    for (const y of Object.keys(values[iso])) {
      const n = parseInt(y, 10);
      if (Number.isFinite(n) && n > horizonYear) horizonYear = n;
    }
  }

  const dmCountry = COUNTRY_ALIASES[countryIso3] ?? countryIso3;
  const countrySeries = values[dmCountry];
  if (!countrySeries) {
    throw new ToolError(
      `Country '${countryIso3}' is not present in the IMF DataMapper ${dataset} payload for series '${code}'.`,
      { code, country: countryIso3 },
    );
  }

  const observations: Observation[] = Object.entries(countrySeries)
    .map(([period, value]) => ({ period, value: typeof value === "number" ? value : null }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const metaTable = await fetchDataMapperMetadata(ctx);
  const entry = metaTable?.[code];
  let edition: DmEdition | undefined;
  if (entry) {
    const parsed = parseEditionLabel(entry.source);
    edition = { label: entry.source, year: parsed?.year, month: parsed?.month, lastModified: entry["last-modified"] };
  }

  return {
    code,
    dataset,
    countryIso3,
    observations,
    edition,
    horizonYear,
    valuesApiUrl: url,
    metaApiUrl: METADATA_URL,
    humanUrl: `https://www.imf.org/external/datamapper/${encodeURIComponent(code)}@${dataset}/${encodeURIComponent(dmCountry)}`,
  };
}

/** Test hook: clear DataMapper module-level state. Currently stateless (all
 * caching lives in upstream.ts's mem / the caller's Ctx memo) — kept for symmetry
 * with the other adapters and as a future-proof seam. */
export function _clearDataMapperState(): void {
  // no-op today
}
