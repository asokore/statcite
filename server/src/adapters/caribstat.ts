// CaribStat adapter — regional central-bank series that no aggregator carries.
//
// ARCHITECTURE (caribstat SCOPING.md §3): scheduled ingestion lives in the
// separate caribstat repo, which publishes static JSON to a stable origin.
// This Worker treats that origin exactly as it treats api.worldbank.org — an
// upstream it fetches and edge-caches. Scraping and xlsx parsing cannot live
// in a zero-dependency 10ms Worker and should not; a broken scrape upstream
// must never be able to break statcite.com.
//
// LICENCE GATE. Ingestion is permitted because the operator obtained written
// permission from the source institution (2026-08-10). SERVING is gated
// separately and deliberately: `caribstat` stays absent from the served
// registry until its licence-ledger entry records the grant's scope verbatim
// (redistribution, derivative works, commercial use, required attribution)
// with a verification date, exactly as every other source in that ledger does.
// This adapter is therefore complete and tested but NOT wired into the serving
// chain — see CARIBSTAT_ENABLED below. Turning it on is a one-line change once
// the ledger entry exists, and must not happen before.
//
// WHY data_as_at MATTERS HERE MORE THAN ANYWHERE ELSE. These banks stamp every
// table with their own "Data as at" date, and the stamps genuinely differ per
// table and even per country (verified 2026-08-10: fiscal accounts 2026-07-28,
// public sector debt 2026-06-08, CPI varying by country). A citation that
// presented our retrieval time as the data's currency would be a lie by
// formatting, so both dates travel separately all the way into the citation.

import { fetchJson } from "../core/upstream.ts";
import { ToolError } from "../core/types.ts";
import type { Observation } from "../core/types.ts";

/** Served since 2026-08-14. The ECCB ledger entry records the grant that
 * permits it. CBB is collected but NOT served: its documents deliberately
 * carry `published_at` rather than `data_as_at` and sit at a different path
 * shape, so serving it needs an adapter change, not a flag. */
export const CARIBSTAT_ENABLED = true;

/** Publishing origin for the ingested JSON. Overridable so the adapter can be
 * tested against a local corpus before any origin exists. */
export const CARIBSTAT_ORIGIN = "https://asokore.github.io/caribstat";

export interface CaribstatDoc {
  source: string;
  source_id: string;
  source_url: string;
  table_id: string;
  table_title: string;
  country: { iso3: string; name: string };
  frequency: string;
  /** The BANK's own currency claim, ISO date. */
  data_as_at?: string;
  /** The bank's stamp exactly as printed, e.g. "08 June 2026". */
  data_as_at_raw?: string;
  /** OUR fetch time. Never presented as the data's currency. */
  retrieved_at: string;
  periods: string[];
  periods_raw?: string[];
  series: Array<{ label: string; unit?: string; observations: Observation[] }>;
}

export interface CaribstatSeries {
  doc: CaribstatDoc;
  label: string;
  unit?: string;
  observations: Observation[];
  apiUrl: string;
}

/** Explicit series id: `caribstat/ECCB/{table}/{ISO3}.{freq}[#row label]`.
 * The optional row selector picks one line out of a multi-row table; without
 * it the caller gets the table's first row, which is the headline aggregate by
 * the banks' own ordering. */
export interface ParsedId {
  provider: string;
  table: string;
  iso3: string;
  freq: string;
  row?: string;
}

export function parseCaribstatId(id: string): ParsedId {
  const rest = id.replace(/^caribstat\//i, "");
  const [pathPart, rowPart] = rest.split("#");
  const bits = pathPart.split("/");
  if (bits.length < 3) {
    throw new ToolError(
      `Malformed caribstat series id '${id}'. Expected 'caribstat/{PROVIDER}/{table}/{ISO3}.{freq}', e.g. 'caribstat/ECCB/total-public-sector-debt/AIA.a'. Add '#Row Label' to select one row.`,
      { series_id: id },
    );
  }
  const provider = bits[0];
  const last = bits[bits.length - 1];
  const table = bits.slice(1, -1).join("/");
  const dot = last.lastIndexOf(".");
  if (dot < 1) {
    throw new ToolError(
      `Malformed caribstat series id '${id}': the last segment must be '{ISO3}.{freq}' (frequency a, q or m), e.g. 'AIA.a'.`,
      { series_id: id },
    );
  }
  const iso3 = last.slice(0, dot).toUpperCase();
  const freq = last.slice(dot + 1).toLowerCase();
  if (!["a", "q", "m"].includes(freq)) {
    throw new ToolError(`Unsupported caribstat frequency '${freq}' in '${id}'. Use a (annual), q (quarterly) or m (monthly).`, {
      series_id: id,
    });
  }
  return { provider: provider.toUpperCase(), table, iso3, freq, row: rowPart?.trim() || undefined };
}

export function caribstatUrl(p: ParsedId, origin = CARIBSTAT_ORIGIN): string {
  return `${origin}/data/${p.provider.toLowerCase()}/${p.table}/${p.freq}/${p.iso3}.json`;
}

/** Pick a row by label. Exact match first, then a case-insensitive prefix — a
 * prefix match must be UNIQUE, because silently picking the first of several
 * "Public Sector …" rows would serve a different series than the caller asked
 * for and look perfectly healthy doing it. */
export function selectRow(doc: CaribstatDoc, want?: string): { label: string; unit?: string; observations: Observation[] } {
  if (!doc.series?.length) {
    throw new ToolError(`caribstat document for ${doc.table_id}/${doc.country.iso3} contains no series rows.`, {
      table: doc.table_id,
      country: doc.country.iso3,
      no_published_data: true,
    });
  }
  if (!want) return doc.series[0];
  const exact = doc.series.find((s) => s.label.toLowerCase() === want.toLowerCase());
  if (exact) return exact;
  const prefixed = doc.series.filter((s) => s.label.toLowerCase().startsWith(want.toLowerCase()));
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) {
    throw new ToolError(
      `Row selector '${want}' is ambiguous in ${doc.table_id}/${doc.country.iso3}: it matches ${prefixed.length} rows (${prefixed
        .map((s) => `"${s.label}"`)
        .join(", ")}). Use the exact label.`,
      { table: doc.table_id, country: doc.country.iso3, matches: prefixed.map((s) => s.label) },
    );
  }
  throw new ToolError(
    `No row '${want}' in ${doc.table_id}/${doc.country.iso3}. Available rows: ${doc.series.map((s) => s.label).join(" | ")}`,
    { table: doc.table_id, country: doc.country.iso3, available_rows: doc.series.map((s) => s.label) },
  );
}

/** Fetch one CaribStat series. */
export async function fetchCaribstatSeries(id: string, opts: { origin?: string; ttlSeconds?: number } = {}): Promise<CaribstatSeries> {
  const parsed = parseCaribstatId(id);
  const apiUrl = caribstatUrl(parsed, opts.origin ?? CARIBSTAT_ORIGIN);
  // A 404 from the origin means THIS SERIES DOES NOT EXIST, not that the
  // upstream is broken. Letting it surface as a 502 "upstream data source
  // problem" (with a page of GitHub's 404 HTML attached) blames the origin for
  // the caller's request and tells them to retry something that can never
  // succeed. Not every table is collected at every frequency: CPI is annual
  // and quarterly only, so `consumer-price-index/GRD.m` is a real miss.
  let doc: CaribstatDoc;
  try {
    doc = (await fetchJson(apiUrl, {
    // Six hours: the banks publish monthly at best, and the document carries
    // its own data_as_at so a consumer can always see the real currency.
      ttlSeconds: opts.ttlSeconds ?? 21600,
      timeoutMs: 8000,
      validate: (d) => {
        const x = d as CaribstatDoc;
        return Boolean(x && typeof x === "object" && Array.isArray(x.series) && x.country?.iso3 && x.source);
      },
    })) as CaribstatDoc;
  } catch (e) {
    if (e instanceof Error && /HTTP 404/.test(e.message)) {
      throw new ToolError(
        `No CaribStat series '${id}'. That combination of table, country and frequency is not collected. Not every table exists at every frequency: consumer-price-index is annual and quarterly only, and public-sector-debt is annual only.`,
        { series_id: id, api_url: apiUrl, no_published_data: true },
      );
    }
    throw e;
  }

  const row = selectRow(doc, parsed.row);
  return { doc, label: row.label, unit: row.unit, observations: row.observations, apiUrl };
}
