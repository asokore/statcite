// ECCB ingest — fetch, validate, snapshot.
//
// Design commitments from SCOPING.md §3, and the reasons they are not
// negotiable:
//
//  - DATED VINTAGES FROM DAY ONE. Every run writes an immutable snapshot next
//    to the mutable "latest" file. It is cheap now and impossible to
//    retrofit, and for these series no other vintage archive exists anywhere
//    in the world — if we do not keep the history, nobody has it.
//  - SENTINELS THAT FAIL LOUD. A scrape that silently returns a page without
//    the expected rows must abort the series, not write an empty file that
//    reads as "the source publishes nothing". The distinction between "source
//    moved" and "no new data" is the whole difference between honest absence
//    and a fabricated one.
//  - data_as_at IS THE SOURCE'S CLAIM, retrieved_at IS OURS. They are recorded
//    separately and never conflated. A citation that presents our fetch time
//    as the data's currency is a lie by formatting.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { openTableSession, fetchGeography, ECCB_GEOGRAPHIES } from "./fetch.mjs";
import { TABLES, tableById, tableUrl, isPerCountry } from "./catalogue.mjs";
import { compareWithExisting, classifyChange } from "../changed.mjs";

export const DATA_DIR = path.resolve(process.cwd(), "data", "eccb");

/** Parse "28 July 2026" into an ISO date so freshness is comparable across
 * runs. Returns undefined rather than a guess when the stamp is unparseable —
 * an unparseable stamp is a sentinel failure, not a date to invent. */
export function parseDataAsAt(stamp) {
  if (!stamp) return undefined;
  const d = new Date(`${stamp} UTC`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * Shape sentinel. Returns a list of problems; empty means the payload looks
 * like what this table is supposed to be.
 *
 * Deliberately checks the fields a CONSUMER reads (row labels, periods,
 * numeric values, provenance), not merely that some HTML came back — a 200
 * with a redesigned page would pass any weaker check.
 */
export function validateTable(def, table, dataAsAt) {
  const problems = [];
  if (!table) return ["no table element found in the response"];
  if (!table.periods?.length) problems.push("no period columns parsed");
  if (!table.rows?.length) problems.push("no data rows parsed");
  for (const needle of def.sentinelRows ?? []) {
    if (!table.rows.some((r) => r.label.toLowerCase().startsWith(needle.toLowerCase()))) {
      problems.push(`expected row missing: "${needle}" — the source layout may have changed`);
    }
  }
  const numeric = (table.rows ?? []).flatMap((r) => r.values).filter((v) => v != null);
  if (numeric.length === 0) problems.push("every cell parsed to null — number formatting may have changed");
  if (!parseDataAsAt(dataAsAt)) problems.push(`unparseable or missing "Data as at" stamp: ${dataAsAt ?? "(none)"}`);
  return problems;
}

/** Build the published series document for one table+geography+frequency. */
export function buildDocument({ def, iso3, name, freq, url, table, dataAsAt, retrievedAt }) {
  return {
    source: "Eastern Caribbean Central Bank",
    source_id: "eccb",
    source_url: url,
    table_id: def.id,
    table_title: def.title,
    country: { iso3, name },
    frequency: freq,
    // The bank's own currency stamp and our retrieval time, kept apart.
    data_as_at: parseDataAsAt(dataAsAt),
    data_as_at_raw: dataAsAt,
    retrieved_at: retrievedAt,
    periods: table.periods,
    // Raw source labels kept alongside the normalised ones: normalising without
    // preserving the original would destroy the ability to prove what the bank
    // actually printed.
    periods_raw: table.periodsRaw,
    series: table.rows.map((r) => ({
      label: r.label,
      unit: r.unit,
      observations: table.periods.map((p, i) => ({ period: p, value: r.values[i] ?? null })),
    })),
  };
}

async function writeJson(file, doc) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

/**
 * Ingest one table across geographies at one frequency.
 * Returns a per-geography status report. Nothing is written for a geography
 * whose sentinel failed.
 */
export async function ingestTable(tableId, { freq = "a", geographies = ECCB_GEOGRAPHIES, startDate, endDate, dataDir = DATA_DIR, gapMs = 1200 } = {}) {
  const def = tableById.get(tableId);
  if (!def) throw new Error(`unknown table id '${tableId}'`);
  if (!def.frequencies.includes(freq)) {
    throw new Error(
      `table '${tableId}' does not publish frequency '${freq}' (has: ${def.frequencies.join(", ")}). This is a request error, not an absence of data.`,
    );
  }
  const retrievedAt = new Date().toISOString();
  const results = [];
  let session;
  let sessionUrl;

  for (const g of geographies) {
    const url = tableUrl(def, g.iso3);
    try {
      // Per-country tables live on distinct URLs, so the CSRF session cannot be
      // shared across them; geography-selector tables reuse one session.
      if (!session || isPerCountry(def) || sessionUrl !== url) {
        session = await openTableSession(url, freq);
        sessionUrl = url;
      }
      const r = isPerCountry(def)
        ? { html: session.html, table: (await import("./fetch.mjs")).parseTable(session.html, { freq }), dataAsAt: session.dataAsAt }
        : await fetchGeography(url, session, { countryCode: g.code, freq, startDate, endDate });

      const problems = validateTable(def, r.table, r.dataAsAt);
      if (problems.length) {
        results.push({ iso3: g.iso3, ok: false, problems });
        continue;
      }
      const doc = buildDocument({ def, iso3: g.iso3, name: g.name, freq, url, table: r.table, dataAsAt: r.dataAsAt, retrievedAt });
      const stamp = doc.data_as_at ?? retrievedAt.slice(0, 10);
      const latestFile = path.join(dataDir, def.id, freq, `${g.iso3}.json`);
      // Only touch the immutable snapshot when the SOURCE's content moved.
      // Rewriting it every run would make snapshots a log of when we looked
      // rather than of what the bank published.
      const state = await classifyChange(latestFile, doc);
      if (state !== "unchanged") {
        await writeJson(path.join(dataDir, def.id, freq, "snapshots", `${g.iso3}.${stamp}.json`), doc);
      }
      await writeJson(latestFile, doc);
      results.push({ iso3: g.iso3, ok: true, state, rows: doc.series.length, periods: doc.periods.length, dataAsAt: doc.data_as_at });
    } catch (e) {
      results.push({ iso3: g.iso3, ok: false, problems: [String(e.message ?? e)] });
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return { tableId, freq, retrievedAt, results };
}

export { TABLES };
