#!/usr/bin/env node
// ECCB ingest runner.
//
//   node tools/eccb/run.mjs --freq a --start 2015 --end 2026   # all Phase 1 tables, annual
//   node tools/eccb/run.mjs --table central-government-fiscal-accounts --freq q --start 2020 --end 2026
//   node tools/eccb/run.mjs --freq m --start 2023 --end 2026 --deep
//   node tools/eccb/run.mjs --dry-run                # list what would be fetched
//
// --start and --end are required for a real run: see the check below.
//
// Exit code is 1 if ANY series failed its sentinel. A partial ingest must be
// loud: the whole point of the sentinels is that a silently-changed source
// cannot pass as fresh data. Do not pipe this into `tee` without
// `set -o pipefail` — the pipeline would report tee's exit status and the
// failure would vanish.

import { ingestTable, TABLES } from "./ingest.mjs";
import { summarise } from "./summary.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const only = flag("table");
const freq = flag("freq", "a");
const startDate = flag("start");
const endDate = flag("end");

const targets = TABLES.filter((t) => (only ? t.id === only : true)).filter((t) => t.frequencies.includes(freq));

if (only && targets.length === 0) {
  console.error(`No table '${only}' publishing frequency '${freq}'.`);
  console.error(`Known tables: ${TABLES.map((t) => `${t.id} [${t.frequencies.join("")}]`).join(", ")}`);
  process.exit(2);
}

// Both ends of the window are required. Without them the bank's own default
// window (about five years) comes back, replaces the stored extract, and
// publishes as a narrower series than we held. The ledger then records an
// unknown window that can excuse no later change. Found in review, 2026-09-30.
if (!has("dry-run") && (!startDate || !endDate)) {
  console.error("Both --start and --end are required (e.g. --start 2015 --end 2026 for annual).");
  console.error("A run without them takes the bank's default window and narrows the stored series.");
  process.exit(2);
}

if (has("dry-run")) {
  console.log(`Would ingest ${targets.length} table(s) at frequency '${freq}':`);
  for (const t of targets) console.log(`  ${t.id}  (${t.title})`);
  console.log("No requests made, nothing written.");
  process.exit(0);
}

const deep = has("deep");
if (deep) console.log("DEEP run: ignoring the stamp and content shortcuts and re-reading every series.");

// Printed per table as it finishes, so a long run shows progress; the summary
// lines come from the same pure function the tests exercise.
const tableResults = [];
for (const t of targets) {
  const r = await ingestTable(t.id, { freq, startDate, endDate, deep });
  tableResults.push(r);
  for (const line of summarise([r], { freq }).tableLines) console.log(line);
}

const { footer, failures } = summarise(tableResults, { freq });
for (const line of footer) console.log(line);
process.exit(failures === 0 ? 0 : 1);
