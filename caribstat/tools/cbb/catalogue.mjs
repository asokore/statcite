#!/usr/bin/env node
// Print the CBB half of StatCite's CARIBSTAT_CATALOGUE, generated from the
// data that actually exists.
//
// WHY. The catalogue drives search, and search builds a series id from the
// FIRST sheet it lists: `caribstat/CBB/{table}/{sheets[0]}`. Those sheet names
// were written by hand and were wrong — `real-gdp`, `tourism`, `unemployment`
// against the real `real-gdp-2010-prices`, `h1-processing`, `table-i5` — so
// every CBB suggestion search made returned HTTP 422 when followed. A
// recommendation that cannot be fetched is worse than no recommendation,
// because the caller blames their own request.
//
// It also covered 5 of 16 categories, so eleven were unreachable by search.
//
//   node tools/cbb/catalogue.mjs
//
// Paste the output into CARIBSTAT_CATALOGUE in
// server/src/adapters/caribstat.ts, replacing the CBB entries.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA = path.resolve("data", "cbb");

// Search topics per category. These are editorial: they are the words a person
// would type, which no amount of reading the data can tell you.
const TOPICS = {
  "balance-of-payments-reports": ["balance of payments", "bop", "current account", "capital account", "trade balance"],
  "gross-domestic-product": ["gdp", "growth", "output", "sectors", "real gdp"],
  "inflation-and-retail-price-index": ["inflation", "retail price index", "rpi", "prices", "cost of living"],
  tourism: ["tourism", "arrivals", "visitors", "cruise", "long stay"],
  "labour-statistics": ["labour", "labor", "unemployment", "employment", "jobs", "wages"],
  "the-wages-index": ["wages", "wage index", "earnings", "pay"],
  "index-of-industrial-production": ["industrial production", "manufacturing", "output", "iip"],
  statistics: ["investments", "depository corporations", "monetary authorities", "bank investments"],
  "international-reserves": ["international reserves", "foreign reserves", "monetary base", "net domestic assets"],
  "commercial-banks-deposit-liabilities": ["deposit liabilities", "commercial banks", "loan assets", "bank deposits"],
  "commercial-banks-provisional-deposit-liabilities": ["provisional deposits", "commercial banks", "deposit liabilities"],
  "depository-corporations-survey": ["depository corporations", "broad money", "domestic claims", "money supply"],
  "financial-soundness-indicators": ["financial soundness", "capital adequacy", "fsi", "deposit takers", "bank stability"],
  "interest-rates": ["interest rate", "treasury bill", "bank rate", "lending rate", "deposit rate"],
  "exchange-rates-cbob": ["exchange rate", "currency", "fx", "barbados dollar"],
  "trade-in-goods-barbados": ["trade in goods", "imports", "exports", "re-exports", "merchandise trade"],
};

// Where a table's canonical entry point is obvious, name it. Search builds its
// id from the FIRST sheet listed, and "widest sheet" is a poor proxy for "the
// one a person means": the balance-of-payments standard summary is the answer
// to "Barbados balance of payments", not the financial-account balances.
const PREFERRED = {
  "balance-of-payments-reports": "standard-summary",
  "gross-domestic-product": "real-gdp-2016-prices",
  "inflation-and-retail-price-index": "inflation",
};

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";

function cleanTitle(raw, fallback) {
  return String(raw ?? fallback)
    .replace(/\s*\(.*?\)\s*$/, "")
    .replace(/\s+\d{4}.*$/, "")
    .replace(new RegExp(`\\s*[-–]?\\s*(${MONTHS})\\s*$`, "i"), "")
    .replace(/\s*[-–,]\s*$/, "")
    .trim();
}

const entries = [];
for (const category of readdirSync(DATA).sort()) {
  const dir = path.join(DATA, category);
  if (!statSync(dir).isDirectory()) continue;
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ slug: f.slice(0, -5), doc: JSON.parse(readFileSync(path.join(dir, f), "utf8")) }))
    // Longest series first, so the id search hands out is the meatiest sheet
    // in the table rather than whichever sorted first.
    .sort((a, b) => (b.doc.series?.length ?? 0) - (a.doc.series?.length ?? 0));
  if (!docs.length) continue;

  const title = cleanTitle(docs[0].doc.publication_title, category);
  const preferred = PREFERRED[category];
  const order = preferred && docs.some((d) => d.slug === preferred)
    ? [preferred, ...docs.map((d) => d.slug).filter((x) => x !== preferred)]
    : docs.map((d) => d.slug);
  const head = docs.find((d) => d.slug === order[0]) ?? docs[0];
  const sampleRow = head.doc.series?.find((s) => s.label)?.label ?? "";
  entries.push({
    table: category,
    title,
    sheets: order,
    sampleRow,
    topics: TOPICS[category] ?? [category.replace(/-/g, " ")],
  });
}

// Also write a MANIFEST of the real sheet ids, committed into the server test
// fixtures. Without it, a test can only check that a catalogue sheet name is
// slug-SHAPED, which the wrong names all were: "real-gdp" looks perfectly
// valid and does not exist. The manifest is what makes "does this id resolve"
// answerable offline, and it is only identifiers, not the banks' data.
const manifestPath = path.resolve("..", "server", "test", "fixtures", "cbb-sheets.json");
const manifest = Object.fromEntries(entries.map((e) => [e.table, e.sheets]));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.error(`manifest written: ${manifestPath}`);

for (const e of entries) {
  console.log("  {");
  console.log(`    provider: "CBB", table: ${JSON.stringify(e.table)}, title: ${JSON.stringify(e.title)},`);
  console.log(`    sheets: ${JSON.stringify(e.sheets)},`);
  console.log(`    sampleRow: ${JSON.stringify(e.sampleRow)},`);
  console.log(`    topics: ${JSON.stringify(e.topics)},`);
  console.log("  },");
}
console.error(`\n${entries.length} CBB categories, ${entries.reduce((a, e) => a + e.sheets.length, 0)} sheets.`);
