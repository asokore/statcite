// bench/tools/make_prompts.mjs — render per-model, per-batch prompt files (METHODOLOGY §2.2-2.3).
//
// Reads {base}/questions/{run}.json + {run}-batches.json + templates/system_prompt_v1.txt,
// applies the recorded per-model within-batch order, and writes
// {base}/runs/{run}/prompts/<model>/batch-NN.json: { model, batch_id, system, user, qids }.

import { MODELS, benchPaths, log, parseArgs, readJson, writeJson, TOOLS_DIR } from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const HELP = `make_prompts.mjs — render per-model batch prompts (METHODOLOGY §2.2-2.3)

Usage: node make_prompts.mjs --run P0 [--base DIR] [--help]

  --run RUN    Run id.
  --base DIR   Base directory (default bench/).
  --help       Show this help.

Writes {base}/runs/{RUN}/prompts/<model>/batch-NN.json with the exact system and
user strings to send, and the qids in presented order.`;

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.run) throw new Error("--run is required (see --help)");
  const paths = benchPaths(args.base, args.run);
  const bank = readJson(paths.questions);
  const batchesFile = readJson(paths.batches);
  const system = fs.readFileSync(path.join(TOOLS_DIR, "..", "templates", "system_prompt_v1.txt"), "utf8");
  const qByQid = new Map(bank.questions.map((q) => [q.qid, q]));

  let written = 0;
  for (const model of MODELS) {
    const order = batchesFile.model_order[model];
    if (!order) throw new Error(`no model_order recorded for ${model} in ${paths.batches}`);
    for (const batch of batchesFile.batches) {
      const qids = order[batch.batch_id];
      if (!qids) throw new Error(`no order for ${model}/${batch.batch_id}`);
      const lines = qids.map((qid, i) => {
        const q = qByQid.get(qid);
        if (!q) throw new Error(`qid ${qid} in batches file but not in question bank`);
        return `${i + 1}. [${qid}] ${q.text}`;
      });
      const user =
        `Answer the following ${qids.length} questions from memory only. ` +
        `Output a single JSON array with exactly ${qids.length} objects, one per question, each echoing the question's qid exactly.\n\n` +
        lines.join("\n");
      const out = { model, batch_id: batch.batch_id, system, user, qids };
      writeJson(path.join(paths.runDir, "prompts", model, `${batch.batch_id}.json`), out);
      written++;
    }
  }
  log(`wrote ${written} prompt files under ${path.join(paths.runDir, "prompts")}`);
}

main().catch((e) => {
  console.error(`make_prompts FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
