#!/usr/bin/env node
// Coverage watch: what did the two banks publish that this pipeline does not
// collect?
//
//   node tools/watch.mjs              # read both sites, report, remember what was seen
//   node tools/watch.mjs --no-save    # report only, leave the state and reviews files alone
//
// WHY. The collectors answer "did a table we read change". They cannot answer
// "did the bank publish something we never read", because they only open the
// listings and tables they were built for. On 2026-11-03 the CBB's quarterly
// Review of Barbados' Economy (January-September 2026, posted 28 October, two
// PDFs under /news/economic-reviews) had been out for six days while every
// scheduled run reported "same": true of the 16 spreadsheet listings, and
// silent about everything else. The ECCB side has the same shape, 7 tables
// collected out of every table its statistics menu offers.
//
// What it reads:
//
//   CBB   Every /news/<listing> page it can reach, page 1 of each, plus pages
//         1-3 of the master /news feed. Neither the feed nor the sitemap is
//         enough on its own, both measured 2026-11-03: the feed carried no
//         item from any of the 16 collected listings in six weeks, and the
//         sitemap omits economic-reviews and gross-domestic-product. So the
//         start set is the sitemap, the collector's own listings and hubs and
//         the feed's categories, and every one-segment /news/ link found on a
//         listing page is followed.
//         An item in a listing we do not collect is reported. An item in one we
//         DO collect is reported when it is newer than every edition we hold
//         and is not one of them, because the collector takes only the newest
//         `families` editions and a new family would pass unseen.
//   ECCB  Every /statistics-category page reachable from /statistics, for the
//         tables on offer, and every /publications section, for documents. A
//         table not in the catalogue, or a document not seen before, is
//         reported.
//
// Limits, stated so they are not mistaken for coverage: page 1 of each CBB
// listing and of each ECCB publications section only, and documents must carry
// the bank's YYYY-MM-DD-HH-MM-SS upload stamp in the file name.
//
// An item stays in the report for REPEAT_DAYS after it is first seen, so a run
// that is repeated, or whose report never reached anyone, does not swallow it.
// The state file is caribstat/.watch/state.json, outside data/ so the publish
// step can never ship it. A read that fails, a page that yields nothing, or a
// card that cannot be parsed is reported as a failure and exits 1. An empty
// answer is never read as "nothing was published": that is the claim the
// collectors made and could not support.
//
// It also keeps data/reviews.json, the newest review and outlook per bank and
// geography. That file IS published: StatCite reads it to tell a caller when a
// series ends before a newer PDF review (A-063). It holds a title, a posting
// date, a link and the month the publication runs to, and never a figure from
// one. The sites show recent items only, so it is merged, never rebuilt, and an
// older item can never replace a newer one.

import { readFile, writeFile, mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CBB_LISTINGS, CBB_HUBS, openListing, fetchPage, publicationFamily, cardDate } from "./cbb/fetch.mjs";
import { TABLES, ECCB_GEOGRAPHIES } from "./eccb/catalogue.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
export const STATE_FILE = path.join(ROOT, ".watch", "state.json");
const DATA = path.join(ROOT, "data");
export const REVIEWS_FILE = path.join(DATA, "reviews.json");

const CBB = "https://www.centralbank.org.bb";
const ECCB = "https://www.eccb-centralbank.org";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// On the first run there is no memory of what was reported, so only the last
// BASELINE_DAYS of dated items are shown and everything older is recorded as
// seen. Without this the first report would be every item the sites carry.
export const BASELINE_DAYS = 45;
// The task runs Sunday and Wednesday, so eight days puts every item in at
// least two reports.
export const REPEAT_DAYS = 8;
const OLD = "0000-00-00";

// CBB categories that carry no statistics: payments marketing, personal
// finance, speeches, staff notices. Listed one line each without the URL, so a
// statistical item filed in the wrong place is still visible. General press
// releases are listed in full: the October 2026 Outlook with its GDP
// projection was one.
export const CBB_NON_STATISTICAL = new Set([
  "bimpay-blog", "bimpay-news", "bimpay-infographics", "bimpay-videos",
  "everyday-economics", "moneysmart-news", "blog-articles", "blog", "podcasts", "infographics", "videos",
  "speech", "general-press-release-speech", "lectures", "photo-album", "event", "human-resources-careers", "cbb-careers",
]);

/** The ingest's own card-date reader, so the two can never disagree on a card. */
export const cbbDate = cardDate;

const clean = (t) =>
  String(t ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ndash;|&#8211;|&mdash;|&#8212;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** One key per document, whichever of the bank's URL forms links it. */
export const keyOf = (url) => url.replace("/viewPDF/documents/", "/documents/").replace(/\/+$/, "").toLowerCase();

/**
 * Cards on a CBB listing or feed page. Returns the parsed items and how many
 * cards could not be read, so a change in the markup is a counted failure and
 * not a quiet drop.
 */
export function parseCbbNews(html) {
  const items = [];
  let unreadable = 0;
  for (const card of String(html).split(/class="-items"/).slice(1)) {
    // Read from the card's own Read More anchor only, as the ingest does, so
    // the last card on a page cannot borrow a footer link.
    const link = /<a\b(?=[^>]*\bclass="link")[^>]*\bhref="(?:https?:\/\/(?:www\.)?centralbank\.org\.bb)?(\/news\/([A-Za-z0-9-]+)\/[^"#?]+)[^"]*"/.exec(card);
    if (!link) {
      unreadable++;
      continue;
    }
    const rawDate = /class="date"[^>]*>([^<]*)</.exec(card)?.[1];
    items.push({
      bank: "cbb",
      url: CBB + link[1].replace(/\/+$/, ""),
      category: link[2].toLowerCase(),
      date: cbbDate(rawDate),
      rawDate: clean(rawDate),
      title: clean(/class="-ntitle"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1]),
    });
  }
  return { items, unreadable };
}

/** One-segment /news/<listing> links on a CBB page. */
export function parseCbbListingLinks(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/href="(?:https?:\/\/(?:www\.)?centralbank\.org\.bb)?\/news\/([A-Za-z0-9-]+)\/?"/g)) out.add(m[1].toLowerCase());
  return out;
}

/** /statistics-category links on an ECCB page: category slugs and category/table paths. */
export function parseEccbStatLinks(html) {
  const categories = new Set();
  const tables = new Set();
  for (const m of String(html).matchAll(/href="(?:https:\/\/www\.eccb-centralbank\.org)?\/statistics-category\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?(?:\/[amq])?\/?(?:[#?][^"]*)?"/g)) {
    if (m[2]) tables.add(`${m[1]}/${m[2]}`);
    else categories.add(m[1]);
  }
  return { categories, tables };
}

/** /publications section slugs linked from an ECCB page. */
export function parseEccbSections(html) {
  return new Set([...String(html).matchAll(/href="(?:https:\/\/www\.eccb-centralbank\.org)?\/publications\/([a-z0-9-]+)\/?"/g)].map((m) => m[1]));
}

/** ECCB documents, dated by the upload stamp the bank puts in every file name. */
export function parseEccbDocs(html, section) {
  const seen = new Map();
  for (const m of String(html).matchAll(/href="((?:https:\/\/www\.eccb-centralbank\.org)?\/(?:viewPDF\/)?documents\/((\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}-\d{2})-([^"]+?)\.(pdf|xlsx?|csv|docx?))"/gi)) {
    const url = m[1].startsWith("http") ? m[1] : ECCB + m[1];
    if (seen.has(keyOf(url))) continue;
    seen.set(keyOf(url), {
      bank: "eccb",
      url,
      category: section,
      date: `${m[3]}-${m[4]}-${m[5]}`,
      rawDate: m[2],
      title: decodeURIComponent(m[6]).replace(/[-_]+/g, " ").trim(),
    });
  }
  return [...seen.values()];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const month2 = (name) => String(MONTHS.indexOf(name.toLowerCase()) + 1).padStart(2, "0");

/** The last full quarter before a date, for a publication naming no period. */
export function lastFullQuarter(date) {
  const year = Number(date.slice(0, 4));
  const q = Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3;
  return q === 0 ? `${year - 1}-12` : `${year}-${String(q).padStart(2, "0")}`;
}

// Compact file-name text, as the ECCB spells it. "Vincent" and "Kitts" cover
// both the St and Saint forms.
const ECCB_REVIEW_GEOGRAPHIES = [
  ["AIA", "anguilla"], ["ATG", "antigua"], ["DMA", "dominica"], ["GRD", "grenada"],
  ["KNA", "kitts"], ["LCA", "lucia"], ["MSR", "montserrat"], ["VCT", "vincent"],
];

function eccbReview(it) {
  const t = it.title.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (/annex|summary/.test(t)) return null;
  const hits = ECCB_REVIEW_GEOGRAPHIES.filter(([, word]) => t.includes(word));
  if (hits.length > 1) return null;
  // Nearly every file name opens "ECCU EFR", member or not, so that prefix is
  // no evidence. The union's own report says ECCU again after it.
  const geography = hits[0]?.[0] ?? (t.replace(/eccu(?=a?efr)/, "").includes("eccu") ? "XCU" : null);
  if (!geography) return null;
  const name = ECCB_GEOGRAPHIES.find((g) => g.iso3 === geography)?.name ?? geography;
  // The file name is the only title the section gives, so the name is built.
  // Read on the spaced title: compacted, "Lucia EFR 2026" reads as AEFR 2026.
  const annual = /\baefr\s*(\d{4})/i.exec(it.title);
  if (annual) return { geography, covers_to: `${annual[1]}-12`, title: `Annual Economic and Financial Review ${annual[1]} (${name})` };
  const half = new RegExp(`efr(${MONTHS.join("|")})(\\d{4})`).exec(t);
  if (!half) return null;
  const label = half[1][0].toUpperCase() + half[1].slice(1);
  return { geography, covers_to: `${half[2]}-${month2(half[1])}`, title: `Economic and Financial Review, ${label} ${half[2]} (${name})` };
}

function cbbReview(it) {
  // The bank announces a release first: "Quarterly Review of Barbados' Economy
  // Coming October 28".
  if (/\b(?:up)?coming\b/i.test(it.title)) return null;
  const outlook =
    /^(?:the |updated )?(?:outlook for (?:the )?barbados['\u2019]?s? economy|barbados['\u2019]? economic outlook)\b/i.test(it.title) &&
    !CBB_NON_STATISTICAL.has(it.category);
  const listed = (it.category === "economic-reviews" || it.listing === "economic-reviews") && /\breview\b/i.test(it.title);
  // Until 2023 the reviews were filed as press releases. There the title must
  // open on the review and name its period, so a release about one does not pass.
  const released =
    it.category === "general-press-release" &&
    /^(?:central bank of barbados['\u2019]? )?review of (?:the )?(?:barbados['\u2019]? )?economy\b/i.test(it.title);
  if (!outlook && !listed && !released) return null;
  const review = listed || released;
  const part = /january\s*(?:-|\u2013|to)\s*(march|june|september|december)\s+(\d{4})/i.exec(it.title);
  const whole = /\b(?:in|for)\s+(\d{4})\b/i.exec(it.title);
  const named = review ? (part ? `${part[2]}-${month2(part[1])}` : whole ? `${whole[1]}-12` : null) : null;
  if (released && !listed && !outlook && !named) return null;
  // A period after the posting month is a misread title, not coverage.
  const covers_to = named && named <= it.date.slice(0, 7) ? named : lastFullQuarter(it.date);
  return { geography: "BRB", kind: outlook ? "outlook" : "review", covers_to, title: it.title };
}

/**
 * Whether a listed item is a review or outlook the notice can point to.
 * covers_to is the month the publication runs to. An item naming no period
 * takes the last full quarter before it was posted, so a monthly series that
 * is simply current is not flagged by every document posted after it.
 * Returns null for anything else, and for an undated item.
 */
export function reviewFrom(it) {
  if (!it.date) return null;
  if (it.bank === "cbb") {
    const r = cbbReview(it);
    return r && { bank: "CBB", ...r, posted: it.date, url: it.url };
  }
  if (it.bank === "eccb" && it.category === "economic-and-financial-review") {
    const r = eccbReview(it);
    // A period after the posting month is a misread name, and held as the
    // newest it would block every true review after it.
    if (!r || r.covers_to > it.date.slice(0, 7)) return null;
    return { bank: "ECCB", kind: "review", ...r, posted: it.date, url: it.url };
  }
  return null;
}

/** Likely reviews reviewFrom could not place, so a renamed title shows up. */
export function unplacedReviews(items) {
  const likely = (it) =>
    it.bank === "eccb"
      ? it.category === "economic-and-financial-review"
      : !CBB_NON_STATISTICAL.has(it.category) && it.category !== "book-reviews" && /\boutlook\b|\breview of\b/i.test(it.title);
  const seen = new Map();
  for (const it of items) if (likely(it) && !reviewFrom(it)) seen.set(keyOf(it.url), it);
  return [...seen.values()];
}

/** Whether a held entry is one this run could have written. */
export const validReview = (r) =>
  Boolean(r?.bank && r.geography && r.kind && r.title && r.url) &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(r.covers_to) &&
  /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(r.posted) &&
  r.covers_to <= r.posted.slice(0, 7);

const newerReview = (a, b) =>
  a.covers_to !== b.covers_to ? a.covers_to > b.covers_to : a.posted !== b.posted ? a.posted > b.posted : a.url > b.url;

/** The newest per bank, geography and kind, across the file and this run. */
export function mergeReviews(held, found) {
  const best = new Map();
  for (const r of [...held, ...found]) {
    const key = `${r.bank}|${r.geography}|${r.kind}`;
    if (!best.has(key) || newerReview(r, best.get(key))) best.set(key, r);
  }
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r);
}

/** The ECCB table paths the catalogue collects, in the same category/table form. */
export function collectedEccbTables(tables = TABLES, geographies = ECCB_GEOGRAPHIES) {
  const out = new Set();
  const strip = (u) => u.replace(/^https:\/\/www\.eccb-centralbank\.org\/statistics-category\//, "").replace(/\/$/, "");
  for (const def of tables) {
    if (def.path) out.add(def.path);
    if (def.perCountryUrl) for (const g of geographies) out.add(strip(def.perCountryUrl(g.iso3)));
  }
  return out;
}

/**
 * What to report.
 *
 *   items          parsed CBB cards and ECCB documents
 *   held           Map of collected CBB category -> { urls: Set, newest: "YYYY-MM-DD" | null,
 *                  byFamily?: Map of publication -> newest }. byFamily is set for a
 *                  listing that carries several publications, so a missed edition of
 *                  one is not hidden by a newer edition of the other.
 *   state          { first_seen: { key: date } } from the last run, or null on the first
 *
 * An uncollected item is reported. A collected-category item is reported only
 * when it is newer than every edition held and is not one of them. An item is
 * reported again on every run until REPEAT_DAYS after it was first seen. On a
 * first run a dated item older than BASELINE_DAYS is recorded, not reported.
 * An undated item is always reported: an unreadable date is a reason to look.
 */
export function decide({ items, offeredTables, held, collectedTables, state, today }) {
  const prior = state?.first_seen ?? {};
  const first = !state;
  const ago = (days) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const cutoff = ago(BASELINE_DAYS);
  const repeatFrom = ago(REPEAT_DAYS);
  const next = { ...prior };
  const report = [];
  const done = new Set();
  const shown = (key) => !(key in prior) || prior[key] >= repeatFrom;

  // One entry per document. A card met on a collected listing's page belongs
  // to that listing whatever path its link uses: since mid-2026 the CBB files
  // new editions under /news/statistics-1/ while showing them on the old
  // listing, so the URL's own category says nothing about who collects it.
  const merged = new Map();
  for (const it of items) {
    const key = keyOf(it.url);
    const was = merged.get(key);
    if (!was) merged.set(key, { ...it });
    else if (it.listing && held.has(it.listing) && !held.has(was.listing)) was.listing = it.listing;
  }
  const heldUrls = new Set([...held.values()].flatMap((h) => [...h.urls]));

  for (const it of merged.values()) {
    const key = keyOf(it.url);
    if (done.has(key)) continue;
    done.add(key);
    if (heldUrls.has(key)) continue;
    const h = it.bank === "cbb" ? held.get(it.listing) ?? held.get(it.category) : undefined;
    if (h) {
      if (h.urls.has(key)) continue;
      // A publication not held under its own name falls back to the listing's
      // newest date, so a slug variant is not reported as new whatever its age.
      const newest = h.byFamily?.get(publicationFamily(it.url)) ?? h.newest;
      if (it.date && newest && it.date <= newest) continue;
      it.collectedListing = true;
    }
    // The first-run baseline quietens old postings in listings nobody
    // collects. An edition of a collected table newer than every one held is
    // a missed edition, whatever its age, and is always listed. Review of
    // 2026-11-03.
    if (!(key in prior)) next[key] = first && !it.collectedListing && it.date && it.date < cutoff ? OLD : today;
    if (!shown(key) || next[key] === OLD) continue;
    report.push({ ...it, isNew: !(key in prior) });
  }

  const uncollected = [...offeredTables].filter((t) => !collectedTables.has(t)).sort();
  const newTables = first ? [] : uncollected.filter((t) => !(`table:${t}` in prior) || prior[`table:${t}`] >= repeatFrom);
  for (const t of uncollected) if (!(`table:${t}` in prior)) next[`table:${t}`] = first ? OLD : today;
  const missing = [...collectedTables].filter((t) => !offeredTables.has(t)).sort();
  report.sort((a, b) => (b.date ?? "9999").localeCompare(a.date ?? "9999") || a.url.localeCompare(b.url));
  return { report, uncollected, newTables, missing, first_seen: next };
}

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Editions held per collected CBB category, from the stored files' own source_url and published_at. */
async function readHeld() {
  const held = new Map(CBB_LISTINGS.map((l) => [l.id, { urls: new Set(), newest: null }]));
  for (const l of CBB_LISTINGS) {
    let files = [];
    try {
      files = (await readdir(path.join(DATA, "cbb", l.id))).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    const h = held.get(l.id);
    if ((l.families ?? 1) > 1) h.byFamily = new Map();
    for (const f of files) {
      try {
        const j = JSON.parse(await readFile(path.join(DATA, "cbb", l.id, f), "utf8"));
        if (j.source_url) h.urls.add(keyOf(j.source_url));
        if (j.published_at && (!h.newest || j.published_at > h.newest)) h.newest = j.published_at;
        const fam = j.source_url && h.byFamily && publicationFamily(j.source_url);
        if (fam && j.published_at && !(h.byFamily.get(fam) >= j.published_at)) h.byFamily.set(fam, j.published_at);
      } catch {
        // An unreadable stored file is the ingest's problem and its sentinels report it.
      }
    }
  }
  return held;
}

async function readCbb(failures, notes) {
  const items = [];
  const take = (where, html, listing) => {
    const r = parseCbbNews(html);
    items.push(...r.items.map((it) => (listing ? { ...it, listing } : it)));
    if (r.unreadable) failures.push(`cbb ${where}: ${r.unreadable} card(s) could not be parsed`);
    return r;
  };

  try {
    const session = await openListing("/news");
    if (take("/news page 1", session.html).items.length === 0) failures.push("cbb /news page 1: 0 cards, the page shape changed");
    for (const page of [2, 3]) {
      await pause(800);
      if (take(`/news page ${page}`, await fetchPage(session, page, "/news")).items.length === 0) failures.push(`cbb /news page ${page}: 0 cards`);
    }
  } catch (e) {
    failures.push(`cbb /news feed: ${e.message}`);
  }

  // A listing read as an `also` path of a collected table belongs to that table.
  const owner = new Map(CBB_LISTINGS.flatMap((l) => [[l.id, l.id], ...(l.also ?? []).map((p) => [p.replace(/^\/news\//, ""), l.id])]));
  const start = new Set([...owner.keys(), ...CBB_HUBS, ...items.map((i) => i.category)]);
  try {
    const xml = await get(`${CBB}/sitemap.xml`);
    for (const m of xml.matchAll(/<loc>\s*https:\/\/www\.centralbank\.org\.bb\/news\/([A-Za-z0-9-]+)\/?\s*<\/loc>/g)) start.add(m[1].toLowerCase());
  } catch (e) {
    failures.push(`cbb sitemap: ${e.message}`);
  }

  const queue = [...start];
  const done = new Set();
  const empty = [];
  while (queue.length && done.size < 200) {
    const slug = queue.shift();
    if (done.has(slug)) continue;
    done.add(slug);
    await pause(700);
    try {
      const html = await get(`${CBB}/news/${slug}`);
      const r = take(`/news/${slug}`, html, owner.get(slug) ?? slug);
      if (r.items.length === 0) empty.push(slug);
      for (const s of parseCbbListingLinks(html)) if (!done.has(s)) queue.push(s);
    } catch (e) {
      failures.push(`cbb /news/${slug}: ${e.message}`);
    }
  }
  if (queue.length) failures.push(`cbb listings: stopped at 200 pages with ${new Set(queue).size} unread`);
  for (const slug of owner.keys()) if (empty.includes(slug)) failures.push(`cbb /news/${slug}: a collected listing showed 0 cards`);
  notes.push(`cbb: ${done.size} listing pages read, ${empty.length} with no items of their own (hubs or empty)`);
  return items;
}

async function readEccb(failures, notes) {
  const offered = new Set();
  const docs = [];
  let root;
  try {
    root = await get(`${ECCB}/statistics`);
  } catch (e) {
    failures.push(`eccb /statistics: ${e.message}`);
    return { offered, docs };
  }
  const first = parseEccbStatLinks(root);
  for (const t of first.tables) offered.add(t);
  const queue = [...first.categories];
  const done = new Set();
  const bare = [];
  while (queue.length && done.size < 80) {
    const cat = queue.shift();
    if (done.has(cat)) continue;
    done.add(cat);
    await pause(600);
    try {
      const { categories, tables } = parseEccbStatLinks(await get(`${ECCB}/statistics-category/${cat}`));
      const own = [...tables].filter((t) => t.startsWith(`${cat}/`));
      if (own.length === 0) bare.push(cat);
      for (const t of tables) offered.add(t);
      for (const c of categories) if (!done.has(c)) queue.push(c);
    } catch (e) {
      failures.push(`eccb category ${cat}: ${e.message}`);
    }
  }
  if (queue.length) failures.push(`eccb categories: stopped at 80 pages with ${new Set(queue).size} unread`);
  if (offered.size === 0) failures.push("eccb categories: 0 tables found, the page shape changed");
  notes.push(`eccb: ${done.size} statistics categories read, ${bare.length} linking no table of their own${bare.length ? ` (${bare.join(", ")})` : ""}`);

  let sections = parseEccbSections(root);
  try {
    await pause(600);
    sections = new Set([...sections, ...parseEccbSections(await get(`${ECCB}/publications`))]);
  } catch (e) {
    failures.push(`eccb /publications: ${e.message}`);
  }
  const noDocs = [];
  for (const s of sections) {
    await pause(600);
    try {
      const found = parseEccbDocs(await get(`${ECCB}/publications/${s}`), s);
      if (found.length === 0) noDocs.push(s);
      docs.push(...found);
    } catch (e) {
      failures.push(`eccb publications ${s}: ${e.message}`);
    }
  }
  if (sections.size === 0) failures.push("eccb publications: 0 sections found, the page shape changed");
  else if (docs.length === 0) failures.push("eccb publications: 0 documents in any section, the page shape changed");
  if (noDocs.length) notes.push(`eccb: ${noDocs.length} publications section(s) with no stamped document on page 1: ${noDocs.join(", ")}`);
  return { offered, docs };
}

async function main() {
  const save = !process.argv.includes("--no-save");
  const failures = [];
  const notes = [];
  let state = null;
  let stateOk = true;
  try {
    state = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (!state || typeof state.first_seen !== "object") throw new Error("no first_seen map");
  } catch (e) {
    if (e.code !== "ENOENT") {
      failures.push(`state file ${STATE_FILE} unreadable (${e.message}); not overwritten, fix or remove it by hand`);
      stateOk = false;
    }
    state = null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const cbbItems = await readCbb(failures, notes);
  const { offered, docs } = await readEccb(failures, notes);
  const collectedTables = collectedEccbTables();
  const r = decide({ items: [...cbbItems, ...docs], offeredTables: offered, held: await readHeld(), collectedTables, state, today });

  let heldReviewsText = "";
  let heldReviews = [];
  let reviewsOk = true;
  try {
    heldReviewsText = await readFile(REVIEWS_FILE, "utf8");
    heldReviews = JSON.parse(heldReviewsText).reviews;
    if (!Array.isArray(heldReviews) || !heldReviews.every(validReview)) throw new Error("no valid reviews list");
  } catch (e) {
    heldReviews = [];
    if (e.code !== "ENOENT") {
      failures.push(`${REVIEWS_FILE} unreadable (${e.message}); not overwritten, fix or remove it by hand`);
      reviewsOk = false;
    }
  }
  const allItems = [...cbbItems, ...docs];
  const reviews = mergeReviews(heldReviews, allItems.map(reviewFrom).filter(Boolean));
  const unplaced = unplacedReviews(allItems);

  console.log(`WATCH ${today}${state ? "" : ` (first run: items older than ${BASELINE_DAYS} days recorded, not listed)`}`);
  for (const n of notes) console.log(`  ${n}`);
  const other = r.report.filter((it) => it.bank === "cbb" && CBB_NON_STATISTICAL.has(it.category));
  const listed = r.report.filter((it) => !other.includes(it));
  const tag = (it) => `${it.isNew ? "NEW " : "    "}${it.bank.padEnd(4)} ${(it.date ?? `date? "${it.rawDate}"`).padEnd(10)}  ${it.category.padEnd(28)}`;
  console.log(`\nPUBLISHED, NOT COLLECTED: ${listed.length} (listed for ${REPEAT_DAYS} days after first seen; NEW = first seen this run)`);
  for (const it of listed) console.log(`  ${tag(it)} ${it.title}${it.collectedListing ? "  [in a collected listing, newer than the edition held]" : ""}\n             ${it.url}`);
  if (other.length) {
    console.log(`\nNON-STATISTICAL CBB ITEMS: ${other.length}`);
    for (const it of other) console.log(`  ${tag(it)} ${it.title}`);
  }
  const byCat = new Map();
  for (const t of r.uncollected) byCat.set(t.split("/")[0], (byCat.get(t.split("/")[0]) ?? 0) + 1);
  console.log(`\nECCB TABLES ON OFFER, NOT COLLECTED: ${r.uncollected.length} (collected ${collectedTables.size - r.missing.length})`);
  for (const [c, n] of [...byCat].sort()) console.log(`  ${c}: ${n}`);
  if (r.newTables.length) {
    console.log(`\nNEW ECCB TABLES (first seen in the last ${REPEAT_DAYS} days): ${r.newTables.length}`);
    for (const t of r.newTables) console.log(`  ${t}`);
  }
  if (r.missing.length) {
    console.log(`\nCOLLECTED TABLES NO LONGER LINKED FROM THE MENU: ${r.missing.length}`);
    for (const t of r.missing) console.log(`  ${t}`);
  }
  console.log(`\nREVIEWS AND OUTLOOKS HELD FOR THE NOTICE: ${reviews.length}`);
  for (const x of reviews) console.log(`  ${x.bank.padEnd(4)} ${x.geography} ${x.kind.padEnd(7)} to ${x.covers_to}, posted ${x.posted}  ${x.title}`);
  for (const x of unplaced) console.log(`  NOT PLACED ${x.date} ${x.title}\n             ${x.url}`);
  if (failures.length) {
    console.log(`\nWATCH INCOMPLETE: ${failures.length} problem(s). What is above is partial, not "nothing new".`);
    for (const f of failures) console.log(`  FAIL ${f}`);
  }
  if (save && stateOk) {
    await mkdir(path.dirname(STATE_FILE), { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify({ version: 2, watched_at: new Date().toISOString(), first_seen: r.first_seen }, null, 2) + "\n");
  }
  // Written even after a partial read: a merge can only add what was seen.
  // No run date in the file, so a run that found nothing new publishes nothing.
  if (reviewsOk) {
    const text = JSON.stringify({ version: 1, reviews }, null, 2) + "\n";
    // Whole or not at all: a half-written file would stop the corpus publish.
    if (save && text !== heldReviewsText) {
      const tmp = path.join(path.dirname(STATE_FILE), "reviews.json.tmp");
      await mkdir(path.dirname(tmp), { recursive: true });
      await writeFile(tmp, text);
      await rename(tmp, REVIEWS_FILE);
    }
  }
  process.exit(failures.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
