// bench/tools/extend_batches_r1.mjs — one-off: extend P0's model_order formula to R1's
// two new vendors (gpt-5.5, gemini-3-flash-preview), reusing P0's exact batch
// assignment (same questions, same batches). Not part of the general tool suite;
// this is Full Run 1 prep, run once before the pre-registration freeze.

import { readJson, writeJson, benchPaths } from "./lib.mjs";
import { rngFromHex, deriveSeed, shuffle } from "./prng.mjs";

const p0Paths = benchPaths(undefined, "P0");
const p0batches = readJson(p0Paths.batches);

const NEW_MODELS = ["gpt-5.5", "gemini-3-flash-preview"];
const modelOrder = { ...p0batches.model_order };

// Sanity check: recompute the 4 existing Claude orders from the documented formula
// and confirm they match P0's frozen file byte-for-byte before trusting the formula
// to extend to new models.
let mismatches = 0;
for (const model of Object.keys(p0batches.model_order)) {
  for (const bt of p0batches.batches) {
    const rng = rngFromHex(deriveSeed(p0batches.seed, `${model}:${bt.batch_id}`));
    const recomputed = shuffle(bt.qids, rng);
    const original = p0batches.model_order[model][bt.batch_id];
    if (JSON.stringify(recomputed) !== JSON.stringify(original)) {
      mismatches++;
      console.error(`MISMATCH: ${model}/${bt.batch_id}`);
    }
  }
}
if (mismatches > 0) {
  throw new Error(`${mismatches} mismatches recomputing P0's own model_order — formula does not match, aborting`);
}
console.log("Sanity check passed: recomputed all 4 existing Claude model_order entries from the documented formula, byte-for-byte identical to P0's frozen file.");

for (const model of NEW_MODELS) {
  modelOrder[model] = {};
  for (const bt of p0batches.batches) {
    const rng = rngFromHex(deriveSeed(p0batches.seed, `${model}:${bt.batch_id}`));
    modelOrder[model][bt.batch_id] = shuffle(bt.qids, rng);
  }
  console.log(`Computed model_order for new model: ${model}`);
}

const r1Batches = {
  run: "R1",
  seed: p0batches.seed,
  batch_size: p0batches.batch_size,
  n_batches: p0batches.n_batches,
  order_seed_rule: p0batches.order_seed_rule,
  batches: p0batches.batches,
  model_order: modelOrder,
};
const r1Paths = benchPaths(undefined, "R1");
writeJson(r1Paths.batches, r1Batches);
console.log(`Wrote ${r1Paths.batches}`);
