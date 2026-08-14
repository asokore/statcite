#!/usr/bin/env node
// CBB ingest runner.
//
//   node tools/cbb/run.mjs                        # newest publication per category
//   node tools/cbb/run.mjs --category tourism
//   node tools/cbb/run.mjs --max-items 3          # deeper history per category
//   node tools/cbb/run.mjs --dry-run
//
// Exits non-zero if any sheet failed its sentinel. Do NOT pipe through `tee`
// without `set -o pipefail` — a pipeline reports the last stage's status and
// the failure disappears. That happened on the first ECCB sweep: exit 0 with
// 18 failed series.

import { ingestCategory, CBB_LISTINGS } from "./ingest.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const has = (n) => args.includes(`--${n}`);

const only = flag("category");
const maxItems = Number(flag("max-items", "1"));
const targets = CBB_LISTINGS.filter((l) => (only ? l.id === only : true));

if (only && targets.length === 0) {
  console.error(`No category '${only}'. Known: ${CBB_LISTINGS.map((l) => l.id).join(", ")}`);
  process.exit(2);
}

if (has("dry-run")) {
  console.log(`Would ingest the newest ${maxItems} publication(s) from ${targets.length} categories:`);
  for (const t of targets) console.log(`  ${t.id}  (${t.title})`);
  console.log("No requests made, nothing written.");
  process.exit(0);
}

let failures = 0;
let sheets = 0;
let observations = 0;

for (const t of targets) {
  const r = await ingestCategory(t, { maxItems });
  const ok = r.results.filter((x) => x.ok);
  console.log(`\n${t.id} — ${ok.length} sheet(s) ingested`);
  for (const x of r.results) {
    if (x.ok) {
      sheets++;
      observations += x.observations;
      console.log(`  ${x.state === "unchanged" ? "same" : x.state === "new" ? "NEW " : x.state === "republished" ? "PUB " : "qry "} ${String(x.sheet).slice(0, 28).padEnd(28)} ${String(x.periods).padStart(4)} periods, ${String(x.series).padStart(3)} series, ${String(x.observations).padStart(6)} obs  pub ${x.publishedAt}`);
    } else {
      failures++;
      console.log(`  FAIL ${String(x.sheet ?? "(item)").slice(0, 28).padEnd(28)} ${x.problems.join(" | ").slice(0, 90)}`);
    }
  }
}

console.log(
  failures === 0
    ? `\nINGEST: ${sheets} sheets, ${observations.toLocaleString()} observations, all sentinels passed`
    : `\nINGEST: ${sheets} sheets ingested, ${failures} FAILED — see above`,
);
process.exit(failures === 0 ? 0 : 1);
