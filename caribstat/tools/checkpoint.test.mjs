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
import { loadLedger, saveLedger, noteCheck, canSkip, windowKey } from "./checkpoint.mjs";
import { heldPublication } from "./cbb/ingest.mjs";
import { storedStampsAgree } from "./eccb/ingest.mjs";

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
