// Tests for the inventory's "full" column.
//
// The column exists because a deep run can die and still be reported as a
// success (22 Nov 2026). The inventory showed "checked" dates from the daily
// skips, which looked current, while the last real re-read sat 12 days back.
// These tests run status.mjs the way an operator does, against a throwaway
// data folder, and read the output it prints, not an internal value.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STATUS = path.join(path.dirname(fileURLToPath(import.meta.url)), "status.mjs");
const DAY = 86400000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

const sheet = { published_at: "2026-08-01", series: [{ observations: [{ period: "2025", value: 1 }] }] };

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-status-"));
  const cbb = path.join(dir, "data", "cbb");
  for (const cat of ["fresh-cat", "stale-cat", "never-cat"]) {
    await mkdir(path.join(cbb, cat), { recursive: true });
    await writeFile(path.join(cbb, cat, "s.json"), JSON.stringify(sheet));
  }
  await writeFile(path.join(cbb, "_last_check.json"), JSON.stringify({
    entries: {
      "fresh-cat": { checked_at: iso(0), action: "skipped", last_full_fetch_at: iso(2 * DAY) },
      "stale-cat": { checked_at: iso(0), action: "skipped", last_full_fetch_at: iso(12 * DAY) },
      "never-cat": { checked_at: iso(0), action: "skipped", last_full_fetch_at: null },
    },
  }));
  return dir;
}

const run = (cwd, ...args) => execFileSync(process.execPath, [STATUS, ...args], { cwd, encoding: "utf8" });

test("status --json flags a full fetch older than 7.5 days, or none, and not a recent one", async () => {
  const dir = await fixture();
  try {
    const { rows } = JSON.parse(run(dir, "--json"));
    const by = Object.fromEntries(rows.map((r) => [r.unit, r]));
    assert.equal(by["fresh-cat"].full_fetch_stale, false);
    assert.equal(by["stale-cat"].full_fetch_stale, true);
    assert.equal(by["never-cat"].full_fetch_stale, true, "no full fetch on record is the worst case, not a clean one");
    assert.equal(by["stale-cat"].last_full_fetch, iso(12 * DAY).slice(0, 10));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("status table prints the full column with the stale ones marked", async () => {
  const dir = await fixture();
  try {
    const out = run(dir);
    const line = (unit) => out.split("\n").find((l) => l.trimStart().startsWith(unit));
    assert.match(out, / full +action/, "header carries the column");
    assert.ok(line("fresh-cat").includes(`${iso(2 * DAY).slice(0, 10)} `), line("fresh-cat"));
    assert.ok(!line("fresh-cat").includes("!"), line("fresh-cat"));
    assert.ok(line("stale-cat").includes(`${iso(12 * DAY).slice(0, 10)}!`), line("stale-cat"));
    assert.ok(line("never-cat").includes("-!"), line("never-cat"));
    assert.match(out, /2 of 3 row\(s\) flagged/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
