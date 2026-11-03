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
  extractListingCards,
  extractAttachment,
  publicationDateFromUrl,
  extractTitle,
  titleAgreesWithAttachment,
  publicationFamily,
  slugEdition,
  CBB_LISTINGS,
  CBB_UNRESOLVED_CATEGORIES,
  CBB_HUBS,
} from "./fetch.mjs";
import { selectItems, validateTable, mergeCards, listingProblems, writeSheet } from "./ingest.mjs";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BOILERPLATE = `
  <a href="https://cdn.centralbank.org.bb/documents/2022-04-21-04-57-32-Government-of-Barbados-Tradeable-Bonds-FAQ-1.pdf">Bonds FAQ</a>
  <a href="https://cdn.centralbank.org.bb/documents/2022-04-21-04-58-39-Central-Bank-of-Barbados-Pensioner-Declaration-Form.pdf">Pensioner Form</a>
  <a href="https://cdn.centralbank.org.bb/documents/2022-04-21-08-38-22-Prospectus-GBSB-84-2017.pdf">Prospectus</a>
  <a href="https://cdn.centralbank.org.bb/documents/2022-04-21-10-59-08-CBB--FSC-Reg-Sandbox-Framework.pdf">Sandbox</a>`;

const ITEM_PAGE = `<html><head><meta name="csrf-token" content="TOKEN1234567890"><title>Selected Indicators | Central Bank of Barbados</title></head><body>
  ${BOILERPLATE}
  <a href="https://cdn.centralbank.org.bb/documents/2026-05-03-15-36-54-C2C4DCSystemFebruary2026.xlsx" data-viewtype="download">Download</a>
</body></html>`;

// Card markup as the CBB serves it (read 2026-11-03). The second card links
// under /news/statistics-1/ although it is shown on /news/statistics: that is
// how the newest editions of seven tables were filed from mid-2026.
const card = (date, href) =>
  `<div class="col-sm-6 col-lg-4 gap"> <div class="-items"> <div class="-textblock"> <div class="date-wrap"> <div class="date">${date}</div> </div> <div class="-ntitle"> t </div> <a href="${href}" class="link" title="Read More">Read More</a> </div> </div> </div>`;
const LISTING = `<html><head><meta name="csrf-token" content="LISTTOKEN"></head><body>
  <a href="https://www.centralbank.org.bb/news/statistics">Statistics</a>
  <a href="https://www.centralbank.org.bb/news/tourism/long-stay-arrivals">Other category, in the navigation</a>
  ${card("06 Jul 2026", "https://www.centralbank.org.bb/news/statistics/investments-provisional-2014-april-2026")}
  ${card("30 Sep 2026", "https://www.centralbank.org.bb/news/statistics-1/selected-indicators-of-depository-corporations-july-2026")}
  ${BOILERPLATE}
</body></html>`;

test("the CSRF token is read from the meta tag", () => {
  assert.equal(extractCsrfToken(ITEM_PAGE), "TOKEN1234567890");
  assert.equal(extractCsrfToken("<html>no token</html>"), undefined, "absent must be undefined, not empty string");
});

test("items are the listing's own cards, wherever their links point, and nothing else on the page", () => {
  const items = extractItemLinks(LISTING, "/news/statistics");
  assert.deepEqual(items, [
    "https://www.centralbank.org.bb/news/statistics/investments-provisional-2014-april-2026",
    "https://www.centralbank.org.bb/news/statistics-1/selected-indicators-of-depository-corporations-july-2026",
  ], "a card filed under another path is still this listing's item");
  assert.ok(!items.includes("https://www.centralbank.org.bb/news/statistics"), "the listing page is not one of its own items");
  assert.ok(!items.some((i) => i.includes("/news/tourism/")), "a link outside the cards is not an item");
  assert.deepEqual(extractListingCards(LISTING).map((c) => c.date), ["2026-07-06", "2026-09-30"]);
});

test("several listings merge newest first by card date, one listing keeps its own order", () => {
  const a = [{ url: "u/apr", date: "2026-07-06" }, { url: "u/feb", date: "2026-05-04" }];
  const b = [{ url: "u/jul", date: "2026-10-02" }, { url: "u/apr", date: "2026-07-06" }, { url: "u/x", date: null }];
  assert.deepEqual(mergeCards([a, b]), ["u/jul", "u/apr", "u/feb", "u/x"]);
  assert.deepEqual(mergeCards([[{ url: "late", date: "2026-01-01" }, { url: "early", date: "2026-09-01" }]]), ["late", "early"]);
});

test("two editions posted the same day on different pages merge by the edition they name", () => {
  const S = "https://www.centralbank.org.bb/news/statistics-1/";
  const first = [{ url: `${S}selected-indicators-of-depository-corporations-july-2026`, date: "2026-09-30" },
    { url: `${S}investments-provisional-2014-april-2026`, date: "2026-09-30" }];
  const also = [{ url: `${S}selected-indicators-of-depository-corporations-august-2026`, date: "2026-09-30" }];
  const merged = mergeCards([first, also]);
  assert.deepEqual(merged, [`${S}selected-indicators-of-depository-corporations-august-2026`,
    `${S}investments-provisional-2014-april-2026`, `${S}selected-indicators-of-depository-corporations-july-2026`],
    "August takes July's slot and the other publication keeps its place");
  const s = CBB_LISTINGS.find((l) => l.id === "statistics");
  assert.ok(selectItems(merged, s).includes(`${S}selected-indicators-of-depository-corporations-august-2026`));
  assert.ok(!selectItems(merged, s).some((u) => u.endsWith("-july-2026")));
});

test("a slug's edition is its last year and last month or quarter", () => {
  assert.equal(slugEdition("investments-provisional-2014-april-2026"), "2026-04");
  assert.equal(slugEdition("financial-soundness-indicators-2016q4-2026q1"), "2026-03");
  assert.equal(slugEdition("/news/statistics-1/trade-in-goods-june-2026-g1-g4"), "2026-06");
  assert.equal(slugEdition("annual-statistical-digest-2025"), "2025-00");
  assert.equal(slugEdition("exchange-rates"), "");
});

test("a card is read only from its own Read More link, in any URL form, and an unreadable card is counted", () => {
  const forms = [
    "http://www.centralbank.org.bb/news/statistics-1/a-june-2026",
    "https://centralbank.org.bb/news/Statistics-1/b-may-2026",
    "/news/statistics-1/c-april-2026?utm=x",
  ];
  const cards = extractListingCards(forms.map((h) => card("01 Jun 2026", h)).join(""));
  assert.deepEqual(cards.map((c) => c.url), [
    "https://www.centralbank.org.bb/news/statistics-1/a-june-2026",
    "https://www.centralbank.org.bb/news/Statistics-1/b-may-2026",
    "https://www.centralbank.org.bb/news/statistics-1/c-april-2026",
  ]);
  assert.equal(cards.unreadable, 0);
  // The last card has no news link. It must not borrow the navigation link after it.
  const html = card("02 Jun 2026", "/news/statistics/x-june-2026") +
    `<div class="-items"><div class="date">01 Jun 2026</div><a href="https://cdn.centralbank.org.bb/documents/f.pdf" class="link">PDF</a></div>` +
    `<a href="/news/tourism/long-stay-cruise-arrivals-june-2025">nav</a>`;
  const r = extractListingCards(html);
  assert.deepEqual(r.map((c) => c.url), ["https://www.centralbank.org.bb/news/statistics/x-june-2026"]);
  assert.equal(r.unreadable, 1, "the card that could not be read is counted, not dropped");
});

test("card dates in long, short and Sept forms are read", () => {
  const dates = ["27 October 2026", "30 Sept 2026", "06 Jul 2026", "5 May. 2026", "Oct 2026"];
  assert.deepEqual(extractListingCards(dates.map((d, i) => card(d, `/news/s/x-${i}`)).join("")).map((c) => c.date),
    ["2026-10-27", "2026-09-30", "2026-07-06", "2026-05-05", null]);
});

test("an also page with no cards, an unreadable card, or an undated card across pages stops the listing", () => {
  const ok = [{ url: "a", date: "2026-10-01" }];
  const empty = [];
  const bad = Object.assign([{ url: "b", date: "2026-09-01" }], { unreadable: 1 });
  const undated = [{ url: "c", date: null }];
  const paths = ["/news/statistics", "/news/also"];
  assert.deepEqual(listingProblems([ok, ok], paths), []);
  assert.deepEqual(listingProblems([undated], ["/news/one"]), [], "one listing keeps its own order, so an undated card is fine");
  assert.match(listingProblems([ok, empty], paths)[0], /\/news\/also showed 0 cards/);
  assert.match(listingProblems([bad, ok], paths)[0], /1 card\(s\) could not be read/);
  assert.match(listingProblems([ok, undated], paths)[0], /no readable date/);
});

test("an older edition never replaces the one held and goes to snapshots only", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cbb-older-"));
  try {
    const base = path.join(dir, "statistics", "loans-deposits");
    const doc = (at, v) => ({ published_at: at, periods: ["2026-01"], series: [{ id: "s", observations: [{ period: "2026-01", value: v }] }] });
    assert.equal(await writeSheet(base, doc("2026-10-27", 2)), "new");
    assert.equal(await writeSheet(base, doc("2026-05-04", 1)), "older-than-held");
    const current = JSON.parse(await readFile(`${base}.json`, "utf8"));
    assert.equal(current.published_at, "2026-10-27", "the newer file is still the current one");
    assert.ok((await readdir(path.join(base, "snapshots"))).includes("2026-05-04.json"), "the older edition is kept as history");
    assert.equal(await writeSheet(base, doc("2026-11-01", 3)), "republished", "a newer edition still replaces it");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an edition is newer by the period its figures reach, then by upload time", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cbb-order-"));
  try {
    const CDN = "https://cdn.centralbank.org.bb/documents/";
    // Figures to `last` (a later month is left empty, as workbooks do), uploaded at `stamp`.
    const doc = (last, stamp, v) => ({
      published_at: stamp.slice(0, 10), attachment_url: `${CDN}${stamp}-Book.xlsx`,
      periods: ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
      series: [{ id: "s", observations: ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((p) => ({ period: p, value: p <= last ? v : null })) }],
    });
    const base = path.join(dir, "cat", "sheet");
    const current = async () => JSON.parse(await readFile(`${base}.json`, "utf8"));
    assert.equal(await writeSheet(base, doc("2026-08", "2026-10-27-10-00-00", 8)), "new");
    assert.equal(await writeSheet(base, doc("2026-07", "2026-11-03-09-00-00", 7)), "older-than-held",
      "a correction to July uploaded after August does not roll the August edition back");
    assert.equal((await current()).series[0].observations[0].value, 8);
    assert.equal(await writeSheet(base, doc("2026-08", "2026-11-05-09-00-00", 81)), "republished", "a later upload of the same period is a correction and replaces it");
    assert.equal(await writeSheet(base, doc("2026-08", "2026-11-04-09-00-00", 80)), "older-than-held", "an earlier upload of the same period does not");
    assert.equal(await writeSheet(base, doc("2026-09", "2026-11-04-12-00-00", 9)), "republished",
      "September is accepted although its file was uploaded before the August correction");
    assert.equal((await current()).series[0].observations[0].value, 9);
    assert.equal(await writeSheet(base, doc("2026-09", "2026-11-04-12-00-00", 9)), "unchanged", "a deep re-read of the held upload is not refused");
    const reread = await writeSheet(base, doc("2026-08", "2026-11-04-12-00-00", 9));
    assert.ok(!["older-than-held", "unchanged"].includes(reread), `a re-read of the held upload that now ends earlier replaces it, got ${reread}`);
    assert.equal((await current()).series[0].observations[3].value, null, "the September value the re-read no longer holds is gone");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a card date must name a real month and a real day", () => {
  const dates = ["28 Octember 2026", "31 Feb 2026", "29 Feb 2028", "1 Ma 2026", "1 Mar 2026", "30&nbsp;Sept 2026", "28  Oct 2026"];
  assert.deepEqual(extractListingCards(dates.map((d, i) => card(d, `/news/s/x-${i}`)).join("")).map((c) => c.date),
    [null, null, "2028-02-29", null, "2026-03-01", "2026-09-30", "2026-10-28"]);
});

test("statistics reads both publications from every listing that shows them", () => {
  const s = CBB_LISTINGS.find((l) => l.id === "statistics");
  assert.equal(s.families, 2);
  assert.deepEqual(s.also, ["/news/investments-based-on-supplementary-schedules", "/news/selected-indicators-of-depository-corporations"]);
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

test("nothing unexplored is presented as a working listing", () => {
  // The original invariant: "not yet explored" must stay distinct from
  // "publishes nothing". Five category pages returned zero items and were
  // recorded as UNRESOLVED rather than empty.
  //
  // Those five were resolved on 2026-08-15: all are hubs, and their children
  // were recovered by subtracting the site-wide navigation. The invariant is
  // unchanged and now simply has nothing left to hold, so this asserts the
  // stronger fact instead — the hubs are still named, so a future probe knows
  // where to look, and none of them is ever served as a listing.
  assert.ok(CBB_LISTINGS.length >= 16, "the eight hub children are listings now");
  assert.deepEqual(CBB_UNRESOLVED_CATEGORIES, [], "nothing is unexplored");
  assert.ok(CBB_HUBS.includes("securities-tables"), "the hubs stay recorded");

  const listed = new Set(CBB_LISTINGS.map((l) => l.id));
  for (const hub of CBB_HUBS) {
    assert.ok(!listed.has(hub), `${hub} lists no items of its own and must not be a listing`);
  }
  for (const u of CBB_UNRESOLVED_CATEGORIES) {
    assert.ok(!listed.has(u), `${u} is unresolved and must not be presented as a working listing`);
  }
});

test("the two publications reachable by a second path are not listed twice", () => {
  // `selected-indicators-of-depository-corporations` and
  // `investments-based-on-supplementary-schedules` are children of a hub AND
  // are already carried by the `statistics` listing, which holds the newer
  // edition of each. Listing both routes would publish two vintages of one
  // series with no rule saying which wins.
  const listed = new Set(CBB_LISTINGS.map((l) => l.id));
  for (const dup of ["selected-indicators-of-depository-corporations", "investments-based-on-supplementary-schedules"]) {
    assert.ok(!listed.has(dup), `${dup} duplicates the statistics listing at an older edition`);
  }
  assert.ok(listed.has("statistics"), "the route that carries them must still be listed");
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
  // Stamps in the middle, as the CBB writes several slugs (2026-11-03).
  assert.equal(publicationFamily("trade-in-goods-june-2026-g1-g4"), "trade-in-goods-g1-g4");
  assert.equal(publicationFamily("trade-in-goods-may-2025-g1-g4"), "trade-in-goods-g1-g4");
  assert.equal(publicationFamily("exchange-rates-september-2026-e3-e4"), "exchange-rates-e3-e4");
  assert.equal(publicationFamily("loan-assets-and-deposit-liability-july-2026-b2c-b4d"), "loan-assets-and-deposit-liability-b2c-b4d");
  assert.equal(publicationFamily("financial-soundness-indicators-2016q4-2026q1"), "financial-soundness-indicators");
  assert.equal(publicationFamily("monetary-base-and-net-domestic-assets-december-2025-1"), "monetary-base-and-net-domestic-assets");
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

test("a period label the parser cannot read stops the document, but a footnote does not", () => {
  // Until 2026-09-19 nothing read unparsed_labels: `grep -rn unparsed_labels
  // server/src` returned nothing, and validateTable never looked at it. So an
  // unreadable period label deleted its observations and the document published
  // clean. Three holes were live when this was found.
  //
  // BOTH conditions are needed, and each one alone is wrong. Period-shape alone
  // fires on prose footnotes; value-bearing alone fires on "Basket Weights",
  // which is a real value-bearing skipped row on every RPI sheet in the corpus,
  // measured by re-extracting the workbook rather than assumed.
  const base = {
    periods: ["2025-01", "2025-03"],
    series: [{ label: "Stg", observations: [{ period: "2025-01", value: 2.01 }, { period: "2025-03", value: 2.03 }] }],
  };

  const fires = validateTable({ ...base, unparsed_value_rows: ["February2025"] }, "2026-08-01");
  assert.equal(fires.length, 1, JSON.stringify(fires));
  assert.match(fires[0], /silently deleted/);
  assert.match(fires[0], /February2025/);

  // Controls. A footnote that carried numbers is not a deleted observation.
  assert.deepEqual(validateTable({ ...base, unparsed_value_rows: ["Basket Weights"] }, "2026-08-01"), []);
  assert.deepEqual(validateTable({ ...base, unparsed_value_rows: ["Source: Barbados Statistical Service"] }, "2026-08-01"), []);
  // And a period-shaped label that carried NO numbers never reaches this list.
  // "April 2020*" marks a month the bank's own footnote says had no activity.
  assert.deepEqual(validateTable({ ...base, unparsed_labels: ["April 2020*"], unparsed_value_rows: [] }, "2026-08-01"), []);
  // A document from a parser that predates the field must not start failing.
  assert.deepEqual(validateTable(base, "2026-08-01"), []);

  // The other period shapes it must catch.
  for (const label of ["2019", "2019-Q3", "3Q 2019", "Feb.2025", "February 2025"]) {
    const p = validateTable({ ...base, unparsed_value_rows: [label] }, "2026-08-01");
    assert.equal(p.length, 1, `${label} should be caught: ${JSON.stringify(p)}`);
  }
});
