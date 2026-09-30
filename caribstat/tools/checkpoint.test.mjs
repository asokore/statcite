// Tests for the incremental-skip decision.
//
// The thing under test is a decision to NOT fetch, which is a category of bug
// that hides rather than announces itself: a wrong skip looks exactly like a
// quiet day, and the pipeline would report "same" forever while the bank
// published freely. So these tests are weighted towards proving the skip
// REFUSES in every circumstance where it lacks grounds, not towards proving it
// works in the happy case.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadLedger, saveLedger, noteCheck, canSkip, ledgerAllowsContentSkip, windowKey } from "./checkpoint.mjs";
import { heldPublication } from "./cbb/ingest.mjs";
import { storedStampsAgree, storedContentAgrees } from "./eccb/ingest.mjs";

const KEY = "some-table/a";
const STAMP = "10 July 2026";
const WIN = windowKey(2015, 2026);

const ledgerWith = (over = {}) => ({
  entries: { [KEY]: { checked_at: "2026-08-14T00:00:00Z", source_stamp: STAMP, window: WIN, action: "fetch", ...over } },
});

test("skips when the stamp and the query window are both unchanged", () => {
  const v = canSkip(ledgerWith(), KEY, { liveStamp: STAMP, window: WIN });
  assert.equal(v.skip, true);
});

test("never skips a series it has no prior check for", () => {
  const v = canSkip({ entries: {} }, KEY, { liveStamp: STAMP, window: WIN });
  assert.equal(v.skip, false);
  assert.match(v.why, /no prior check/);
});

test("does not skip when the bank's stamp moved — that is the whole point", () => {
  const v = canSkip(ledgerWith(), KEY, { liveStamp: "28 July 2026", window: WIN });
  assert.equal(v.skip, false);
  assert.match(v.why, /republished/);
});

test("does not skip when the query window widened, even though the stamp is identical", () => {
  // The 135-false-CHANGED incident in changed.mjs is the mirror of this: the
  // window moved while the stamp stood still. Skipping here would quietly
  // serve a narrower extract than the operator asked for.
  const v = canSkip(ledgerWith(), KEY, { liveStamp: STAMP, window: windowKey(2015, 2027) });
  assert.equal(v.skip, false);
  assert.match(v.why, /window changed/);
});

test("does not skip when the live stamp could not be read", () => {
  // An unreadable stamp means the page shape may have changed. That is a
  // reason to look harder, never a reason to look away.
  const v = canSkip(ledgerWith(), KEY, { liveStamp: undefined, window: WIN });
  assert.equal(v.skip, false);
});

test("a skip does not advance last_full_fetch_at", () => {
  // Otherwise a run of skips would make a series look freshly re-read when no
  // one has actually pulled its numbers down for weeks.
  let l = noteCheck({ entries: {} }, KEY, { checkedAt: "2026-08-01T00:00:00Z", sourceStamp: STAMP, window: WIN, action: "fetch", fetched: true });
  l = noteCheck(l, KEY, { checkedAt: "2026-08-15T00:00:00Z", sourceStamp: STAMP, window: WIN, action: "skipped", fetched: false });
  assert.equal(l.entries[KEY].checked_at, "2026-08-15T00:00:00Z");
  assert.equal(l.entries[KEY].last_full_fetch_at, "2026-08-01T00:00:00Z");
});

test("an unreadable ledger reads as empty, so it costs a fetch and never a skip", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-ledger-"));
  try {
    await writeFile(path.join(dir, "_last_check.json"), "{ this is not json", "utf8");
    const l = await loadLedger(dir);
    assert.deepEqual(l.entries, {});
    assert.equal(canSkip(l, KEY, { liveStamp: STAMP, window: WIN }).skip, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the ledger round-trips through disk", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-ledger-"));
  try {
    await saveLedger(dir, ledgerWith());
    const back = await loadLedger(dir);
    assert.equal(back.entries[KEY].source_stamp, STAMP);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- the disk-level veto on the ECCB side ---------------------------------

const geos = [{ iso3: "AIA" }, { iso3: "ATG" }];
const def = { id: "tbl" };

async function seedEccb(dir, stamps) {
  for (const [iso3, raw] of Object.entries(stamps)) {
    const f = path.join(dir, "tbl", "a", `${iso3}.json`);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, JSON.stringify({ data_as_at_raw: raw, data_as_at: "2026-07-10", periods: ["2024"], series: [{ label: "x" }] }), "utf8");
  }
}

test("stored documents veto a skip when one geography is missing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-eccb-"));
  try {
    await seedEccb(dir, { AIA: STAMP }); // ATG absent
    const r = await storedStampsAgree(def, "a", geos, dir, STAMP);
    assert.equal(r.ok, false);
    assert.match(r.why, /ATG/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stored documents veto a skip when one geography holds a different stamp", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-eccb-"));
  try {
    await seedEccb(dir, { AIA: STAMP, ATG: "01 June 2026" });
    const r = await storedStampsAgree(def, "a", geos, dir, STAMP);
    assert.equal(r.ok, false);
    assert.match(r.why, /ATG/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("agreeing stored documents allow the skip and report what is held", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-eccb-"));
  try {
    await seedEccb(dir, { AIA: STAMP, ATG: STAMP });
    const r = await storedStampsAgree(def, "a", geos, dir, STAMP);
    assert.equal(r.ok, true);
    assert.equal(r.held.length, 2);
    assert.equal(r.held[0].periods, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- the stampless skip (ECCB withdrew "Data as at" in September 2026) ------
//
// With no stamp, a skip rests entirely on the live default rendering agreeing
// with what we hold. Each test below is a way that agreement could be faked
// or misread, and each must refuse.

const FULL = "2026-09-27T06:00:00.000Z";
const NOW = "2026-09-30T06:00:00.000Z";

test("the ledger gate refuses with no record, a moved window, or no full fetch", () => {
  assert.equal(ledgerAllowsContentSkip({ entries: {} }, KEY, { window: WIN, now: NOW }).ok, false);
  assert.equal(ledgerAllowsContentSkip(ledgerWith({ last_full_fetch_at: FULL }), KEY, { window: windowKey(2015, 2027), now: NOW }).ok, false);
  const never = ledgerAllowsContentSkip(ledgerWith(), KEY, { window: WIN, now: NOW });
  assert.equal(never.ok, false, "a ledger that never fetched has nothing to compare");
  assert.match(never.why, /no full fetch on record/, "refused for the right reason, not by accident of NaN arithmetic");
  const ok = ledgerAllowsContentSkip(ledgerWith({ last_full_fetch_at: FULL }), KEY, { window: WIN, now: NOW });
  assert.equal(ok.ok, true);
  assert.equal(ok.lastFullFetchAt, FULL, "the gate hands on the fetch the files must come from");
});

test("the ledger gate enforces the seven-day bound itself, not by trusting the deep run", () => {
  // A missed or failed Sunday deep run must turn Wednesday into a re-read.
  const e = ledgerWith({ last_full_fetch_at: "2026-09-20T13:36:47.441Z" });
  const v = ledgerAllowsContentSkip(e, KEY, { window: WIN, now: NOW });
  assert.equal(v.ok, false);
  assert.match(v.why, /older than/);
  assert.equal(ledgerAllowsContentSkip(e, KEY, { window: WIN, now: "2026-09-23T13:36:47.441Z" }).ok, true, "three days after a deep run is inside the bound");
  assert.equal(ledgerAllowsContentSkip(e, KEY, { window: WIN, now: "garbage" }).ok, false, "an unreadable clock is no licence to skip");
  assert.equal(ledgerAllowsContentSkip(e, KEY, { window: WIN, now: "2026-09-19T00:00:00Z" }).ok, false, "a full fetch dated in the future is corruption, not freshness");
});

const cgeos = [{ code: "1", iso3: "AIA" }, { code: "9", iso3: "XCU" }];
const LIVE = {
  periods: ["2024", "2025"],
  rows: [
    { label: "Total", unit: "EC$M", values: [10, 11] },
    { label: "Domestic", unit: "EC$M", values: [1, null] },
    { label: "Domestic", unit: "EC$M", values: [2, 3] },
  ],
};
// Stored documents hold an earlier period with a value, and a later period of
// our window padded with null, exactly as the real ECCB files do.
const storedFrom = (live, extraPeriod = "2023") => ({
  retrieved_at: FULL,
  periods: [extraPeriod, ...live.periods, "2026"],
  series: live.rows.map((r) => ({
    label: r.label, unit: r.unit,
    observations: [
      { period: extraPeriod, value: 99 },
      ...live.periods.map((p, i) => ({ period: p, value: r.values[i] ?? null })),
      { period: "2026", value: null },
    ],
  })),
});

async function seedContent(dir, docs) {
  for (const [iso3, doc] of Object.entries(docs)) {
    const f = path.join(dir, "tbl", "a", `${iso3}.json`);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, JSON.stringify(doc), "utf8");
  }
}

async function contentCase(docs, opts) {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-content-"));
  try {
    await seedContent(dir, docs);
    return await storedContentAgrees(def, "a", cgeos, dir, { liveTable: LIVE, defaultCountryCode: "9", lastFullFetchAt: FULL, ...opts });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("content skip: an agreeing live rendering allows it, and counts the cells it compared", async () => {
  const r = await contentCase({ AIA: storedFrom(LIVE), XCU: storedFrom(LIVE) });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.compared, 6);
  assert.equal(r.held.length, 2);
});

test("content skip: one revised value refuses it", async () => {
  const xcu = storedFrom(LIVE);
  xcu.series[2].observations[2].value = 3.01; // the second "Domestic", 2025
  const r = await contentCase({ AIA: storedFrom(LIVE), XCU: xcu });
  assert.equal(r.ok, false);
  assert.match(r.why, /Domestic.*2025/);
});

test("content skip: a dash that became a number (or the reverse) refuses it", async () => {
  const xcu = storedFrom(LIVE);
  xcu.series[1].observations[2].value = 0; // live has null for Domestic 2025
  assert.equal((await contentCase({ AIA: storedFrom(LIVE), XCU: xcu })).ok, false, "null and 0 are different claims");
});

test("content skip: a new period on the live page refuses it", async () => {
  // 2026 is stored as a null pad, so the bank publishing it shows as a value
  // where we hold null.
  const live = { periods: ["2024", "2025", "2026"], rows: LIVE.rows.map((r) => ({ ...r, values: [...r.values, 5] })) };
  const r = await contentCase({ AIA: storedFrom(LIVE), XCU: storedFrom(LIVE) }, { liveTable: live });
  assert.equal(r.ok, false);
  assert.match(r.why, /2026 is 5 live, null stored/);
  const beyond = { periods: ["2025", "2027"], rows: LIVE.rows.map((r) => ({ ...r, values: [r.values[1], 5] })) };
  const r2 = await contentCase({ AIA: storedFrom(LIVE), XCU: storedFrom(LIVE) }, { liveTable: beyond });
  assert.equal(r2.ok, false);
  assert.match(r2.why, /2027 is not in the stored document/);
});

test("content skip: a relabelled row with identical values refuses it", async () => {
  const xcu = storedFrom(LIVE);
  xcu.series[0].label = "Total Revenue";
  const r = await contentCase({ AIA: storedFrom(LIVE), XCU: xcu });
  assert.equal(r.ok, false);
  assert.match(r.why, /row 1/);
});

test("content skip: files not all written by the recorded full fetch refuse it", async () => {
  // Reproduced in review: a fetch that failed on one country still rewrote the
  // others, left the ledger alone, and the next run skipped on the fresh ECCU
  // file while the failed country stayed stale.
  const xcu = { ...storedFrom(LIVE), retrieved_at: "2026-09-30T06:00:00.000Z" };
  const r = await contentCase({ AIA: storedFrom(LIVE), XCU: xcu });
  assert.equal(r.ok, false);
  assert.match(r.why, /XCU was last written/);
  assert.equal((await contentCase({ AIA: storedFrom(LIVE), XCU: storedFrom(LIVE) }, { lastFullFetchAt: undefined })).ok, false);
  // Without the explicit veto, files that carry no retrieved_at would "match"
  // an absent lastFullFetchAt (undefined === undefined) and pass the tie.
  const untimed = (d) => { const { retrieved_at, ...rest } = d; return rest; };
  const r2 = await contentCase({ AIA: untimed(storedFrom(LIVE)), XCU: untimed(storedFrom(LIVE)) }, { lastFullFetchAt: undefined });
  assert.equal(r2.ok, false);
  assert.match(r2.why, /no full fetch on record/);
});

test("content skip: a stored stamp the live page no longer prints refuses it", async () => {
  // Otherwise files keep asserting the bank's withdrawn claim until a deep run.
  const aia = { ...storedFrom(LIVE), data_as_at: "2026-09-01", data_as_at_raw: "01 September 2026" };
  const r = await contentCase({ AIA: aia, XCU: storedFrom(LIVE) });
  assert.equal(r.ok, false);
  assert.match(r.why, /no longer prints/);
});

test("content skip: a live window that moved BACK past a stored value refuses it", async () => {
  // The bank withdrawing its latest period shows only as the page ending
  // earlier than our data does.
  const xcu = storedFrom(LIVE);
  xcu.series[0].observations[3].value = 12; // a real 2026 value
  const r = await contentCase({ AIA: storedFrom(LIVE), XCU: xcu });
  assert.equal(r.ok, false);
  assert.match(r.why, /past the live page's last period 2025/);
});

test("content skip: repeated labels are matched by position, so swapped rows refuse it", async () => {
  const xcu = storedFrom(LIVE);
  [xcu.series[1], xcu.series[2]] = [xcu.series[2], xcu.series[1]];
  assert.equal((await contentCase({ AIA: storedFrom(LIVE), XCU: xcu })).ok, false);
});

test("content skip: a changed unit or row count refuses it", async () => {
  const unit = storedFrom(LIVE);
  unit.series[0].unit = "US$M";
  assert.equal((await contentCase({ AIA: storedFrom(LIVE), XCU: unit })).ok, false);
  const extra = storedFrom(LIVE);
  extra.series.push({ label: "New row", unit: "EC$M", observations: [] });
  assert.equal((await contentCase({ AIA: storedFrom(LIVE), XCU: extra })).ok, false);
});

test("content skip: a missing geography file refuses it", async () => {
  const r = await contentCase({ XCU: storedFrom(LIVE) });
  assert.equal(r.ok, false);
  assert.match(r.why, /AIA/);
});

test("content skip: the page must name a geography this run holds", async () => {
  const docs = { AIA: storedFrom(LIVE), XCU: storedFrom(LIVE) };
  assert.equal((await contentCase(docs, { defaultCountryCode: undefined })).ok, false, "unstated is not ECCU");
  assert.equal((await contentCase(docs, { defaultCountryCode: "4" })).ok, false, "Grenada is not in this run");
});

test("content skip: it compares against the geography the page rendered, not the first file", async () => {
  // AIA agrees with the live page, XCU does not. The page rendered XCU (code
  // 9), so the skip must refuse even though a naive first-file check passes.
  const xcu = storedFrom(LIVE);
  xcu.series[0].observations[1].value = 999;
  assert.equal((await contentCase({ AIA: storedFrom(LIVE), XCU: xcu })).ok, false);
});

test("content skip: an unparsed live page refuses it", async () => {
  const docs = { AIA: storedFrom(LIVE), XCU: storedFrom(LIVE) };
  assert.equal((await contentCase(docs, { liveTable: undefined })).ok, false);
  assert.equal((await contentCase(docs, { liveTable: { periods: [], rows: [] } })).ok, false);
});

test("a skip records its basis, and a later fetch clears it", () => {
  let l = noteCheck({ entries: {} }, KEY, { checkedAt: "2026-09-30T00:00:00Z", sourceStamp: undefined, window: WIN, action: "skipped", fetched: false, basis: "content" });
  assert.equal(l.entries[KEY].basis, "content");
  assert.equal(l.entries[KEY].source_stamp, null);
  l = noteCheck(l, KEY, { checkedAt: "2026-10-04T00:00:00Z", sourceStamp: undefined, window: WIN, action: "deep-fetch", fetched: true });
  assert.equal(JSON.parse(JSON.stringify(l)).entries[KEY].basis, undefined);
});

// --- the CBB attachment key -----------------------------------------------

async function seedCbb(dir, urls) {
  for (const [name, attachment_url] of Object.entries(urls)) {
    const f = path.join(dir, "cat", `${name}.json`);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, JSON.stringify({ attachment_url }), "utf8");
  }
}

test("a category whose sheets agree on one attachment reports it, with the sheet count", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-cbb-"));
  try {
    await seedCbb(dir, { a: "https://cdn/x.xlsx", b: "https://cdn/x.xlsx" });
    const h = await heldPublication(dir, "cat");
    assert.equal(h.attachmentUrl, "https://cdn/x.xlsx");
    assert.equal(h.sheets, 2); // the count a skipped run reports instead of 0
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("disagreeing attachments refuse the shortcut", async () => {
  // A half-migrated category must be re-read, not assumed settled.
  const dir = await mkdtemp(path.join(tmpdir(), "cs-cbb-"));
  try {
    await seedCbb(dir, { a: "https://cdn/x.xlsx", b: "https://cdn/y.xlsx" });
    assert.equal(await heldPublication(dir, "cat"), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty or absent category directory refuses the shortcut", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-cbb-"));
  try {
    assert.equal(await heldPublication(dir, "nothing-here"), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
