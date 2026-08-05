// bench/tools/select_core_panel.mjs — §6 contamination protocol: mechanical,
// seeded selection of the frozen core panel from a prior run's headline bank.
//
// The panel should have been selected at pilot (D-007 item 1); it is being
// selected late, with the selection rule committed BEFORE the seed is known
// (the seed derives from the pre-announced NIST beacon pulse), so no human
// choice enters: seeded shuffle of the source run's headline qids
// (deriveSeed(master, "core-panel"), lexicographic pre-sort), then take the
// first N_PER_TIER of each economy tier in shuffle order. Any subset of a
// valid draw automatically satisfies every quota, so the fresh majority can
// always complete around it.

import { benchPaths, log, parseArgs, readJson, writeJson } from "./lib.mjs";
import { deriveSeed, rngFromHex, shuffle } from "./prng.mjs";
import path from "node:path";

const N_PER_TIER = 10; // 40 total = the frozen minority; the fresh draw is the majority (§6)

const HELP = `select_core_panel.mjs — seeded core-panel selection (§6)

Usage: node select_core_panel.mjs --source-run R1 --run R2 --seed <master-hex> [--base DIR]
Writes {base}/questions/{run}-core.json ({source_run, selection_rule, qids}).`;

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    "source-run": { type: "string" },
    run: { type: "string" },
    seed: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) return void console.log(HELP);
  if (!args["source-run"] || !args.run || !args.seed) throw new Error("--source-run, --run and --seed are required");
  const paths = benchPaths(args.base, args.run);
  const source = readJson(path.join(paths.questionsDir, `${args["source-run"]}.json`));
  const headline = source.questions.filter((q) => q.segment === "headline");

  const rng = rngFromHex(deriveSeed(args.seed.toLowerCase(), "core-panel"));
  const order = shuffle(headline, rng, (q) => q.qid);
  const perTier = {};
  const chosen = [];
  for (const q of order) {
    if ((perTier[q.tier] ?? 0) >= N_PER_TIER) continue;
    perTier[q.tier] = (perTier[q.tier] ?? 0) + 1;
    chosen.push(q.qid);
  }
  const out = {
    source_run: args["source-run"],
    selected_at: new Date().toISOString(),
    selection_rule: `seeded shuffle of ${args["source-run"]} headline qids (deriveSeed(master, "core-panel"), lexicographic pre-sort), first ${N_PER_TIER} per tier in shuffle order — 40 total`,
    master_seed: args.seed.toLowerCase(),
    qids: chosen.sort(),
  };
  writeJson(path.join(paths.questionsDir, `${args.run}-core.json`), out);
  log(`core panel: ${chosen.length} qids (${JSON.stringify(perTier)}) -> ${args.run}-core.json`);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`select_core_panel FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
