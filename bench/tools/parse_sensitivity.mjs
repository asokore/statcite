// bench/tools/parse_sensitivity.mjs — automated parse-policy sensitivity.
//
// The §2.4 strict parse (a raw file must BE a JSON array) is pre-registered and
// stands as the headline. This tool quantifies how much of each model's score is
// parse policy rather than recall: it mirrors the run into a scratch base, strips
// leading/trailing markdown fences from the raw responses, re-runs the run's own
// parse_responses.mjs + score.mjs unchanged, and emits the strict-vs-stripped
// comparison to runs/{run}/scores/parse_sensitivity.json (rendered by report.mjs).
// First produced manually for R1 (ADDENDA §1); this makes it a standard output.

import { benchPaths, log, parseArgs, readJson, writeJson, TOOLS_DIR } from "./lib.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HELP = `parse_sensitivity.mjs — strict vs fence-stripped scoring comparison

Usage: node parse_sensitivity.mjs --run R2 [--base DIR] [--help]
Requires the run to be fully scored already (reads scores/summary.json as strict).`;

function cpDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

function stripFences(rawDir) {
  let stripped = 0;
  const perModel = {};
  for (const model of fs.readdirSync(rawDir)) {
    const dir = path.join(rawDir, model);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".txt")) continue;
      const p = path.join(dir, f);
      const t = fs.readFileSync(p, "utf8").trim();
      if (!t.startsWith("```")) continue;
      let lines = t.split("\n").slice(1);
      if (lines.length && lines[lines.length - 1].trim().startsWith("```")) lines = lines.slice(0, -1);
      fs.writeFileSync(p, lines.join("\n"));
      stripped++;
      perModel[model] = (perModel[model] ?? 0) + 1;
    }
  }
  return { stripped, perModel };
}

function h(summary, m) {
  const x = summary.models[m]?.headline;
  if (!x) return null;
  return { wtr: x.WTR.rate, cr: x.CR.rate, ar: x.answer_rate.rate };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) return void console.log(HELP);
  if (!args.run) throw new Error("--run is required");
  const run = args.run;
  const paths = benchPaths(args.base, run);
  const strict = readJson(path.join(paths.runDir, "scores", "summary.json"));

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `statcite-ps-${run}-`));
  log(`scratch base: ${scratch}`);
  fs.mkdirSync(path.join(scratch, "questions"), { recursive: true });
  fs.copyFileSync(paths.questions, path.join(scratch, "questions", `${run}.json`));
  fs.copyFileSync(paths.batches, path.join(scratch, "questions", `${run}-batches.json`));
  cpDir(paths.snapshotDir, path.join(scratch, "snapshots", run));
  cpDir(path.join(paths.runDir, "raw"), path.join(scratch, "runs", run, "raw"));

  const { stripped, perModel } = stripFences(path.join(scratch, "runs", run, "raw"));
  log(`stripped fences from ${stripped} raw files: ${JSON.stringify(perModel)}`);

  const node = process.execPath;
  execFileSync(node, [path.join(TOOLS_DIR, "parse_responses.mjs"), "--run", run, "--base", scratch], { stdio: "inherit" });
  execFileSync(node, [path.join(TOOLS_DIR, "score.mjs"), "--run", run, "--base", scratch], { stdio: "inherit" });
  const strippedSummary = readJson(path.join(scratch, "runs", run, "scores", "summary.json"));

  const models = {};
  for (const m of Object.keys(strict.models)) {
    const s = h(strict, m);
    const p = h(strippedSummary, m);
    if (s && p) models[m] = { strict: s, stripped: p, fence_files: perModel[m] ?? 0 };
  }
  writeJson(path.join(paths.runDir, "scores", "parse_sensitivity.json"), {
    run,
    generated_at: new Date().toISOString(),
    total_fence_files: stripped,
    note: "Strict §2.4 parse is the pre-registered headline; the stripped column shows the score under fence-tolerant parsing, all other policy unchanged.",
    models,
  });
  log(`parse_sensitivity.json written`);
  fs.rmSync(scratch, { recursive: true, force: true });
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`parse_sensitivity FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
