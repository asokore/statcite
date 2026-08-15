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
// permission from both source institutions (2026-08-10). SERVING was gated
// separately and deliberately: `caribstat` stayed absent from the served
// registry until each licence-ledger entry recorded the grant's scope verbatim
// (redistribution, derivative works, commercial use, required attribution)
// with a verification date, exactly as every other source in that ledger does.
// Both `eccb` and `cbb` entries record that grant as of 2026-08-14
// (server/src/core/sources.ts, license_verdict: "served"), and CARIBSTAT_ENABLED
// below has been true since the same date. This paragraph is deliberately kept
// past tense rather than deleted: the gate this section describes is a real
// constraint that will apply again to the next source, not a historical
// curiosity.
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

/** Both providers served since 2026-08-14; each ledger entry in
 * server/src/core/sources.ts records the grant that permits it. CBB's
 * documents carry `published_at` rather than `data_as_at` and sit at a
 * different path shape (see caribstatUrl below), which the adapter has always
 * handled per-provider — there was never a second flag gating CBB separately,
 * only this one. A comment here previously said CBB needed "an adapter
 * change, not a flag" as if that change were still pending; the CBB branches
 * throughout this file (parseCaribstatId, caribstatUrl, CBB_TABLES) show the
 * change already landed, and server/test/caribstat.test.ts has asserted CBB
 * is served since 2026-08-14. Corrected 2026-08-15 after that staleness was
 * caught while investigating why a live CBB series still read the pre-fix
 * period labels — the code path was fine; only this comment was behind. */
export const CARIBSTAT_ENABLED = true;

/** Publishing origin for the ingested JSON. Overridable so the adapter can be
 * tested against a local corpus before any origin exists. */
export const CARIBSTAT_ORIGIN = "https://asokore.github.io/caribstat";

export interface CaribstatDoc {
  source: string;
  source_id: string;
  source_url: string;
  /** ECCB shape. CBB documents carry publication fields instead, below. */
  table_id?: string;
  table_title?: string;
  country: { iso3: string; name: string };
  /** Absent on CBB, where it is derived from the period format instead of
   * being asserted. A wrong frequency label is a quiet way to misdescribe a
   * series, so it is inferred from the data rather than defaulted. */
  frequency?: string;
  /** The BANK's own currency claim, ISO date. */
  data_as_at?: string;
  /** The bank's stamp exactly as printed, e.g. "08 June 2026". */
  data_as_at_raw?: string;
  /** CBB shape. It prints no currency stamp, so a document instead identifies
   * the publication it came from: these three fields make a figure checkable
   * against the exact workbook rather than against a date we invented. */
  publication_title?: string;
  published_at?: string;
  attachment_url?: string;
  category?: string;
  sheet?: string;
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
  /** CBB only: the workbook sheet, which is that provider's varying axis. */
  sheet?: string;
  row?: string;
}

export function parseCaribstatId(id: string): ParsedId {
  const rest = id.replace(/^caribstat\//i, "");
  const [pathPart, rowPart] = rest.split("#");
  const bits = pathPart.split("/");

  // CBB: `caribstat/CBB/{category}/{sheet}`. Every CBB series is Barbados, so
  // there is no country segment to carry and no frequency suffix: the axis
  // that varies is which workbook a figure was published in. Handled before
  // the ECCB parse rather than forced through it, because demanding an
  // `{ISO3}.{freq}` tail here would mean inventing both.
  if (bits[0]?.toLowerCase() === "cbb") {
    if (bits.length < 3) {
      throw new ToolError(
        `Malformed caribstat series id '${id}'. Central Bank of Barbados ids have the form 'caribstat/CBB/{category}/{sheet}', e.g. 'caribstat/CBB/balance-of-payments-reports/analytical-summary'. Add '#Row Label' to select one row.`,
        { series_id: id },
      );
    }
    return {
      provider: "CBB",
      table: bits.slice(1, -1).join("/"),
      sheet: bits[bits.length - 1],
      iso3: "BRB",
      freq: "a",
      ...(rowPart ? { row: decodeURIComponent(rowPart) } : {}),
    };
  }

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

/**
 * Infer frequency from the period format. CBB does not state one, and guessing
 * "annual" would mislabel its monthly monetary survey. `2024` is annual,
 * `2024-Q1` quarterly, `2024-01` monthly.
 */
export function inferFrequency(periods: string[] | undefined): string {
  const p = (periods ?? []).find((x) => typeof x === "string");
  if (!p) return "a";
  if (/^\d{4}-Q[1-4]$/i.test(p)) return "q";
  if (/^\d{4}-\d{2}$/.test(p)) return "m";
  return "a";
}

/**
 * Cache epoch for the mirror.
 *
 * The mirror fetch is cached at Cloudflare's edge for six hours, and that URL
 * lives on asokore.github.io rather than in this zone, so it cannot be purged
 * through the zone API. That is fine for a monthly-updating corpus and NOT
 * fine when a document has been corrected: on 2026-08-15 a period-axis fix
 * went live on the mirror while StatCite kept serving the previous version,
 * with invented dates, for one series.
 *
 * Bumping this changes the cache key and the corrected data serves at once.
 * Bump it whenever published data is CORRECTED, not on ordinary refreshes,
 * which the six-hour TTL handles by itself.
 */
export const CARIBSTAT_CACHE_EPOCH = "2026-08-15a";

export function caribstatUrl(p: ParsedId, origin = CARIBSTAT_ORIGIN): string {
  // CBB is one geography and its axis is the PUBLICATION, not the country, so
  // its corpus is laid out per workbook sheet rather than per country and
  // frequency. Two providers, two shapes, one adapter.
  const v = `?v=${CARIBSTAT_CACHE_EPOCH}`;
  if (p.provider.toLowerCase() === "cbb") {
    return `${origin}/data/cbb/${p.table}/${p.sheet}.json${v}`;
  }
  return `${origin}/data/${p.provider.toLowerCase()}/${p.table}/${p.freq}/${p.iso3}.json${v}`;
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

/**
 * What CaribStat actually holds, for search.
 *
 * These are NOT registry indicator keys and are deliberately not modelled as
 * such. A registry key promises one concept across 200+ economies with a source
 * fallback chain behind it. These are regional tables: nine ECCB geographies in
 * EC$, or Barbados from a specific workbook. Giving them registry keys would
 * make them look universal in /v1/indicators and would let a EC$ figure answer
 * a question that expected the World Bank's definition in US$.
 *
 * So they stay explicit-id series and search points at the id. Derived from the
 * published corpus on 2026-08-14 rather than written by hand, so it says what
 * is actually there.
 */
export interface CaribstatTable {
  provider: "ECCB" | "CBB";
  table: string;
  title: string;
  /** ECCB: frequencies collected. CBB: the sheet names that exist. */
  freqs?: string[];
  sheets?: string[];
  /** Geographies, ECCB only. CBB is Barbados throughout. */
  geographies?: number;
  /** Words a person would actually search for. */
  topics: string[];
  sampleRow: string;
}

export const CARIBSTAT_CATALOGUE: CaribstatTable[] = [
  {
    provider: "ECCB", table: "total-public-sector-debt", title: "Total Public Sector Debt",
    freqs: ["a", "q"], geographies: 9, sampleRow: "Central Government Debt",
    topics: ["debt", "public sector debt", "government debt", "external debt", "domestic debt"],
  },
  {
    provider: "ECCB", table: "debt-to-gdp", title: "Debt to GDP",
    freqs: ["a"], geographies: 9, sampleRow: "Total Public Sector Debt to GDP",
    topics: ["debt to gdp", "debt ratio", "debt burden", "gdp"],
  },
  {
    provider: "ECCB", table: "central-government-fiscal-accounts", title: "Central Government Fiscal Accounts",
    freqs: ["a", "q", "m"], geographies: 9, sampleRow: "Total Revenue and Grants",
    topics: ["fiscal", "revenue", "expenditure", "budget", "deficit", "tax", "grants"],
  },
  {
    provider: "ECCB", table: "consumer-price-index", title: "Consumer Price Index",
    freqs: ["a", "q"], geographies: 9, sampleRow: "Inflation Rate - end of period",
    topics: ["inflation", "cpi", "prices", "consumer price", "cost of living"],
  },
  {
    provider: "ECCB", table: "summarized-monetary-survey", title: "Summarized Monetary Survey",
    freqs: ["a", "q", "m"], geographies: 9, sampleRow: "Money Supply (M2)",
    topics: ["money supply", "monetary", "m2", "credit", "deposits", "reserves"],
  },
  {
    provider: "ECCB", table: "interest-rates-deposits-loans", title: "Interest Rates on Deposits and Loans",
    freqs: ["a", "q", "m"], geographies: 9, sampleRow: "Weighted Average Deposit Rate",
    topics: ["interest rate", "lending rate", "deposit rate", "spread"],
  },
  {
    provider: "ECCB", table: "selected-tourism-statistics", title: "Selected Tourism Statistics",
    freqs: ["a", "q", "m"], geographies: 9, sampleRow: "Total Visitors",
    topics: ["tourism", "visitors", "arrivals", "cruise", "stayover"],
  },
  {
    provider: "CBB", table: "balance-of-payments-reports", title: "Balance of Payments",
    sheets: ["current-account", "analytical-summary", "capital-account", "primary-income"],
    sampleRow: "Current Account Balance",
    topics: ["balance of payments", "bop", "current account", "capital account", "trade balance"],
  },
  {
    provider: "CBB", table: "gross-domestic-product", title: "Gross Domestic Product",
    sheets: ["real-gdp", "gdp-by-sector"], sampleRow: "Real GDP",
    topics: ["gdp", "growth", "output", "sectors"],
  },
  {
    provider: "CBB", table: "inflation-and-retail-price-index", title: "Inflation and Retail Price Index",
    sheets: ["inflation"], sampleRow: "12 MONTH MA",
    topics: ["inflation", "retail price index", "rpi", "prices"],
  },
  {
    provider: "CBB", table: "tourism", title: "Tourism",
    sheets: ["tourism"], sampleRow: "Total Arrivals",
    topics: ["tourism", "arrivals", "visitors"],
  },
  {
    provider: "CBB", table: "labour-statistics", title: "Labour Statistics",
    sheets: ["unemployment"], sampleRow: "Unemployment Rate",
    topics: ["labour", "labor", "unemployment", "employment", "jobs"],
  },
];

/** ECCB geographies, for matching a country name in a search query. */
export const ECCB_GEOGRAPHIES: Record<string, string> = {
  AIA: "Anguilla", ATG: "Antigua and Barbuda", DMA: "Dominica", GRD: "Grenada",
  KNA: "St. Kitts and Nevis", LCA: "St. Lucia", MSR: "Montserrat",
  VCT: "St. Vincent and the Grenadines", XCU: "ECCU (currency union aggregate)",
};

/** Score a catalogue entry against a free-text query. */
export function searchCaribstat(query: string, limit = 4): Array<{
  entry: CaribstatTable; iso3?: string; id: string; why: string;
}> {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  let iso3: string | undefined;
  for (const [code, name] of Object.entries(ECCB_GEOGRAPHIES)) {
    if (q.includes(name.toLowerCase()) || q.includes(code.toLowerCase())) { iso3 = code; break; }
  }
  const caribbeanIntent = /caribbean|eccu|eccb|barbados|antigua|anguilla|montserrat|grenada|dominica|lucia|kitts|nevis|vincent/i.test(q);
  const out: Array<{ entry: CaribstatTable; iso3?: string; id: string; why: string; score: number }> = [];
  for (const e of CARIBSTAT_CATALOGUE) {
    let score = 0;
    for (const t of e.topics) {
      if (q.includes(t)) score += t.split(" ").length * 2;
    }
    if (e.title.toLowerCase().includes(q)) score += 3;
    // A topic alone is not enough: "inflation" must not surface a nine-country
    // regional table above the global registry key. Regional intent is required
    // unless the query names the table itself.
    if (score > 0 && !caribbeanIntent && !e.title.toLowerCase().includes(q)) continue;
    if (score === 0 && caribbeanIntent) score = 1;
    if (score === 0) continue;
    const id = e.provider === "ECCB"
      ? `caribstat/ECCB/${e.table}/${iso3 ?? "AIA"}.${e.freqs?.[0] ?? "a"}`
      : `caribstat/CBB/${e.table}/${e.sheets?.[0]}`;
    out.push({
      entry: e, iso3, id, score,
      why: e.provider === "ECCB"
        ? `${e.title}, ${e.geographies} ECCB geographies, ${(e.freqs ?? []).join("/")}`
        : `${e.title}, Barbados, ${(e.sheets ?? []).length} sheet(s)`,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ entry, iso3, id, why }) => ({ entry, iso3, id, why }));
}

/**
 * Economies with no World Bank GDP series, where UNCTAD does hold one.
 *
 * Anguilla, Montserrat and the British Virgin Islands return nothing for
 * gdp_growth from any source in the main chain. UNCTAD carries 49 years for
 * each, 1971 to 2019, reachable today through the DBnomics adapter with no new
 * source. The only reason nobody found it is that you had to already know the
 * series code.
 *
 * It is surfaced through SEARCH rather than wired into the gdp_growth chain,
 * and that is deliberate. The series ends in 2019. Letting it answer
 * "what is Anguilla's GDP growth" would hand back a six-year-old figure to a
 * question that almost always means "now", which is the kind of quietly wrong
 * answer this service exists to prevent. Offered as history, labelled as
 * history, and the caller decides.
 */
export const UNCTAD_GDP_FALLBACK: Record<string, { name: string; slug: string }> = {
  AIA: { name: "Anguilla", slug: "anguilla" },
  MSR: { name: "Montserrat", slug: "montserrat" },
  VGB: { name: "British Virgin Islands", slug: "british-virgin-islands" },
};

/** Does this query ask about GDP for an economy the main chain cannot serve? */
export function searchUnctadGap(query: string): Array<{ iso3: string; name: string; id: string }> {
  const q = query.toLowerCase();
  if (!/\bgdp\b|growth|economy|output|national accounts/.test(q)) return [];
  const out: Array<{ iso3: string; name: string; id: string }> = [];
  for (const [iso3, v] of Object.entries(UNCTAD_GDP_FALLBACK)) {
    if (q.includes(v.name.toLowerCase()) || q.includes(iso3.toLowerCase())) {
      out.push({
        iso3,
        name: v.name,
        id: `dbnomics/UNCTAD/GDPTAPCGRA/A.annual-average-growth-rate.${v.slug}`,
      });
    }
  }
  return out;
}
