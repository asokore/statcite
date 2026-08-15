#!/usr/bin/env node
// Capture raw ECCB table HTML to disk, for INDEPENDENT verification.
//
// WHY THIS EXISTS. Every value-level defect found in this pipeline so far has
// been a PARSING defect: a cell regex that swallowed its neighbour, an axis
// read off the wrong column, a header row taken from the wrong place. None of
// them could be caught by re-running the parser, because the parser is the
// thing that is wrong. Checking the pipeline against itself proves only that
// it is consistent.
//
// So this script does the one part that genuinely needs the pipeline's code —
// the CSRF handshake and the geography POST — and writes the raw HTML out. A
// SEPARATE re-implementation (tools/eccb/verify_independent.py, deliberately
// in another language so it shares no code path) parses that HTML and compares
// it against the published JSON cell by cell.
//
//   node tools/eccb/capture.mjs --table central-government-fiscal-accounts
//   node tools/eccb/capture.mjs --all
//
// Output goes to a gitignored scratch directory; raw source HTML is not ours
// to redistribute and has no place in the repository.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openTableSession, fetchGeography, parseTable, ECCB_GEOGRAPHIES } from "./fetch.mjs";
import { TABLES, tableById, tableUrl, isPerCountry } from "./catalogue.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const OUT = path.resolve(flag("out", path.join("..", ".capture")));
const freq = flag("freq", "a");
const only = flag("table");
// The window MUST match the one the published corpus was collected with, or
// every document reports a periods disagreement that is a capture-config
// difference and not a data defect. That happened on the first run of this
// script: 45 "disagreements", all of them the default five-year window.
const startDate = flag("start");
const endDate = flag("end");
const targets = args.includes("--all") ? TABLES : [tableById.get(only)].filter(Boolean);

if (targets.length === 0) {
  console.error(`No table '${only}'. Known: ${TABLES.map((t) => t.id).join(", ")}`);
  process.exit(2);
}

let written = 0;
let skipped = 0;
for (const def of targets) {
  if (!def.frequencies.includes(freq)) {
    console.log(`${def.id}: not published at frequency '${freq}', skipped`);
    skipped++;
    continue;
  }
  let session;
  let sessionUrl;
  for (const g of ECCB_GEOGRAPHIES) {
    const url = tableUrl(def, g.iso3);
    try {
      if (!session || isPerCountry(def) || sessionUrl !== url) {
        session = await openTableSession(url, freq);
        sessionUrl = url;
      }
      // The geography field takes ECCB's OWN numeric code ("1"), not the ISO3.
      // Posting the ISO3 returns a 200 with the bare page and no table, which
      // reads exactly like "this source has stopped publishing" and cost a
      // false alarm on 2026-08-15.
      const r = isPerCountry(def)
        ? { html: session.html, table: parseTable(session.html, { freq }) }
        : await fetchGeography(url, session, { countryCode: g.code, freq, startDate, endDate });
      const dir = path.join(OUT, def.id, freq);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${g.iso3}.html`), r.html);
      console.log(`  ${def.id}/${freq}/${g.iso3}  ${r.html.length} bytes, ${r.table?.rows?.length ?? 0} rows`);
      written++;
      if (isPerCountry(def)) break;
    } catch (e) {
      console.log(`  FAIL ${def.id}/${freq}/${g.iso3}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 900));
  }
}
console.log(`\nCaptured ${written} page(s) to ${OUT}${skipped ? `, ${skipped} table(s) skipped` : ""}.`);
