// Coverage watch. The case that made it: the CBB's January-September 2026
// review sat under /news/economic-reviews for six days while every run said
// "same", because no collector reads that listing. These tests pin that an
// uncollected item is reported, that a collected listing still reports an
// edition newer than the one held, that a report survives a repeated run, and
// that an unreadable card is counted rather than dropped.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  cbbDate, parseCbbNews, parseCbbListingLinks, parseEccbStatLinks, parseEccbSections, parseEccbDocs,
  collectedEccbTables, decide, keyOf, CBB_NON_STATISTICAL, STATE_FILE, BASELINE_DAYS, REPEAT_DAYS,
} from "./watch.mjs";

// Card markup as the CBB serves it on /news (read 2026-11-03).
const card = (date, title, href) =>
  `<div class="col-sm-6 col-lg-4 gap" data-aos="zoom-in"> <div class="-items"> <div class="-textblock"> <div class="date-wrap"> <div class="date">${date}</div> </div> <div class="-ntitle"> ${title} </div> <div class="desc"> <p>…</p> </div> <a href="${href}" class="link" title="Read More">Read More</a> </div> </div> </div>`;

const REVIEW = "https://www.centralbank.org.bb/news/economic-reviews/economic-review-january-september-2026";
const FX_HELD = "https://www.centralbank.org.bb/news/exchange-rates-cbob/exchange-rates-september-2026-e3-e4";
const FEED = [
  card("28 Oct 2026", "Central Bank of Barbados&#039; Review of Barbados&#039; Economy: January-September 2026", REVIEW),
  card("05 Oct 2026", "Exchange Rates September 2026 (E3, E4)", FX_HELD),
  card("14 Sep 2026", "Exchange Rates August 2026 (E3, E4)", "https://www.centralbank.org.bb/news/exchange-rates-cbob/exchange-rates-august-2026-e3-e4"),
  card("Sometime", "Undated notice", "/news/general-press-release/undated-notice"),
].join("\n");

test("cbbDate reads the card date strictly", () => {
  assert.equal(cbbDate("28 Oct 2026"), "2026-10-28");
  assert.equal(cbbDate(" 5 Nov 2026 "), "2026-11-05");
  assert.equal(cbbDate("28 Octember 2026"), null);
  assert.equal(cbbDate("32 Oct 2026"), null);
  assert.equal(cbbDate(""), null);
});

test("parseCbbNews reads date, title, category and URL from each card", () => {
  const { items, unreadable } = parseCbbNews(FEED);
  assert.equal(unreadable, 0);
  assert.equal(items.length, 4);
  assert.deepEqual(items[0], {
    bank: "cbb",
    url: REVIEW,
    category: "economic-reviews",
    date: "2026-10-28",
    rawDate: "28 Oct 2026",
    title: "Central Bank of Barbados' Review of Barbados' Economy: January-September 2026",
  });
  assert.equal(items[3].url, "https://www.centralbank.org.bb/news/general-press-release/undated-notice");
  assert.equal(items[3].date, null);
});

test("parseCbbNews counts a card it cannot read instead of dropping it", () => {
  const odd = card("01 Nov 2026", "Direct file", "https://cdn.centralbank.org.bb/documents/x.pdf");
  const { items, unreadable } = parseCbbNews(FEED + odd);
  assert.equal(items.length, 4);
  assert.equal(unreadable, 1);
});

test("parseCbbNews accepts http, no www, and a query on the item link", () => {
  const { items } = parseCbbNews(card("01 Nov 2026", "x", "http://centralbank.org.bb/news/economic-reviews/a-review?ref=1"));
  assert.equal(items[0].url, "https://www.centralbank.org.bb/news/economic-reviews/a-review");
});

test("parseCbbListingLinks finds one-segment listings, not items", () => {
  const html = `<a href="https://www.centralbank.org.bb/news/economic-reviews">a</a> <a href="/news/statistics-news/">b</a> <a href="${REVIEW}">c</a>`;
  assert.deepEqual([...parseCbbListingLinks(html)].sort(), ["economic-reviews", "statistics-news"]);
});

test("parseEccbStatLinks separates categories from category/table paths", () => {
  const html = `
    <a href="https://www.eccb-centralbank.org/statistics-category/national-accounts">x</a>
    <a href="/statistics-category/external-sector">x</a>
    <a href="https://www.eccb-centralbank.org/statistics-category/national-accounts/gross-value-added-by-economic-activity-in-current-prices/a">x</a>
    <a href="https://www.eccb-centralbank.org/statistics-category/monetary-and-financial-statistics/summarized-monetary-survey/a#interactive-database">x</a>
    <a href="https://www.eccb-centralbank.org/publications/annual-report">x</a>`;
  const { categories, tables } = parseEccbStatLinks(html);
  assert.deepEqual([...categories].sort(), ["external-sector", "national-accounts"]);
  assert.deepEqual([...tables].sort(), [
    "monetary-and-financial-statistics/summarized-monetary-survey",
    "national-accounts/gross-value-added-by-economic-activity-in-current-prices",
  ]);
  assert.deepEqual([...parseEccbSections(html)], ["annual-report"]);
});

test("parseEccbDocs dates each document from the upload stamp, any case, any of its URL forms", () => {
  const html = `
    <a href="https://www.eccb-centralbank.org/viewPDF/documents/2026-09-24-13-11-29-Saint-Lucia-EFR-June-2026.PDF">a</a>
    <a href="https://www.eccb-centralbank.org/documents/2026-09-24-13-11-29-Saint-Lucia-EFR-June-2026.PDF">same file</a>
    <a href="/documents/2026-10-30-14-09-22-Communique-of-the-114th-Meeting.pdf">b</a>
    <a href="/documents/2026-10-01-09-00-00-Data-Tables.xlsx">c</a>`;
  const docs = parseEccbDocs(html, "communique");
  assert.equal(docs.length, 3);
  assert.equal(docs[0].date, "2026-09-24");
  assert.equal(docs[0].title, "Saint Lucia EFR June 2026");
  assert.equal(docs[1].url, "https://www.eccb-centralbank.org/documents/2026-10-30-14-09-22-Communique-of-the-114th-Meeting.pdf");
  assert.equal(docs[2].title, "Data Tables");
  assert.equal(keyOf(docs[0].url), keyOf("https://www.eccb-centralbank.org/documents/2026-09-24-13-11-29-Saint-Lucia-EFR-June-2026.PDF"));
});

test("collectedEccbTables covers path tables and every per-country table", () => {
  const tables = [
    { id: "a", path: "public-sector-debt/total-public-sector-debt" },
    { id: "b", perCountryUrl: (iso3) => `https://www.eccb-centralbank.org/statistics-category/other-real-sector/consumer-price-index-${iso3.toLowerCase()}` },
  ];
  const got = collectedEccbTables(tables, [{ iso3: "AIA" }, { iso3: "ATG" }]);
  assert.deepEqual([...got].sort(), [
    "other-real-sector/consumer-price-index-aia",
    "other-real-sector/consumer-price-index-atg",
    "public-sector-debt/total-public-sector-debt",
  ]);
});

const DOC = { bank: "eccb", url: "https://www.eccb-centralbank.org/documents/2026-10-30-14-09-22-Communique.pdf", category: "communique", date: "2026-10-30", rawDate: "", title: "Communique" };
const base = (over = {}) => ({
  items: [...parseCbbNews(FEED).items, DOC],
  offeredTables: new Set(["public-sector-debt/total-public-sector-debt", "national-accounts/gva-current"]),
  held: new Map([["exchange-rates-cbob", { urls: new Set([keyOf(FX_HELD)]), newest: "2026-10-05" }]]),
  collectedTables: new Set(["public-sector-debt/total-public-sector-debt"]),
  state: { first_seen: {} },
  today: "2026-11-03",
  ...over,
});
const cats = (r) => r.report.map((i) => i.category);

test("the uncollected review and ECCB document are reported, the held exchange-rate editions are not", () => {
  const r = decide(base());
  assert.ok(cats(r).includes("economic-reviews"));
  assert.ok(cats(r).includes("communique"));
  assert.ok(!cats(r).includes("exchange-rates-cbob"), "an edition held, or older than the newest held, is not reported");
});

test("a collected listing reports an edition newer than every one held", () => {
  const newer = card("04 Nov 2026", "Exchange Rates October 2026 (E3, E4)", "https://www.centralbank.org.bb/news/exchange-rates-cbob/exchange-rates-october-2026-e3-e4");
  const r = decide(base({ items: parseCbbNews(FEED + newer).items }));
  const fx = r.report.filter((i) => i.category === "exchange-rates-cbob");
  assert.equal(fx.length, 1);
  assert.equal(fx[0].collectedListing, true);
});

test("a card filed under another path belongs to the collected listing it was shown on", () => {
  const DCS = "https://www.centralbank.org.bb/news/statistics-1/depository-corporation-survey-august-2026";
  const held = new Map([["depository-corporations-survey", { urls: new Set([keyOf(DCS)]), newest: "2026-10-27" }]]);
  const feedCopy = { bank: "cbb", url: DCS, category: "statistics-1", date: "2026-10-27", rawDate: "", title: "DCS August 2026" };
  assert.equal(decide(base({ items: [feedCopy], held })).report.length, 0, "a held edition is not reported, whatever path it sits under");
  const JULY = { ...feedCopy, url: DCS.replace("august", "july"), date: "2026-09-30" };
  const onListing = { ...JULY, listing: "depository-corporations-survey" };
  assert.equal(decide(base({ items: [JULY, onListing], held })).report.length, 0, "an older edition shown on the collected listing is not reported");
  const SEPT = { ...feedCopy, url: DCS.replace("august", "september"), date: "2026-11-02" };
  const r = decide(base({ items: [SEPT, { ...SEPT, listing: "statistics-news" }, { ...SEPT, listing: "depository-corporations-survey" }], held }));
  assert.equal(r.report.length, 1);
  assert.equal(r.report[0].collectedListing, true, "a newer edition is flagged as missed by its collected listing");
});

test("on a two-publication listing, each publication is judged against its own newest held edition", () => {
  const S = "https://www.centralbank.org.bb/news/statistics-1/";
  const IND = `${S}selected-indicators-of-depository-corporations-august-2026`;
  const INV = `${S}investments-provisional-2014-june-2026`;
  const held = new Map([["statistics", {
    urls: new Set([keyOf(IND), keyOf(INV)]),
    newest: "2026-10-27",
    byFamily: new Map([["selected-indicators-of-depository-corporations", "2026-10-27"], ["investments-provisional", "2026-09-01"]]),
  }]]);
  const missed = { bank: "cbb", url: `${S}investments-provisional-2014-july-2026`, category: "statistics-1", listing: "statistics", date: "2026-10-02", rawDate: "", title: "Investments July 2026" };
  const r = decide(base({ items: [missed], held }));
  assert.equal(r.report.length, 1, "a missed investments edition is not hidden by the newer indicators date");
  const oldInd = { ...missed, url: IND.replace("august", "july"), date: "2026-09-30" };
  assert.equal(decide(base({ items: [oldInd], held })).report.length, 0, "an older indicators edition is still quiet");
  const variant = { ...missed, url: `${S}investments-based-on-supplementary-schedules-march-2026`, date: "2026-04-10" };
  assert.equal(decide(base({ items: [variant], held })).report.length, 0, "a publication not held by name falls back to the listing's newest date");
});

test("a card's link is read from its Read More anchor, never from a link after the card", () => {
  const html = `<div class="-items"><div class="date">01 Nov 2026</div><div class="-ntitle">PDF only</div><a href="https://cdn.centralbank.org.bb/documents/x.pdf" class="link">Read</a></div>` +
    `<footer><a href="/news/tourism/long-stay-cruise-arrivals-june-2025">Tourism</a></footer>`;
  const r = parseCbbNews(html);
  assert.equal(r.items.length, 0);
  assert.equal(r.unreadable, 1, "the card is counted unreadable rather than given the footer's link");
});

test("an undated item is reported, on a first run too", () => {
  assert.ok(decide(base()).report.some((i) => i.date === null));
  assert.ok(decide(base({ state: null })).report.some((i) => i.date === null));
});

test("a repeated run still lists an item until REPEAT_DAYS after it was first seen", () => {
  const first = decide(base());
  const again = decide(base({ state: { first_seen: first.first_seen } }));
  assert.ok(cats(again).includes("economic-reviews"), "the same day, a second run must not swallow it");
  assert.equal(again.report.find((i) => i.category === "economic-reviews").isNew, false);
  const later = new Date(Date.parse("2026-11-03T00:00:00Z") + (REPEAT_DAYS + 1) * 86400000).toISOString().slice(0, 10);
  const gone = decide(base({ state: { first_seen: first.first_seen }, today: later }));
  assert.ok(!cats(gone).includes("economic-reviews"), "after REPEAT_DAYS it drops out");
});

test("an item met twice in one run is reported once", () => {
  const twice = parseCbbNews(FEED + card("28 Oct 2026", "dup", REVIEW)).items;
  const r = decide(base({ items: twice }));
  assert.equal(r.report.filter((i) => i.url === REVIEW).length, 1);
});

test("first run lists only the baseline window and records the rest as never to be listed", () => {
  const old = card("01 Jan 2025", "Old review", "https://www.centralbank.org.bb/news/economic-reviews/old-review");
  const r = decide(base({ items: parseCbbNews(FEED + old).items, state: null }));
  assert.ok(!r.report.some((i) => i.title === "Old review"));
  const key = keyOf("https://www.centralbank.org.bb/news/economic-reviews/old-review");
  assert.ok(key in r.first_seen);
  assert.ok(!decide(base({ items: parseCbbNews(old).items, state: { first_seen: r.first_seen } })).report.length, "nor on the next run");
  assert.ok(cats(r).includes("economic-reviews"), "a recent one still is");
  const edge = new Date(Date.parse("2026-11-03T00:00:00Z") - BASELINE_DAYS * 86400000).toISOString().slice(0, 10);
  assert.ok(decide(base({ items: [{ ...DOC, date: edge }], state: null })).report.length === 1, "the cutoff day itself is listed");
});

test("a first run still lists a missed edition of a collected table, however old", () => {
  const missed = "https://www.centralbank.org.bb/news/exchange-rates-cbob/exchange-rates-july-2026-e3-e4";
  const held = new Map([["exchange-rates-cbob", { urls: new Set([keyOf(FX_HELD)]), newest: "2026-07-30" }]]);
  const items = parseCbbNews(card("01 Sep 2026", "Exchange Rates July 2026 (E3, E4)", missed)).items;
  const r = decide(base({ items, held, state: null }));
  assert.ok("2026-09-01" < new Date(Date.parse("2026-11-03T00:00:00Z") - BASELINE_DAYS * 86400000).toISOString().slice(0, 10), "the card predates the baseline window");
  assert.equal(r.report.filter((i) => i.url === missed).length, 1);
  assert.equal(r.first_seen[keyOf(missed)], "2026-11-03");
  assert.equal(decide(base({ items, held, state: { first_seen: r.first_seen } })).report.length, 1, "and on the next run");
});

test("tables: uncollected listed, new ones flagged after the first run, a vanished collected table named", () => {
  const first = decide(base({ state: null }));
  assert.deepEqual(first.uncollected, ["national-accounts/gva-current"]);
  assert.deepEqual(first.newTables, [], "no table is new on a first run");
  const next = decide(base({
    state: { first_seen: first.first_seen },
    offeredTables: new Set(["national-accounts/gva-current", "national-accounts/gva-constant"]),
  }));
  assert.deepEqual(next.newTables, ["national-accounts/gva-constant"]);
  assert.deepEqual(next.missing, ["public-sector-debt/total-public-sector-debt"]);
});

test("statistical categories are not on the non-statistical list", () => {
  for (const c of ["economic-reviews", "general-press-release", "statement-of-condition", "economic-press-release", "quarterly-economic-release", "statistics-news", "financial-stability-report"]) {
    assert.ok(!CBB_NON_STATISTICAL.has(c), `${c} must be listed in full`);
  }
});

test("the state file lives outside data/, where the publish step cannot ship it", () => {
  assert.ok(!STATE_FILE.split(path.sep).includes("data"), STATE_FILE);
  assert.ok(STATE_FILE.endsWith(path.join("caribstat", ".watch", "state.json")), STATE_FILE);
});
