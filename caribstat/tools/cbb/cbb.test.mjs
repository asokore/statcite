// CBB discovery tests.
//
// Fixtures are trimmed copies of real CBB markup captured 2026-08-13. The one
// that matters is ITEM_PAGE: every item page on this site carries the SAME six
// site-wide footer PDFs (bond FAQ, pensioner form, prospectus, three sandbox
// documents) alongside the real attachment. A "first document link" rule
// downloads a pensioner declaration form and files it as statistics.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractCsrfToken,
  extractItemLinks,
  extractAttachment,
  publicationDateFromUrl,
  extractTitle,
  titleAgreesWithAttachment,
  publicationFamily,
  CBB_LISTINGS,
  CBB_UNRESOLVED_CATEGORIES,
} from "./fetch.mjs";
import { selectItems, validateTable } from "./ingest.mjs";

const BOILERPLATE = `
  <a href="https://cdn.centralbank.org.bb/documents/2022-04-21-04-57-32-Government-of-Barbados-Tradeable-Bonds-FAQ-1.pdf">Bonds FAQ</a>
  <a href="https://cdn.centralbank.org.bb/documents/2022-04-21-04-58-39-Central-Bank-of-Barbados-Pensioner-Declaration-Form.pdf">Pensioner Form</a>
  <a href="https://cdn.centralbank.org.bb/documents/2022-04-21-08-38-22-Prospectus-GBSB-84-2017.pdf">Prospectus</a>
  <a href="https://cdn.centralbank.org.bb/documents/2022-04-21-10-59-08-CBB--FSC-Reg-Sandbox-Framework.pdf">Sandbox</a>`;

const ITEM_PAGE = `<html><head><meta name="csrf-token" content="TOKEN1234567890"><title>Selected Indicators | Central Bank of Barbados</title></head><body>
  ${BOILERPLATE}
  <a href="https://cdn.centralbank.org.bb/documents/2026-05-03-15-36-54-C2C4DCSystemFebruary2026.xlsx" data-viewtype="download">Download</a>
</body></html>`;

const LISTING = `<html><head><meta name="csrf-token" content="LISTTOKEN"></head><body>
  <a href="https://www.centralbank.org.bb/news/statistics/investments-provisional-2014-april-2026">Investments</a>
  <a href="https://www.centralbank.org.bb/news/statistics/selected-indicators-of-depository-corporations-february-2026">Indicators</a>
  <a href="https://www.centralbank.org.bb/news/statistics">Statistics</a>
  <a href="https://www.centralbank.org.bb/news/tourism/long-stay-arrivals">Other category</a>
  ${BOILERPLATE}
</body></html>`;

test("the CSRF token is read from the meta tag", () => {
  assert.equal(extractCsrfToken(ITEM_PAGE), "TOKEN1234567890");
  assert.equal(extractCsrfToken("<html>no token</html>"), undefined, "absent must be undefined, not empty string");
});

test("item links are scoped to their listing and exclude the listing itself", () => {
  const items = extractItemLinks(LISTING, "/news/statistics");
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.includes("/news/statistics/")));
  assert.ok(!items.includes("https://www.centralbank.org.bb/news/statistics"), "the listing page is not one of its own items");
  assert.ok(!items.some((i) => i.includes("/news/tourism/")), "another category's items must not leak in");
});

test("THE ATTACHMENT TRAP: the spreadsheet wins over the boilerplate PDFs", () => {
  // The six footer PDFs appear before the real file in the document order, so
  // "first CDN document link" returns a pensioner declaration form.
  const url = extractAttachment(ITEM_PAGE);
  assert.equal(url, "https://cdn.centralbank.org.bb/documents/2026-05-03-15-36-54-C2C4DCSystemFebruary2026.xlsx");
  assert.ok(!/Pensioner|Prospectus|Sandbox|FAQ/i.test(url), "a boilerplate PDF must never be mistaken for data");
});

test("an item with no spreadsheet returns undefined, not a PDF", () => {
  // Honest absence: some item pages are press releases with no data file, and
  // handing back a sandbox PDF would be worse than returning nothing.
  const noData = `<html>${BOILERPLATE}</html>`;
  assert.equal(extractAttachment(noData), undefined);
});

test("xls and csv attachments are recognised, not just xlsx", () => {
  // Labour statistics publishes .xls; the reader must not be xlsx-only at the
  // discovery layer or a whole category silently disappears.
  const xls = `<a href="https://cdn.centralbank.org.bb/documents/2024-09-06-09-53-12-I5LABOUR1975Q12024.xls">x</a>`;
  assert.match(extractAttachment(xls), /\.xls$/);
  const csv = `<a href="https://cdn.centralbank.org.bb/documents/2024-01-01-00-00-00-Series.csv">x</a>`;
  assert.match(extractAttachment(csv), /\.csv$/);
});

test("the publication date comes from the CDN filename prefix", () => {
  // CBB has no "Data as at" stamp like ECCB. The filename timestamp is the
  // closest thing the source gives, and it is the SOURCE's date — never ours.
  assert.equal(
    publicationDateFromUrl("https://cdn.centralbank.org.bb/documents/2026-05-03-15-36-54-C2C4DCSystemFebruary2026.xlsx"),
    "2026-05-03",
  );
  assert.equal(publicationDateFromUrl("https://cdn.centralbank.org.bb/documents/no-timestamp.xlsx"), undefined,
    "an unparseable name must not become an invented date");
  assert.equal(publicationDateFromUrl(undefined), undefined);
});

test("the catalogue records unresolved categories rather than calling them empty", () => {
  // Five category pages returned zero items when probed. They are almost
  // certainly hubs of sub-categories, like the GDP/inflation/labour page which
  // links 60 sub-paths and lists no items of its own. Recording them as
  // UNRESOLVED keeps "not yet explored" distinct from "publishes nothing".
  assert.ok(CBB_LISTINGS.length >= 8);
  assert.ok(CBB_UNRESOLVED_CATEGORIES.includes("securities-tables"));
  const listed = new Set(CBB_LISTINGS.map((l) => l.id));
  for (const u of CBB_UNRESOLVED_CATEGORIES) {
    assert.ok(!listed.has(u), `${u} is unresolved and must not be presented as a working listing`);
  }
});

// --- the title is the citation, so it has to describe the right release ----
//
// Live on 2026-08-14: the item page for the JUNE 2025 tourism release carried
// <title>Long Stay & Cruise Arrivals December 2023</title> and a matching
// og:title, while its <h1> and its attachment (H1LongStayCruiseJune2025.xlsx)
// both said June 2025. CBB's CMS had carried the previous release's title
// forward. Reading <title> put eighteen-month-old provenance on current data.

const STALE_TITLE_PAGE = `
  <html><head><title>Long Stay &amp; Cruise Arrivals December 2023</title>
  <meta property="og:title" content="Long Stay &amp; Cruise Arrivals December 2023"></head>
  <body><h2>Navigation</h2>
  <h1>Long Stay &amp; Cruise Arrivals June 2025</h1>
  <a href="https://cdn.centralbank.org.bb/documents/2025-09-16-15-18-59-H1LongStayCruiseJune2025.xlsx">data</a>
  ${BOILERPLATE}</body></html>`;

const DASH_SUFFIX_PAGE = `
  <html><head><title>Balance of Payments (BOP) 1967 - 2017 - Central Bank of Barbados</title></head>
  <body><h1>Balance of Payments (BOP) 1967 - 2017</h1></body></html>`;

test("the title comes from the h1, not a stale <title>", () => {
  assert.equal(extractTitle(STALE_TITLE_PAGE), "Long Stay & Cruise Arrivals June 2025");
});

test("the site-name suffix is stripped in both the pipe and dash forms", () => {
  // Only the pipe form was handled before, so every dash-form title carried
  // "- Central Bank of Barbados" into the citation's dataset field.
  assert.equal(
    extractTitle("<html><head><title>Wages Index 2018 | Central Bank of Barbados</title></head><body></body></html>"),
    "Wages Index 2018",
  );
  assert.equal(extractTitle(DASH_SUFFIX_PAGE), "Balance of Payments (BOP) 1967 - 2017");
  // The fallback path has to strip it too, since that is where it came from.
  assert.equal(
    extractTitle("<html><head><title>Wages Index 2018 - Central Bank of Barbados</title></head><body></body></html>"),
    "Wages Index 2018",
  );
});

test("a title describing a different year is rejected, not ingested", () => {
  const bad = titleAgreesWithAttachment(
    "Long Stay & Cruise Arrivals December 2023",
    "https://cdn.centralbank.org.bb/documents/2025-09-16-15-18-59-H1LongStayCruiseJune2025.xlsx",
  );
  assert.equal(bad.ok, false, "the real historical defect must fail the check");
  assert.match(bad.problem, /2023.*2025|stale/i);

  const good = titleAgreesWithAttachment(
    "Long Stay & Cruise Arrivals June 2025",
    "https://cdn.centralbank.org.bb/documents/2025-09-16-15-18-59-H1LongStayCruiseJune2025.xlsx",
  );
  assert.equal(good.ok, true);
});

test("the CDN date prefix is not mistaken for the period the workbook covers", () => {
  // Every attachment URL starts with its publication timestamp. Counting that
  // as a year would make a 2023 publication of 2018 data look like a mismatch
  // and refuse a perfectly good release.
  const r = titleAgreesWithAttachment(
    "Wages Index 2018",
    "https://cdn.centralbank.org.bb/documents/2023-08-23-14-05-36-I7WagesIndex2018.xlsx",
  );
  assert.equal(r.ok, true, "the 2023 in the CDN prefix must be ignored");
});

test("a title or filename with no year is not treated as a mismatch", () => {
  assert.equal(titleAgreesWithAttachment("Monetary Survey", "https://cdn.centralbank.org.bb/documents/2026-01-01-00-00-00-Survey.xlsx").ok, true);
  assert.equal(titleAgreesWithAttachment("", "").ok, true);
});

// --- one listing can carry two different publications --------------------
//
// Found 2026-08-14 by listing the item slugs per category instead of assuming
// every listing behaved like tourism. The statistics listing holds commercial
// bank investments AND selected indicators of depository corporations, so
// "take the newest item" silently discarded a whole publication rather than
// merely serving a stale edition of it.

test("an edition stamp is stripped from a slug, the publication name is not", () => {
  assert.equal(publicationFamily("long-stay-cruise-arrivals-june-2025"), "long-stay-cruise-arrivals");
  assert.equal(publicationFamily("long-stay-cruise-arrivals-december-2023"), "long-stay-cruise-arrivals");
  assert.equal(publicationFamily("labour-statistics-1975-2023-q1-2024"), "labour-statistics");
  assert.equal(publicationFamily("wages-index-2017-1"), "wages-index");
  assert.equal(
    publicationFamily("https://www.centralbank.org.bb/news/statistics/investments-provisional-2014-april-2026"),
    "investments-provisional",
    "a full URL resolves to the same family as its slug",
  );
  // The distinction the whole change rests on: these two must NOT collapse.
  assert.notEqual(
    publicationFamily("investments-provisional-2014-april-2026"),
    publicationFamily("selected-indicators-of-depository-corporations-february-2026"),
  );
});

test("a listing of repeated editions still yields exactly one item", () => {
  // The regression guard: seven of the eight listings must behave as before.
  const editions = [
    "long-stay-cruise-arrivals-june-2025",
    "long-stay-cruise-arrivals-december-2023",
    "long-stay-cruise-arrivals-june-2023",
  ];
  assert.deepEqual(selectItems(editions, { id: "tourism" }, 1), [editions[0]]);
  assert.deepEqual(selectItems(editions, { id: "tourism" }, 2), editions.slice(0, 2), "--max-items still deepens history");
});

test("a listing declaring two publications yields the newest of each", () => {
  const items = [
    "investments-provisional-2014-april-2026",
    "selected-indicators-of-depository-corporations-february-2026",
  ];
  assert.deepEqual(selectItems(items, { id: "statistics", families: 2 }, 1), items);
  // Without the declaration the second publication is lost, which is the bug.
  assert.deepEqual(selectItems(items, { id: "statistics" }, 1), [items[0]]);
});

test("the statistics listing is the only one declaring more than one publication", () => {
  // If a future listing starts mixing publications this test does not fail,
  // but it does record what was true when the rule was written.
  const declared = CBB_LISTINGS.filter((l) => (l.families ?? 1) > 1).map((l) => l.id);
  assert.deepEqual(declared, ["statistics"]);
});

test("a sheet whose axis misses most of its rows is REFUSED", () => {
  // The guard that would have stopped today's worst defect from publishing.
  // The depository-corporations sheets were read off the wrong column and
  // dated 87 of 230 numeric rows. Values and labels were correct, so nothing
  // value-shaped could see it; coverage could.
  const bad = {
    periods: ["2012-01"],
    series: [{ label: "X", observations: [{ period: "2012-01", value: 1 }] }],
    axis_coverage: 0.38,
  };
  const problems = validateTable(bad, "2026-05-03");
  assert.ok(problems.length > 0, "38% coverage must fail");
  assert.match(problems[0], /38%|wrong one/);
});

test("the worst real sheet still passes the coverage gate", () => {
  // Calibration: measured across every CBB sample workbook, correctly-read
  // sheets score 0.87 to 1.00. The gate sits at 0.60 so the real low-water
  // mark has room, and a sheet that skips most of its rows still fails.
  const ok = {
    periods: ["2012-01"],
    series: [{ label: "X", observations: [{ period: "2012-01", value: 1 }] }],
    axis_coverage: 0.87,
  };
  assert.deepEqual(validateTable(ok, "2026-05-03"), []);
});
