// bench/tools/make_sibling_run.mjs — create an arm sibling run (R2D, R2V) that
// SHARES the parent's frozen bank and snapshots (models.json "arms"): copies
// questions/{parent}.json -> {sibling}.json (optionally filtered to a subset
// file's qids), the batches file (subset batches are rebuilt by dropping absent
// qids from each batch, preserving relative order), and the snapshot directory.
// Scoring a sibling therefore uses byte-identical ground truth; only raw model
// outputs differ. Nothing here re-fetches anything.

import { benchPaths, log, parseArgs, readJson, writeJson } from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const HELP = `make_sibling_run.mjs — arm sibling run scaffolding (D-008 items 5-6)

Usage: node make_sibling_run.mjs --parent R2 --sibling R2D [--subset FILE] [--base DIR]

  --parent RUN    Parent run id (frozen bank + snapshots source).
  --sibling RUN   New sibling run id.
  --subset FILE   Optional subset spec ({qids:[...]}) — the sibling bank keeps
                  only these qids (retrieval arm).
  --base DIR      Base directory (default bench/).`;

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    parent: { type: "string" },
    sibling: { type: "string" },
    subset: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) return void console.log(HELP);
  if (!args.parent || !args.sibling) throw new Error("--parent and --sibling are required");
  const pp = benchPaths(args.base, args.parent);
  const sp = benchPaths(args.base, args.sibling);

  const bank = readJson(pp.questions);
  const batches = readJson(pp.batches);
  let keep = null;
  if (args.subset) {
    keep = new Set(readJson(args.subset).qids);
    bank.questions = bank.questions.filter((q) => keep.has(q.qid));
    bank.counts = {
      headline: bank.questions.filter((q) => q.segment === "headline").length,
      recency: bank.questions.filter((q) => q.segment === "recency").length,
      null_probe: bank.questions.filter((q) => q.segment === "null_probe").length,
      total: bank.questions.length,
    };
  }
  bank.sibling_of = args.parent;
  bank.run = args.sibling;
  writeJson(path.join(sp.questionsDir, `${args.sibling}.json`), bank);

  const out = { ...batches, run: args.sibling, sibling_of: args.parent };
  if (keep) {
    out.batches = batches.batches
      .map((b) => ({ ...b, qids: b.qids.filter((q) => keep.has(q)) }))
      .filter((b) => b.qids.length > 0);
    out.model_order = Object.fromEntries(
      Object.entries(batches.model_order ?? {}).map(([m, byBatch]) => [
        m,
        Object.fromEntries(
          Object.entries(byBatch)
            .map(([bid, qids]) => [bid, qids.filter((q) => keep.has(q))])
            .filter(([, qids]) => qids.length > 0),
        ),
      ]),
    );
  }
  writeJson(path.join(sp.questionsDir, `${args.sibling}-batches.json`), out);

  fs.mkdirSync(sp.snapshotDir, { recursive: true });
  fs.cpSync(pp.snapshotDir, sp.snapshotDir, { recursive: true });
  log(`sibling ${args.sibling} created from ${args.parent}${keep ? ` (subset ${bank.questions.length} questions)` : ""}; snapshots copied verbatim`);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`make_sibling_run FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
