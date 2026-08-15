// CBB ingest — discover, download, extract, validate, snapshot.
//
// Same commitments as the ECCB pipeline (SCOPING.md §3), with the differences
// this source forces:
//
//  - ONE GEOGRAPHY. Every CBB series is Barbados, so the axis that varies is
//    the PUBLICATION (a dated workbook), not the country.
//  - NO "DATA AS AT" STAMP. ECCB prints one on every table; CBB does not. The
//    closest thing the source gives is the timestamp it puts in the CDN
//    filename, which is a PUBLICATION date. It is recorded as
//    `published_at` — deliberately NOT called data_as_at, because it is a
//    weaker claim than ECCB's and pretending otherwise would overstate what
//    the bank actually told us.
//  - WORKBOOKS CARRY MANY TABLES. One download can hold 13 sheets, so a
//    document is written per sheet, not per file.

import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { openListing, extractItemLinks, resolveAttachment, downloadAttachment, publicationDateFromUrl, titleAgreesWithAttachment, publicationFamily, CBB_LISTINGS } from "./fetch.mjs";
import { readXlsx } from "../xlsx.mjs";
import { extractWorkbook } from "./tables.mjs";
import { compareWithExisting, classifyChange } from "../changed.mjs";
import { loadLedger, saveLedger, noteCheck } from "../checkpoint.mjs";

export const DATA_DIR = path.resolve(process.cwd(), "data", "cbb");

const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "sheet";

/**
 * Shape sentinel. Checks what a CONSUMER reads, and treats the failure modes
 * this parser has actually produced as hard failures rather than warnings.
 */
export function validateTable(table, publishedAt) {
  const problems = [];
  if (!table) return ["no data table found in the sheet"];
  if (!table.periods?.length) problems.push("no periods parsed");
  if (!table.series?.length) problems.push("no series columns parsed");
  // A wrong period axis produces real values under real labels with invented
  // dates, so no value-shaped check can see it. Coverage can: every correctly
  // read CBB sheet dates 87% or more of its numeric rows, and the one sheet
  // that was read off the wrong column dated 38% of them. Anything below 0.6
  // means most of the sheet was skipped, which is either a truncated read or
  // an axis in the wrong column. Both are hard failures.
  if (typeof table.axis_coverage === "number" && table.axis_coverage < 0.6) {
    problems.push(
      `only ${Math.round(table.axis_coverage * 100)}% of the sheet's numeric rows carry a parsed period — ` +
        `the period column may be the wrong one, or most rows failed to parse`,
    );
  }
  const values = (table.series ?? []).flatMap((s) => s.observations.map((o) => o.value)).filter((v) => v != null);
  if (values.length === 0) problems.push("every cell parsed to null — the sheet layout or number format may have changed");
  // A 1900s date in a table published this decade is the year/serial collision
  // resurfacing. Fail loudly rather than emit Edwardian periods again.
  const antique = (table.periods ?? []).filter((p) => /^19[0-3]\d-/.test(p));
  if (antique.length) problems.push(`${antique.length} period(s) parsed into the 1900s (e.g. ${antique[0]}) — likely a year read as an Excel serial`);
  // ONE SHEET, ONE PERIOD FORMAT. A series whose labels change shape partway
  // through cannot be matched on period by anything downstream: "2025-01" and
  // "2025-01-04" are the same month written two ways, and a consumer joining on
  // the string sees two different periods. This went undetected across three
  // sheets — tourism, an inflation table and the investments sheet — because
  // each individual label was defensible on its own. The shape of the SERIES is
  // the thing that was wrong, so that is what this checks.
  const shapes = new Set(
    (table.periods ?? []).map((p) =>
      /^\d{4}$/.test(p) ? "YYYY"
        : /^\d{4}-Q[1-4]$/.test(p) ? "YYYY-Qn"
        : /^\d{4}-\d{2}$/.test(p) ? "YYYY-MM"
        : /^\d{4}-\d{2}-\d{2}$/.test(p) ? "YYYY-MM-DD"
        : "unrecognised",
    ),
  );
  if (shapes.size > 1) {
    const counts = [...shapes].map((s) => {
      const n = (table.periods ?? []).filter((p) => (s === "YYYY" ? /^\d{4}$/ : s === "YYYY-Qn" ? /^\d{4}-Q[1-4]$/ : s === "YYYY-MM" ? /^\d{4}-\d{2}$/ : s === "YYYY-MM-DD" ? /^\d{4}-\d{2}-\d{2}$/ : /^$/).test(p)).length;
      return `${s} x${n}`;
    });
    const odd = (table.periods ?? []).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)).slice(0, 3);
    problems.push(
      `period labels carry ${shapes.size} different formats (${counts.join(", ")})${odd.length ? `, e.g. ${odd.join(", ")}` : ""} — one series must use one format or period matching breaks`,
    );
  }
  if (!publishedAt) problems.push("no publication date could be read from the attachment URL");
  return problems;
}

export function buildDocument({ category, title, sheetName, itemUrl, attachmentUrl, publishedAt, table, retrievedAt }) {
  return {
    source: "Central Bank of Barbados",
    source_id: "cbb",
    source_url: itemUrl,
    attachment_url: attachmentUrl,
    category,
    publication_title: title,
    sheet: sheetName,
    country: { iso3: "BRB", name: "Barbados" },
    // The SOURCE's publication timestamp, from its own filename. Weaker than
    // ECCB's "Data as at" stamp and named differently so the two are never
    // conflated in a citation.
    published_at: publishedAt,
    retrieved_at: retrievedAt,
    periods: table.periods,
    periods_raw: table.periods_raw,
    // Periods the bank itself marked revised or provisional (R/P suffix).
    revised_periods: table.revised_periods,
    // Label cells that could not be dated — footnotes, base-year rows. Kept so
    // an unrecognised real period format is visible instead of silently gone.
    unparsed_labels: table.unparsed_labels,
    series: table.series,
  };
}

async function writeJson(file, doc) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

/**
 * Which attachment did we last ingest for this category?
 *
 * Every sheet document from one workbook carries the same `attachment_url`, so
 * any of them answers the question. If they DISAGREE the category is mid-way
 * through a migration or a past run half-failed, and the honest response is to
 * decline the shortcut and re-read the workbook.
 *
 * Returns undefined when nothing is stored yet, which correctly forces a fetch.
 */
export async function heldPublication(dataDir, categoryId) {
  let names;
  try {
    names = (await readdir(path.join(dataDir, categoryId), { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith(".json"))
      .map((d) => d.name);
  } catch {
    return undefined;
  }
  if (names.length === 0) return undefined;
  const urls = new Set();
  for (const n of names) {
    try {
      const doc = JSON.parse(await readFile(path.join(dataDir, categoryId, n), "utf8"));
      urls.add(doc.attachment_url ?? "");
    } catch {
      return undefined; // an unreadable document means we cannot claim to know
    }
  }
  // The sheet count travels with the answer so a skipped run can still report
  // how many sheets this category holds. Without it a quiet day would report
  // zero sheets, and the standing "fewer than 14 balance-of-payments sheets is
  // a regression" check would read every skip as a catastrophic regression.
  return urls.size === 1 ? { attachmentUrl: [...urls][0], sheets: names.length } : undefined;
}

/**
 * Ingest the newest publication(s) for one CBB category.
 *
 * `deep` forces the workbook to be downloaded and re-parsed even when the
 * attachment URL is one we have already ingested. The incremental path skips
 * that download, which is where nearly all of this source's cost sits: the
 * balance-of-payments workbook has not moved since 2022-07-28 and was being
 * re-downloaded every single day to produce a guaranteed "same".
 *
 * The URL is a safe key because CBB's CDN puts a publication timestamp IN the
 * filename, so a new publication is necessarily a new URL. What the shortcut
 * cannot see is a file replaced in place under an unchanged URL, and that is
 * precisely what the weekly deep run is for.
 */
/**
 * Which items to fetch from a listing.
 *
 * Listings are newest-first, and most of them are one publication republished,
 * so "the newest item" is normally the whole answer. It is not always: the
 * statistics listing carries two DIFFERENT tables, and taking only the newest
 * dropped the other publication entirely rather than merely serving it stale.
 *
 * So: group by publication, take the newest `maxItems` editions of each, and
 * keep as many publications as the listing declares. A listing that does not
 * declare `families` keeps the old single-publication behaviour exactly.
 */
export function selectItems(items, listing, maxItems = 1) {
  const wanted = listing?.families ?? 1;
  const byFamily = new Map();
  for (const url of items) {
    const key = publicationFamily(url);
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push(url);
  }
  const out = [];
  for (const [, urls] of [...byFamily].slice(0, wanted)) out.push(...urls.slice(0, maxItems));
  return out;
}

export async function ingestCategory(listing, { maxItems = 1, dataDir = DATA_DIR, gapMs = 1000, deep = false } = {}) {
  const retrievedAt = new Date().toISOString();
  const results = [];
  const session = await openListing(listing.path);
  const items = extractItemLinks(session.html, listing.path);
  if (items.length === 0) {
    return { category: listing.id, retrievedAt, results: [{ ok: false, problems: ["listing returned no items — it may be a hub of sub-categories, not a listing"] }] };
  }

  for (const itemUrl of selectItems(items, listing, maxItems)) {
    try {
      const { attachmentUrl, title } = await resolveAttachment(itemUrl, session.cookies);
      if (!attachmentUrl) {
        results.push({ item: itemUrl, ok: false, problems: ["no spreadsheet attachment (press release or PDF-only publication)"] });
        continue;
      }
      // Refuse the item outright if its title describes a different
      // publication. Ingesting the data under a wrong citation is worse than
      // not ingesting it.
      const agree = titleAgreesWithAttachment(title, attachmentUrl);
      if (!agree.ok) {
        results.push({ item: itemUrl, ok: false, problems: [agree.problem] });
        continue;
      }
      const publishedAt = publicationDateFromUrl(attachmentUrl);

      // The newest item still points at the workbook we already hold, so there
      // is nothing to download. Checked AFTER the title/attachment agreement
      // test above, so a category we refused to ingest on citation grounds
      // cannot be skipped into looking settled.
      if (!deep) {
        const held = await heldPublication(dataDir, listing.id);
        if (held && held.attachmentUrl === attachmentUrl) {
          results.push({ item: itemUrl, ok: true, state: "unchanged", skipped: true, publishedAt, attachmentUrl, heldSheets: held.sheets });
          continue;
        }
      }

      const buf = await downloadAttachment(attachmentUrl);
      const { sheets, skipped } = extractWorkbook(readXlsx(buf));
      if (sheets.length === 0) {
        results.push({ item: itemUrl, ok: false, problems: [`no data tables found (${skipped.length} sheets skipped: ${skipped.slice(0, 3).join(", ")})`] });
        continue;
      }
      for (const sheet of sheets) {
        const problems = validateTable(sheet, publishedAt);
        if (problems.length) {
          results.push({ item: itemUrl, sheet: sheet.name, ok: false, problems });
          continue;
        }
        const doc = buildDocument({
          category: listing.id, title, sheetName: sheet.name, itemUrl, attachmentUrl, publishedAt, table: sheet, retrievedAt,
        });
        const base = path.join(dataDir, listing.id, slug(sheet.name));
        const state = await classifyChange(`${base}.json`, doc);
        if (state !== "unchanged") {
          await writeJson(path.join(base, "snapshots", `${publishedAt}.json`), doc);
        }
        await writeJson(`${base}.json`, doc);
        const obs = doc.series.reduce((a, s) => a + s.observations.filter((o) => o.value != null).length, 0);
        results.push({ item: itemUrl, sheet: sheet.name, ok: true, state, periods: doc.periods.length, series: doc.series.length, observations: obs, publishedAt });
      }
    } catch (e) {
      results.push({ item: itemUrl, ok: false, problems: [String(e.message ?? e)] });
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }

  // As on the ECCB side, only a clean pass earns a ledger entry.
  if (results.length && results.every((r) => r.ok)) {
    const ledger = await loadLedger(dataDir);
    const skipped = results.every((r) => r.skipped);
    noteCheck(ledger, listing.id, {
      checkedAt: retrievedAt,
      sourceStamp: results[0].publishedAt ?? null,
      window: null,
      action: skipped ? "skipped" : deep ? "deep-fetch" : "fetch",
      fetched: !skipped,
    });
    await saveLedger(dataDir, ledger);
  }
  return { category: listing.id, retrievedAt, results };
}

export { CBB_LISTINGS };
