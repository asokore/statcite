// bench/tools/parse_responses.mjs — ingest raw model outputs (METHODOLOGY §2.4).
//
// Reads {base}/runs/{run}/raw/<model>/batch-NN.txt (and batch-NN.repair.txt if the
// one permitted repair reprompt was used). Strict JSON-array parse: the trimmed file
// must BE a JSON array — no fence stripping, no salvage (fenced output is exactly
// what the repair reprompt exists for). Alignment is qid-keyed. Questions that
// cannot be aligned to a valid object become format_failure records (excluded from
// all accuracy denominators, reported as an own rate).
//
// Output: {base}/runs/{run}/responses/<model>.json.

import { MODELS, benchPaths, log, parseArgs, readJson, writeJson } from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const HELP = `parse_responses.mjs — parse raw batch outputs into aligned responses (METHODOLOGY §2.4)

Usage: node parse_responses.mjs --run P0 [--base DIR] [--help]

  --run RUN    Run id.
  --base DIR   Base directory (default bench/).
  --help       Show this help.

Reads runs/{RUN}/raw/<model>/batch-NN.txt (+ optional .repair.txt), writes
runs/{RUN}/responses/<model>.json. Missing raw files and unparseable batches
become format_failure records for every qid in the batch.`;

/** Strict parse: trimmed text (BOM tolerated) must be exactly one JSON array. */
function strictParseArray(text) {
  const t = text.replace(/^﻿/, "").trim();
  if (!t.startsWith("[")) return { ok: false, reason: "not_a_json_array" };
  let parsed;
  try {
    parsed = JSON.parse(t);
  } catch (e) {
    return { ok: false, reason: `json_parse_error: ${e.message.slice(0, 120)}` };
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: "parsed_but_not_array" };
  return { ok: true, arr: parsed };
}

function normalizeItem(raw, flags) {
  const rec = {
    value: null, unit: null, year_basis: null, confidence: null, refused: false, basis_note: null,
  };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    flags.push("item_not_object");
    return rec;
  }
  if (typeof raw.value === "number" && Number.isFinite(raw.value)) rec.value = raw.value;
  else if (raw.value === null || raw.value === undefined) rec.value = null;
  else {
    rec.value = null;
    flags.push("value_not_number");
  }
  if (typeof raw.unit === "string") rec.unit = raw.unit;
  else if (raw.unit != null) flags.push("unit_not_string");
  if (Number.isInteger(raw.year_basis)) rec.year_basis = raw.year_basis;
  else if (raw.year_basis != null) flags.push("year_basis_not_integer");
  if (typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1) rec.confidence = raw.confidence;
  else if (raw.confidence != null) flags.push("confidence_invalid");
  if (typeof raw.refused === "boolean") rec.refused = raw.refused;
  else if (raw.refused != null) flags.push("refused_not_boolean");
  else flags.push("refused_missing");
  if (typeof raw.basis_note === "string") rec.basis_note = raw.basis_note.slice(0, 140);
  return rec;
}

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
  const batchesFile = readJson(paths.batches);
  const rawDir = path.join(paths.runDir, "raw");
  const outDir = path.join(paths.runDir, "responses");

  for (const model of MODELS) {
    // A model that was never called (no raw dir, or a dir with zero raw files —
    // e.g. an access-gap or billing-blocked roster entry, D-009/D-011) must NOT
    // get a responses file: score.mjs skips on the responses file's absence, and
    // an all-format_failure file would render "not called" as "tested and
    // failed 100%". Absence is reported as an access gap, never as a score.
    const modelRawDir = path.join(rawDir, model);
    const hasAnyRaw = fs.existsSync(modelRawDir) && fs.readdirSync(modelRawDir).some((f) => f.endsWith(".txt"));
    if (!hasAnyRaw) {
      const stale = path.join(outDir, `${model}.json`);
      if (fs.existsSync(stale)) fs.rmSync(stale);
      log(`SKIP ${model}: no raw outputs (not called in this run) — no responses file written`);
      continue;
    }
    const items = {};
    const formatFailures = [];
    const batchStats = [];
    for (const batch of batchesFile.batches) {
      const expected = batchesFile.model_order[model]?.[batch.batch_id] ?? batch.qids;
      const base = path.join(rawDir, model, batch.batch_id);
      const rawPath = `${base}.txt`;
      const repairPath = `${base}.repair.txt`;
      const stat = { batch_id: batch.batch_id, raw_present: fs.existsSync(rawPath), repair_present: fs.existsSync(repairPath) };

      if (!stat.raw_present && !stat.repair_present) {
        stat.outcome = "missing_raw";
        for (const qid of expected) {
          items[qid] = { qid, format_failure: true, failure_reason: "missing_raw", batch_id: batch.batch_id };
          formatFailures.push(qid);
        }
        batchStats.push(stat);
        continue;
      }

      // §2.4: original output first; if schema-invalid, exactly one repair attempt.
      let parsed = null;
      let repaired = false;
      if (stat.raw_present) {
        const p = strictParseArray(fs.readFileSync(rawPath, "utf8"));
        if (p.ok) parsed = p.arr;
        else stat.raw_parse_error = p.reason;
      }
      if (!parsed && stat.repair_present) {
        const p = strictParseArray(fs.readFileSync(repairPath, "utf8"));
        if (p.ok) {
          parsed = p.arr;
          repaired = true;
        } else stat.repair_parse_error = p.reason;
      }
      if (!parsed) {
        stat.outcome = "format_failure_batch";
        for (const qid of expected) {
          items[qid] = { qid, format_failure: true, failure_reason: stat.raw_parse_error ?? stat.repair_parse_error ?? "unparseable", batch_id: batch.batch_id };
          formatFailures.push(qid);
        }
        batchStats.push(stat);
        continue;
      }

      // qid-keyed alignment (the whole point of the mandatory qid echo).
      const byQid = new Map();
      const extraneous = [];
      const duplicates = [];
      for (const rawItem of parsed) {
        const qid = rawItem && typeof rawItem === "object" && typeof rawItem.qid === "string" ? rawItem.qid.trim() : null;
        if (!qid || !expected.includes(qid)) {
          extraneous.push(rawItem?.qid ?? "(no qid)");
          continue;
        }
        if (byQid.has(qid)) {
          duplicates.push(qid);
          continue; // first occurrence wins
        }
        byQid.set(qid, rawItem);
      }
      for (const qid of expected) {
        const rawItem = byQid.get(qid);
        if (!rawItem) {
          items[qid] = { qid, format_failure: true, failure_reason: "qid_missing_from_output", batch_id: batch.batch_id, repaired };
          formatFailures.push(qid);
          continue;
        }
        const flags = [];
        const rec = normalizeItem(rawItem, flags);
        items[qid] = { qid, ...rec, repaired, parse_flags: flags, batch_id: batch.batch_id };
      }
      stat.outcome = "parsed";
      stat.repaired = repaired;
      stat.n_items = parsed.length;
      stat.n_aligned = byQid.size;
      if (extraneous.length) stat.extraneous_qids = extraneous;
      if (duplicates.length) stat.duplicate_qids = duplicates;
      batchStats.push(stat);
    }

    writeJson(path.join(outDir, `${model}.json`), {
      run: args.run,
      model,
      parsed_at: new Date().toISOString(),
      n_questions: Object.keys(items).length,
      n_format_failures: formatFailures.length,
      format_failures: formatFailures.sort(),
      batches: batchStats,
      items,
    });
    log(`${model}: ${Object.keys(items).length} aligned, ${formatFailures.length} format failures`);
  }
  log(`responses written under ${outDir}`);
}

main().catch((e) => {
  console.error(`parse_responses FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
