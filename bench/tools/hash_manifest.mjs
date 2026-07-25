// bench/tools/hash_manifest.mjs — SHA-256 manifest builder + verifier (METHODOLOGY §6).
//
// Build: hashes every benchmark artifact (methodology, covenant, deviations log,
// templates, tools, models.json, frame, questions, snapshots, run outputs) into
// {base}/runs/{run}/manifest.json. Verify: recomputes every hash and FAILS
// (non-zero exit) on any mismatch or missing file. bench/state/ (HTTP cache) and
// the manifest itself are never included.

import { BENCH_DIR, benchPaths, log, parseArgs, sha256File, writeJson, readJson } from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const HELP = `hash_manifest.mjs — SHA-256 manifest for a run (METHODOLOGY §6)

Usage:
  node hash_manifest.mjs --run P0 [--base DIR]            build/refresh the manifest
  node hash_manifest.mjs --run P0 [--base DIR] --verify   verify, exit 1 on any mismatch

  --run RUN    Run id.
  --base DIR   Base directory (default bench/). Pre-registration docs (METHODOLOGY.md,
               COVENANT.md, DEVIATIONS.md) and tools/templates are always taken from
               the real bench/ tree.
  --verify     Verify mode.
  --help       Show this help.`;

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "state" || entry.name === "node_modules") continue;
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    verify: { type: "boolean" },
    help: { type: "boolean" },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.run) throw new Error("--run is required (see --help)");
  const paths = benchPaths(args.base, args.run);
  const manifestPath = path.join(paths.runDir, "manifest.json");

  // Fixed pre-registration artifacts always come from the committed bench/ tree.
  const fixed = [
    path.join(BENCH_DIR, "METHODOLOGY.md"),
    path.join(BENCH_DIR, "COVENANT.md"),
    path.join(BENCH_DIR, "DEVIATIONS.md"),
    path.join(BENCH_DIR, "models.json"),
    ...[...walk(path.join(BENCH_DIR, "templates"))],
    ...[...walk(path.join(BENCH_DIR, "tools"))],
  ];
  // Run artifacts come from --base (relocatable for probe runs).
  const runFiles = [
    ...[...walk(paths.frameDir)],
    ...[...walk(paths.questionsDir)].filter((p) => path.basename(p).startsWith(`${args.run}`)),
    ...[...walk(paths.snapshotDir)],
    ...[...walk(paths.runDir)].filter((p) => path.resolve(p) !== path.resolve(manifestPath)),
  ];
  const all = [...fixed, ...runFiles].filter((p) => fs.existsSync(p));

  const relName = (p) => {
    const abs = path.resolve(p);
    for (const [root, label] of [[path.resolve(paths.base), "base"], [path.resolve(BENCH_DIR), "bench"]]) {
      if (abs.startsWith(root + path.sep) || abs === root) {
        return `${label}/${path.relative(root, abs).split(path.sep).join("/")}`;
      }
    }
    return abs.split(path.sep).join("/");
  };

  if (args.verify) {
    if (!fs.existsSync(manifestPath)) throw new Error(`no manifest at ${manifestPath}`);
    const manifest = readJson(manifestPath);
    let bad = 0;
    const lookup = new Map(all.map((p) => [relName(p), p]));
    for (const [name, wantHash] of Object.entries(manifest.files)) {
      const p = lookup.get(name);
      if (!p) {
        console.error(`MISSING: ${name}`);
        bad++;
        continue;
      }
      const got = sha256File(p);
      if (got !== wantHash) {
        console.error(`HASH MISMATCH: ${name}\n  manifest ${wantHash}\n  on disk  ${got}`);
        bad++;
      }
    }
    for (const p of all) {
      const name = relName(p);
      if (!(name in manifest.files)) console.error(`NOT IN MANIFEST (new file since build): ${name}`);
    }
    if (bad) {
      console.error(`verify FAILED: ${bad} problems across ${Object.keys(manifest.files).length} manifest entries`);
      process.exit(1);
    }
    log(`verify OK: ${Object.keys(manifest.files).length} files match`);
    return;
  }

  const files = {};
  for (const p of all) files[relName(p)] = sha256File(p);
  writeJson(manifestPath, {
    run: args.run,
    built_at: new Date().toISOString(),
    algorithm: "sha256",
    n_files: Object.keys(files).length,
    files,
  });
  log(`manifest built: ${Object.keys(files).length} files -> ${manifestPath}`);
}

main().catch((e) => {
  console.error(`hash_manifest FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
