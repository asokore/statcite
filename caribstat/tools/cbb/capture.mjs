#!/usr/bin/env node
// Download the CBB source workbooks that the published documents cite.
//
// WHY. The CBB half of this corpus produced every value-level defect found so
// far: a cell regex that swallowed its neighbour, a period axis read off the
// wrong column, a header taken from the wrong row, a date column served as a
// statistic. All four were invisible to the pipeline, because the pipeline is
// what got them wrong. ECCB has had an independent second-implementation check
// since 2026-08-15; this is the equivalent input for CBB.
//
// Each published document records the exact attachment_url it was built from,
// so there is no discovery to redo here and no risk of auditing a different
// workbook than the one that was parsed.
//
//   node tools/cbb/capture.mjs
//   node tools/cbb/capture.mjs --category tourism
//
// Output goes to a gitignored scratch directory. The workbooks are the Bank's
// material, not ours, and have no place in the repository.

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { downloadAttachment } from "./fetch.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const DATA = path.resolve("data", "cbb");
const OUT = path.resolve(flag("out", path.join("..", ".capture", "cbb")));
const only = flag("category");

// One workbook can back many sheets, so collect distinct attachment URLs
// rather than downloading once per published document.
const wanted = new Map();
for (const category of readdirSync(DATA)) {
  const dir = path.join(DATA, category);
  // data/cbb also holds bookkeeping files (_last_check.json) alongside the
  // category directories, so this cannot assume every entry is a directory.
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
  if (only && category !== only) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const doc = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
    if (!doc.attachment_url) continue;
    if (!wanted.has(doc.attachment_url)) wanted.set(doc.attachment_url, category);
  }
}

if (wanted.size === 0) {
  console.error(only ? `No published documents for category '${only}'.` : "No published CBB documents found.");
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
let got = 0;
for (const [url, category] of wanted) {
  const file = url.split("/").pop();
  const dest = path.join(OUT, `${category}__${file}`);
  if (existsSync(dest)) {
    console.log(`  cached  ${category}/${file}`);
    got++;
    continue;
  }
  try {
    const buf = await downloadAttachment(url);
    writeFileSync(dest, buf);
    console.log(`  ${String(buf.length).padStart(8)}  ${category}/${file}`);
    got++;
  } catch (e) {
    console.log(`  FAIL    ${category}/${file}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 800));
}
console.log(`\nCaptured ${got}/${wanted.size} workbook(s) to ${OUT}.`);
