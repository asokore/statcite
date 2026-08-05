// bench/tools/beacon_seed.mjs — NIST Randomness Beacon 2.0 seeding (METHODOLOGY §6).
//
// Two modes, run in order:
//   announce : commit-before-knowing. Writes {base}/questions/{run}-seed-announcement.json
//              naming a FUTURE pulse timestamp and the exact derivation formula. This file
//              must be committed (and pushed) before the pulse exists.
//   fetch    : after the announced time, fetches that exact pulse and emits the seed.
//              Verifies the pulse's own timestamp matches the announcement, records the
//              pulse index, outputValue and signatureValue for independent re-derivation,
//              and appends them to the announcement file.
//
// Derivation formula (fixed, stated in the announcement):
//   master seed = SHA-256(outputValue_hex) — 64 hex chars, passed to generate_bank --seed.
//   All downstream per-purpose seeds derive via the existing namespaced deriveSeed().
//
// Fallback (drand, per §6) is deliberately NOT automated: if beacon.nist.gov is down at
// fetch time, re-announce with drand round numbers rather than silently switching source.

import { benchPaths, log, parseArgs, readJson, writeJson } from "./lib.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HELP = `beacon_seed.mjs — NIST beacon seeding for a run (METHODOLOGY §6)

Usage:
  node beacon_seed.mjs --run R2 --announce --minutes-ahead 5 [--base DIR]
  node beacon_seed.mjs --run R2 --fetch [--base DIR]

  --announce        Write the pre-announcement naming a future pulse time.
  --minutes-ahead N Minutes from now for the announced pulse (default 5; the beacon
                    emits one pulse per minute on the minute).
  --fetch           Fetch the announced pulse (must be after the announced time) and
                    print the derived master seed.
  --run RUN         Run id.
  --base DIR        Base directory (default bench/).`;

function announcementPath(paths, run) {
  return path.join(paths.questionsDir, `${run}-seed-announcement.json`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    announce: { type: "boolean" },
    fetch: { type: "boolean" },
    "minutes-ahead": { type: "number" },
    help: { type: "boolean" },
  });
  if (args.help) return void console.log(HELP);
  if (!args.run) throw new Error("--run is required");
  const paths = benchPaths(args.base, args.run);
  const file = announcementPath(paths, args.run);

  if (args.announce) {
    if (fs.existsSync(file)) throw new Error(`${file} already exists — one announcement per run; delete manually only with a logged deviation`);
    const ahead = args["minutes-ahead"] ?? 5;
    const t = new Date(Date.now() + ahead * 60_000);
    t.setUTCSeconds(0, 0); // pulses land on the minute
    const announced = {
      run: args.run,
      announced_at: new Date().toISOString(),
      pulse_time_utc: t.toISOString(),
      pulse_time_ms: t.getTime(),
      source: "NIST Randomness Beacon 2.0",
      pulse_url: `https://beacon.nist.gov/beacon/2.0/pulse/time/${t.getTime()}`,
      derivation: "master_seed = SHA-256(lowercase outputValue hex string); per-purpose seeds via tools/prng.mjs deriveSeed(master_seed, namespace)",
      status: "announced",
    };
    writeJson(file, announced);
    log(`announced pulse at ${announced.pulse_time_utc} -> ${file}`);
    log(`COMMIT AND PUSH THIS FILE BEFORE ${announced.pulse_time_utc}, then run --fetch after that time.`);
    return;
  }

  if (args.fetch) {
    const ann = readJson(file);
    if (ann.status === "fulfilled") {
      log(`already fulfilled; master seed: ${ann.master_seed}`);
      return;
    }
    if (Date.now() < ann.pulse_time_ms) {
      throw new Error(`announced pulse time ${ann.pulse_time_utc} is still in the future — wait, then re-run --fetch`);
    }
    const res = await fetch(ann.pulse_url);
    if (!res.ok) throw new Error(`beacon fetch failed: HTTP ${res.status} — if beacon.nist.gov is down, re-announce with the drand fallback per §6 (logged deviation)`);
    const data = await res.json();
    const pulse = data.pulse;
    const pulseTime = new Date(pulse.timeStamp).getTime();
    // /pulse/time/{ms} returns the pulse at-or-after the requested time; assert it
    // is the announced minute exactly, so the seed is the committed one.
    if (pulseTime !== ann.pulse_time_ms) {
      throw new Error(`pulse timeStamp ${pulse.timeStamp} != announced ${ann.pulse_time_utc} — do not proceed; investigate (beacon gap?) and re-announce with a logged deviation`);
    }
    const outputValue = String(pulse.outputValue).toLowerCase();
    const master = crypto.createHash("sha256").update(outputValue).digest("hex");
    Object.assign(ann, {
      status: "fulfilled",
      fetched_at: new Date().toISOString(),
      chain_index: pulse.chainIndex,
      pulse_index: pulse.pulseIndex,
      output_value: outputValue,
      signature_value: pulse.signatureValue,
      master_seed: master,
    });
    writeJson(file, ann);
    log(`pulse ${pulse.pulseIndex} (chain ${pulse.chainIndex}) fetched; master seed: ${master}`);
    return;
  }

  throw new Error("pass --announce or --fetch (see --help)");
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`beacon_seed FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
