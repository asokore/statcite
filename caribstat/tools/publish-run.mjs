#!/usr/bin/env node
// Publish CLI.
//
//   node tools/publish-run.mjs             # sync + commit + push, if anything changed
//   node tools/publish-run.mjs --dry-run   # classify only, no clone/commit/push
//
// The staging clone lives at caribstat/.publish/ (gitignored — it is a working
// copy of a DIFFERENT public repository, github.com/asokore/caribstat, and
// must never be mistaken for part of this one). First run clones it; every
// run after that fetches and hard-resets it to origin/main before comparing,
// because this clone exists only as a mirror for this script and nothing else
// should ever be committing into it between runs.
//
// Orphaned files (published but no longer produced locally) are reported and
// NEVER deleted automatically — see the comment on classify() in publish.mjs
// for why. If this script ever prints an orphan warning, that is a decision
// for a person, not something to silence by re-running with a flag.

import { execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PUBLISH_REPO, classify, applyToClone, summarise } from "./publish.mjs";

const dryRun = process.argv.includes("--dry-run");
const localDataDir = path.resolve(process.cwd(), "data");
const cloneDir = path.resolve(process.cwd(), ".publish");
const cloneDataDir = path.join(cloneDir, "data");

const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

async function main() {
  let cloneReady = false;
  try {
    await readFile(path.join(cloneDir, ".git", "config"), "utf8");
    cloneReady = true;
  } catch {
    /* not cloned yet */
  }

  if (dryRun && !cloneReady) {
    console.log("No local clone at .publish/ yet — nothing to compare against. Run without --dry-run once to create it.");
    return 0;
  }

  if (!cloneReady) {
    console.log(`Cloning ${PUBLISH_REPO} to .publish/ (first run) ...`);
    await mkdir(cloneDir, { recursive: true });
    git(["clone", PUBLISH_REPO, "."], cloneDir);
  } else {
    console.log("Syncing .publish/ with origin/main before comparing ...");
    git(["fetch", "origin", "main"], cloneDir);
    git(["reset", "--hard", "origin/main"], cloneDir);
  }

  const { toPublish, orphaned } = await classify(localDataDir, cloneDataDir);

  if (orphaned.length) {
    console.log(`\nWARNING: ${orphaned.length} file(s) exist in the published repo but not in the local corpus. NOT deleting them — that is an operator decision. Listed below; investigate before assuming they should go:`);
    for (const f of orphaned.slice(0, 20)) console.log(`  ${f}`);
    if (orphaned.length > 20) console.log(`  ... and ${orphaned.length - 20} more`);
  }

  if (toPublish.length === 0) {
    console.log("\nNothing to publish. The published corpus already matches the local one (ignoring retrieved_at).");
    return 0;
  }

  console.log(`\n${toPublish.length} file(s) to publish:`);
  for (const f of toPublish.slice(0, 30)) console.log(`  ${f.state === "new" ? "NEW " : "CHG "} ${f.rel}`);
  if (toPublish.length > 30) console.log(`  ... and ${toPublish.length - 30} more`);

  if (dryRun) {
    console.log("\n--dry-run: not writing, committing or pushing.");
    return 0;
  }

  await applyToClone(localDataDir, cloneDataDir, toPublish);
  git(["add", ...toPublish.map((f) => path.join("data", f.rel))], cloneDir);
  const message = summarise(toPublish);
  git(["commit", "-m", message], cloneDir);
  git(["push", "origin", "main"], cloneDir);
  console.log(`\nPublished: ${message}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("PUBLISH FAILED:", e.stderr ?? e.message ?? e);
    process.exit(1);
  });
