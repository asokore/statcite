#!/usr/bin/env node
// ECCB ingest runner.
//
//   node tools/eccb/run.mjs                          # all Phase 1 tables, annual
//   node tools/eccb/run.mjs --table central-government-fiscal-accounts --freq q
//   node tools/eccb/run.mjs --start 2015 --end 2025
//   node tools/eccb/run.mjs --dry-run                # list what would be fetched
//
// Exit code is 1 if ANY series failed its sentinel. A partial ingest must be
// loud: the whole point of the sentinels is that a silently-changed source
// cannot pass as fresh data. Do not pipe this into `tee` without
// `set -o pipefail` — the pipeline would report tee's exit status and the
// failure would vanish.

import { ingestTable, TABLES } from "./ingest.mjs";

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

if (has("dry-run")) {
  console.log(`Would ingest ${targets.length} table(s) at frequency '${freq}':`);
  for (const t of targets) console.log(`  ${t.id}  (${t.title})`);
  console.log("No requests made, nothing written.");
  process.exit(0);
}

let failures = 0;
let skippedTables = 0;
let requestsSaved = 0;
const deep = has("deep");
if (deep) console.log("DEEP run: ignoring the stamp shortcut and re-reading every series.");

for (const t of targets) {
  const r = await ingestTable(t.id, { freq, startDate, endDate, deep });
  const ok = r.results.filter((x) => x.ok).length;
  if (r.skipped) {
    skippedTables++;
    requestsSaved += r.requestsSaved ?? 0;
    console.log(`\n${r.tableId} [${freq}] — SKIPPED, ${r.reason}`);
    continue;
  }
  console.log(`\n${r.tableId} [${freq}] — ${ok}/${r.results.length} geographies`);
  for (const x of r.results) {
    if (x.ok) console.log(`  ${x.state === "unchanged" ? "same" : x.state === "new" ? "NEW " : x.state === "republished" ? "PUB " : "qry "} ${x.iso3}  rows=${x.rows} periods=${x.periods}  data as at ${x.dataAsAt}`);
    else {
      failures++;
      console.log(`  FAIL ${x.iso3}  ${x.problems.join(" | ")}`);
    }
  }
}

if (skippedTables) {
  console.log(`\nSKIPPED ${skippedTables} table(s) whose "Data as at" stamp had not moved — ${requestsSaved} request(s) not made.`);
  console.log("Run with --deep to re-read them anyway (catches a silent correction that left the stamp untouched).");
}
console.log(failures === 0 ? "\nINGEST: all series passed their sentinels" : `\nINGEST: ${failures} series FAILED — see above`);
process.exit(failures === 0 ? 0 : 1);
