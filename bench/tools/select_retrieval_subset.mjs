// bench/tools/select_retrieval_subset.mjs — §0 retrieval-delta arm subset
// (scope pre-registered in D-008 item 6): seeded shuffle of the run's headline
// questions (deriveSeed(master, "retrieval-subset"), lexicographic pre-sort),
// take the first questions in shuffle order up to a tier balance of
// T1:8 / T2:8 / T3:7 / T4:7 — 30 total, identical for every retrieval model.

import { benchPaths, log, parseArgs, readJson, writeJson } from "./lib.mjs";
import { deriveSeed, rngFromHex, shuffle } from "./prng.mjs";
import path from "node:path";

const TIER_TAKE = { T1: 8, T2: 8, T3: 7, T4: 7 };

const HELP = `select_retrieval_subset.mjs — seeded 30-question retrieval subset (D-008 item 6)

Usage: node select_retrieval_subset.mjs --run R2 --seed <master-hex> [--base DIR]
Writes {base}/questions/{run}-retrieval-subset.json.`;

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    seed: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) return void console.log(HELP);
  if (!args.run || !args.seed) throw new Error("--run and --seed are required");
  const paths = benchPaths(args.base, args.run);
  const bank = readJson(paths.questions);
  const headline = bank.questions.filter((q) => q.segment === "headline");

  const rng = rngFromHex(deriveSeed(args.seed.toLowerCase(), "retrieval-subset"));
  const order = shuffle(headline, rng, (q) => q.qid);
  const take = { ...TIER_TAKE };
  const chosen = [];
  for (const q of order) {
    if (take[q.tier] > 0) {
      take[q.tier]--;
      chosen.push(q.qid);
    }
  }
  const out = {
    run: args.run,
    selected_at: new Date().toISOString(),
    selection_rule: 'seeded shuffle of headline qids (deriveSeed(master, "retrieval-subset")), first in shuffle order to tier balance T1:8/T2:8/T3:7/T4:7',
    master_seed: args.seed.toLowerCase(),
    n: chosen.length,
    qids: chosen.sort(),
  };
  writeJson(path.join(paths.questionsDir, `${args.run}-retrieval-subset.json`), out);
  log(`retrieval subset: ${chosen.length} qids -> ${args.run}-retrieval-subset.json`);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`select_retrieval_subset FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
