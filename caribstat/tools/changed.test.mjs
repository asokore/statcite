// Change classification when a source prints NO currency stamp.
//
// ECCB withdrew its "Data as at" line in September 2026. The stamp rule in
// classifyChange then compared undefined with undefined, called them equal, and
// would have labelled every genuine revision "our-query-changed". These tests
// pin the content rule that replaces it, and check that the stamped path the
// CBB side relies on did not move.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyChange, QUIET_STATES } from "./changed.mjs";

const STAMPED = {
  source_id: "eccb",
  table_id: "tbl",
  data_as_at: "2026-09-01",
  data_as_at_raw: "01 September 2026",
  retrieved_at: "2026-09-20T13:00:00Z",
  periods: ["2024", "2025"],
  series: [
    { label: "Total", unit: "EC$M", observations: [{ period: "2024", value: 10 }, { period: "2025", value: 11 }] },
    { label: "Domestic", unit: "EC$M", observations: [{ period: "2024", value: 1 }, { period: "2025", value: null }] },
  ],
};

const stampless = (doc) => {
  const { data_as_at, data_as_at_raw, ...rest } = structuredClone(doc);
  return { ...rest, retrieved_at: "2026-09-30T12:00:00Z" };
};

const withPeriod = (doc, p, v = 5) => {
  const d = structuredClone(doc);
  d.periods = [...d.periods, p];
  for (const s of d.series) s.observations.push({ period: p, value: v });
  return d;
};

// The stored window reached 2025, the new one reaches 2026: exactly what adding
// a 2026 period needs as an excuse, and nothing more.
const MOVED = { windowBefore: "2015..2025", windowAfter: "2015..2026" };

async function classify(stored, fresh, opts) {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-changed-"));
  try {
    const file = path.join(dir, "doc.json");
    await writeFile(file, JSON.stringify(stored), "utf8");
    return await classifyChange(file, fresh, opts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the stamp disappearing on identical content is named, and writes no snapshot", async () => {
  assert.equal(await classify(STAMPED, stampless(STAMPED)), "stamp-withdrawn");
  assert.ok(QUIET_STATES.has("stamp-withdrawn"), "a withdrawn stamp is not a new vintage");
});

test("a stamp coming back on identical content is named too, and is not news", async () => {
  assert.equal(await classify(stampless(STAMPED), STAMPED), "stamp-restored");
  assert.ok(QUIET_STATES.has("stamp-restored"));
});

test("a revised value with no stamp on either side is a republication", async () => {
  const before = stampless(STAMPED);
  const after = structuredClone(before);
  after.series[0].observations[1].value = 11.5;
  assert.equal(await classify(before, after), "republished", "undefined === undefined must not excuse a real revision");
  assert.equal(await classify(before, after, MOVED), "republished", "a moved window cannot excuse a changed value either");
});

test("a revised value in the same run that dropped the stamp is a republication", async () => {
  const after = stampless(STAMPED);
  after.series[1].observations[1].value = 0; // was a dash
  assert.equal(await classify(STAMPED, after), "republished");
});

test("a new period that OUR window move explains is our query, not the bank", async () => {
  const before = stampless(STAMPED);
  assert.equal(await classify(before, withPeriod(before, "2026"), MOVED), "our-query-changed");
});

test("a new period with no window move, or an unknown one, is the bank adding a period", async () => {
  const before = stampless(STAMPED);
  const after = withPeriod(before, "2026");
  assert.equal(await classify(before, after, { windowBefore: "2015..2026", windowAfter: "2015..2026" }), "republished");
  assert.equal(await classify(before, after), "republished", "an unknown window is no excuse");
  assert.equal(await classify(before, after, { windowAfter: "2015..2026" }), "republished", "no recorded prior window is no excuse");
});

test("a window move excuses only the periods it can account for", async () => {
  // Found in review: excusing ANY period change because the window moved at
  // all let a bank-added period ride on an unrelated window change.
  const before = stampless(STAMPED);
  const inside = withPeriod(before, "2023"); // the old window already asked for 2023
  assert.equal(await classify(before, inside, MOVED), "republished");
  const quarterly = withPeriod(before, "2026-Q1");
  assert.equal(await classify(before, quarterly, MOVED), "our-query-changed", "the year prefix is what the window covers");
  const narrowed = structuredClone(before);
  narrowed.periods = ["2025"];
  for (const s of narrowed.series) s.observations = s.observations.filter((o) => o.period === "2025");
  assert.equal(await classify(before, narrowed, { windowBefore: "2015..2025", windowAfter: "2025..2025" }), "our-query-changed", "a period the new window stopped asking for");
  assert.equal(await classify(before, narrowed, MOVED), "republished", "2024 is still inside the new window, so its loss is the bank's");
});

test("a window with an empty side is unknown, and excuses nothing", async () => {
  // "..", "2015.." are recorded by a run that posted no dates, so the bank chose
  // the window. Reading an empty side as unbounded made every period look
  // requested (round-2 review).
  const before = stampless(STAMPED);
  const after = withPeriod(before, "2026");
  assert.equal(await classify(before, after, { windowBefore: "..", windowAfter: "2015..2026" }), "republished");
  assert.equal(await classify(before, after, { windowBefore: "2015..", windowAfter: "2015..2026" }), "republished");
  const narrowed = structuredClone(before);
  narrowed.periods = ["2025"];
  for (const s of narrowed.series) s.observations = s.observations.filter((o) => o.period === "2025");
  assert.equal(await classify(before, narrowed, { windowBefore: "2015..2025", windowAfter: ".." }), "republished");
});

test("a relabelled, reordered, added or re-united row is a republication even when the window moved", async () => {
  const before = stampless(STAMPED);
  const relabelled = withPeriod(before, "2026");
  relabelled.series[0].label = "Total Revenue";
  assert.equal(await classify(before, relabelled, MOVED), "republished");
  const reordered = withPeriod(before, "2026");
  reordered.series.reverse();
  assert.equal(await classify(before, reordered, MOVED), "republished");
  const added = withPeriod(before, "2026");
  added.series.push({ label: "Grants", unit: "EC$M", observations: [{ period: "2026", value: 1 }] });
  assert.equal(await classify(before, added, MOVED), "republished", "a new row is the bank's");
  const reunited = withPeriod(before, "2026");
  reunited.series[0].unit = "US$M";
  assert.equal(await classify(before, reunited, MOVED), "republished", "a unit change is the bank's");
});

test("the stamped path is unchanged: same stamp is our query, new stamp is a republication", async () => {
  assert.equal(await classify(STAMPED, withPeriod(STAMPED, "2026")), "our-query-changed");
  assert.equal(await classify(STAMPED, { ...withPeriod(STAMPED, "2026"), data_as_at: "2026-10-01", data_as_at_raw: "01 October 2026" }), "republished");
});
