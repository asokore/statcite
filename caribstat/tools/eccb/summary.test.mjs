// The run report is what the scheduled task and later sessions read, so its
// counts and prefixes are tested rather than trusted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise, lineFor } from "./summary.mjs";

const fetched = (state, dataAsAt) => ({ iso3: "XCU", ok: true, state, rows: 3, periods: 12, dataAsAt });

test("skips are counted by their basis, never merged", () => {
  const s = summarise([
    { tableId: "a", skipped: true, basis: "stamp", reason: "stamp unchanged (01 September 2026)", requestsSaved: 9, results: [] },
    { tableId: "b", skipped: true, basis: "content", reason: "no source stamp; ...", requestsSaved: 9, results: [] },
    { tableId: "c", skipped: true, basis: "content", reason: "no source stamp; ...", requestsSaved: 9, results: [] },
  ], { freq: "a" });
  assert.deepEqual(s.counts, { skippedTables: 3, skippedByContent: 2, requestsSaved: 27, stampless: 0, withdrawn: 0 });
  assert.match(s.footer.join("\n"), /SKIPPED 3 table\(s\) — 1 on an unmoved "Data as at" stamp, 2 because the bank prints no stamp/);
  assert.equal(s.failures, 0);
});

test("stampless series are counted and said out loud, and withdrawn stamps separately", () => {
  const s = summarise([{ tableId: "t", results: [fetched("unchanged"), fetched("stamp-withdrawn"), fetched("republished", "2026-10-01")] }]);
  assert.equal(s.counts.stampless, 2);
  assert.equal(s.counts.withdrawn, 1);
  assert.match(s.footer.join("\n"), /NOTE: 2 series were read with NO "Data as at" stamp/);
  assert.match(s.footer.join("\n"), /NOTE: 1 of those had held a stamp/);
});

test("prefixes: a withdrawn stamp reads as same, with the reason; failures count", () => {
  assert.match(lineFor(fetched("stamp-withdrawn")), /^ {2}same XCU .*no source stamp.*withdrawn stamp removed/);
  assert.match(lineFor(fetched("unchanged", "2026-09-01")), /^ {2}same XCU .*data as at 2026-09-01$/);
  assert.match(lineFor(fetched("republished")), /^ {2}PUB  XCU/);
  assert.match(lineFor(fetched("our-query-changed")), /^ {2}qry  XCU/);
  assert.match(lineFor(fetched("new")), /^ {2}NEW  XCU/);
  const s = summarise([{ tableId: "t", results: [{ iso3: "MSR", ok: false, problems: ["ECCB POST 500"] }, fetched("unchanged")] }]);
  assert.equal(s.failures, 1);
  assert.ok(s.tableLines.includes("  FAIL MSR  ECCB POST 500"));
  assert.match(s.footer.at(-1), /1 series FAILED/);
});
