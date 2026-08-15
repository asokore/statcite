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

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openListing, extractItemLinks, resolveAttachment, downloadAttachment, publicationDateFromUrl, titleAgreesWithAttachment, CBB_LISTINGS } from "./fetch.mjs";
import { readXlsx } from "../xlsx.mjs";
import { extractWorkbook } from "./tables.mjs";
import { compareWithExisting, classifyChange } from "../changed.mjs";

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
  const values = (table.series ?? []).flatMap((s) => s.observations.map((o) => o.value)).filter((v) => v != null);
  if (values.length === 0) problems.push("every cell parsed to null — the sheet layout or number format may have changed");
  // A 1900s date in a table published this decade is the year/serial collision
  // resurfacing. Fail loudly rather than emit Edwardian periods again.
  const antique = (table.periods ?? []).filter((p) => /^19[0-3]\d-/.test(p));
  if (antique.length) problems.push(`${antique.length} period(s) parsed into the 1900s (e.g. ${antique[0]}) — likely a year read as an Excel serial`);
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

/** Ingest the newest publication(s) for one CBB category. */
export async function ingestCategory(listing, { maxItems = 1, dataDir = DATA_DIR, gapMs = 1000 } = {}) {
  const retrievedAt = new Date().toISOString();
  const results = [];
  const session = await openListing(listing.path);
  const items = extractItemLinks(session.html, listing.path);
  if (items.length === 0) {
    return { category: listing.id, retrievedAt, results: [{ ok: false, problems: ["listing returned no items — it may be a hub of sub-categories, not a listing"] }] };
  }

  for (const itemUrl of items.slice(0, maxItems)) {
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
  return { category: listing.id, retrievedAt, results };
}

export { CBB_LISTINGS };
