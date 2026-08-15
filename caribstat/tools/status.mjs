#!/usr/bin/env node
// What do we already hold, and how far behind today is it?
//
//   node tools/status.mjs           # both sources
//   node tools/status.mjs --json    # machine-readable
//
// This answers the question a scheduled collector cannot answer from its own
// run log: not "did anything change today" but "what is the newest period we
// have, per series, and when did we last confirm it". Those are different
// questions and the second one is the one that tells you whether a source has
// gone quiet on you.
//
// The LAG column is descriptive, not a verdict. A table showing 14 months of
// lag may be perfectly current — several CBB workbooks are annual series that
// genuinely have not been republished since 2022, and the balance-of-payments
// tables end in 2017 because that is where the bank's own published series
// ends. Lag is evidence to look at, never a failure on its own. Calling it one
// would manufacture alarms out of sources behaving exactly as they always have.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadLedger } from "./checkpoint.mjs";

const DATA = path.resolve(process.cwd(), "data");
const asJson = process.argv.includes("--json");
const today = new Date().toISOString().slice(0, 10);

const readJson = async (f) => JSON.parse(await readFile(f, "utf8"));
const listJson = async (dir) => {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && d.name.endsWith(".json")).map((d) => d.name);
  } catch {
    return [];
  }
};
const listDirs = async (dir) => {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name !== "snapshots").map((d) => d.name);
  } catch {
    return [];
  }
};

/**
 * Newest period that actually HOLDS A VALUE.
 *
 * Not the newest column. Asking ECCB for --end 2026 returns columns through
 * December 2026 whether or not the bank has published those months yet, so a
 * monthly table sits there with six entirely-null future columns. Reporting
 * the newest column would have this inventory claim coverage through 2026-12
 * when the real data stops in June, which is precisely the kind of
 * better-than-reality reading this pipeline exists to refuse. An empty column
 * is not data.
 *
 * Normalised periods (YYYY, YYYY-Qn, YYYY-MM) sort lexicographically within one
 * frequency, so max-by-string is exact and does not rely on source ordering.
 */
function newestPeriod(doc) {
  const withData = new Set();
  for (const s of doc.series ?? []) {
    for (const o of s.observations ?? []) {
      if (o?.value != null && o.period != null) withData.add(o.period);
    }
  }
  return withData.size ? [...withData].sort().at(-1) : undefined;
}

/** Whole months between a period label and today. Returns undefined rather
 * than a guess for a label we cannot date, including the YYYY-MM-DD labels the
 * CBB tourism sheet produces for dates that are neither month-start nor
 * month-end (see the note in the report footer). */
function monthsBehind(period) {
  if (!period) return undefined;
  let y, m;
  let mm = /^(\d{4})$/.exec(period);
  if (mm) { y = +mm[1]; m = 12; }
  else if ((mm = /^(\d{4})-Q([1-4])$/.exec(period))) { y = +mm[1]; m = +mm[2] * 3; }
  else if ((mm = /^(\d{4})-(\d{2})$/.exec(period))) { y = +mm[1]; m = +mm[2]; }
  else if ((mm = /^(\d{4})-(\d{2})-\d{2}$/.exec(period))) { y = +mm[1]; m = +mm[2]; }
  else return undefined;
  const now = new Date();
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
}

const rows = [];

// --- ECCB: data/eccb/<table>/<freq>/<ISO3>.json ---------------------------
const eccbDir = path.join(DATA, "eccb");
const eccbLedger = await loadLedger(eccbDir);
for (const table of await listDirs(eccbDir)) {
  for (const freq of await listDirs(path.join(eccbDir, table))) {
    const dir = path.join(eccbDir, table, freq);
    const files = await listJson(dir);
    if (!files.length) continue;
    let newest, stamp, geos = 0;
    for (const f of files) {
      const doc = await readJson(path.join(dir, f));
      geos++;
      const p = newestPeriod(doc);
      if (p && (!newest || p > newest)) newest = p;
      const s = doc.data_as_at;
      if (s && (!stamp || s > stamp)) stamp = s;
    }
    const led = eccbLedger.entries[`${table}/${freq}`] ?? {};
    rows.push({
      source: "eccb", unit: table, freq, members: geos,
      newest_period: newest, source_stamp: stamp,
      last_checked: led.checked_at?.slice(0, 10), last_action: led.action,
      last_full_fetch: led.last_full_fetch_at?.slice(0, 10),
      months_behind: monthsBehind(newest),
    });
  }
}

// --- CBB: data/cbb/<category>/<sheet>.json --------------------------------
const cbbDir = path.join(DATA, "cbb");
const cbbLedger = await loadLedger(cbbDir);
for (const category of await listDirs(cbbDir)) {
  const files = await listJson(path.join(cbbDir, category));
  if (!files.length) continue;
  let newest, pub;
  for (const f of files) {
    const doc = await readJson(path.join(cbbDir, category, f));
    const p = newestPeriod(doc);
    if (p && (!newest || p > newest)) newest = p;
    if (doc.published_at && (!pub || doc.published_at > pub)) pub = doc.published_at;
  }
  const led = cbbLedger.entries[category] ?? {};
  rows.push({
    source: "cbb", unit: category, freq: "-", members: files.length,
    newest_period: newest, source_stamp: pub,
    last_checked: led.checked_at?.slice(0, 10), last_action: led.action,
    last_full_fetch: led.last_full_fetch_at?.slice(0, 10),
    months_behind: monthsBehind(newest),
  });
}

if (asJson) {
  console.log(JSON.stringify({ generated_at: new Date().toISOString(), today, rows }, null, 2));
  process.exit(0);
}

console.log(`CaribStat inventory — today is ${today}\n`);
const pad = (s, n) => String(s ?? "-").slice(0, n).padEnd(n);
const lpad = (s, n) => String(s ?? "-").slice(0, n).padStart(n);
for (const src of ["eccb", "cbb"]) {
  const mine = rows.filter((r) => r.source === src);
  if (!mine.length) continue;
  console.log(src.toUpperCase());
  console.log(`  ${pad("table / category", 36)} ${pad("fq", 2)} ${lpad("n", 3)} ${pad("newest", 10)} ${lpad("lag", 4)} ${pad("source stamp", 12)} ${pad("checked", 10)} action`);
  for (const r of mine.sort((a, b) => a.unit.localeCompare(b.unit) || a.freq.localeCompare(b.freq))) {
    const lag = r.months_behind == null ? "-" : `${r.months_behind}m`;
    console.log(`  ${pad(r.unit, 36)} ${pad(r.freq, 2)} ${lpad(r.members, 3)} ${pad(r.newest_period, 10)} ${lpad(lag, 4)} ${pad(r.source_stamp, 12)} ${pad(r.last_checked, 10)} ${r.last_action ?? "-"}`);
  }
  console.log("");
}
console.log("lag = whole months between the newest period held and today. Descriptive only:");
console.log("several of these series are genuinely not republished more often than that.");
