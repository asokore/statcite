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
  CBB_LISTINGS,
  CBB_UNRESOLVED_CATEGORIES,
} from "./fetch.mjs";

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
