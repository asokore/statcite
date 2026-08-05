// bench/tools/call_gemini.mjs — call the Gemini API for a non-Anthropic roster entry.
//
// Mirrors call_openai.mjs's contract exactly, so parse_responses.mjs, score.mjs, and
// report.mjs work unmodified regardless of which vendor produced a raw/ file:
//   reads  {base}/runs/{run}/prompts/<model>/batch-NN.json  (written by make_prompts.mjs)
//   writes {base}/runs/{run}/raw/<model>/batch-NN.txt        (read by parse_responses.mjs)
//
// Requires GEMINI_API_KEY in the environment or a bench/.env file (bench/.gitignore
// covers .env — never commit a key). Never logs the key; only its presence/absence.
// The key is sent via the x-goog-api-key header, never as a URL query parameter, so
// it never lands in logs, proxies, or browser history the way ?key=... would.

import { benchPaths, log, parseArgs, readJson, writeText } from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const HELP = `call_gemini.mjs — call the Gemini API for one model's batch prompts

Usage: node call_gemini.mjs --run R1 --model gemini-2.5-flash [--base DIR] [--limit N] [--dry-run] [--help]

  --run RUN      Run id whose runs/{RUN}/prompts/<model>/*.json to call.
  --model MODEL  Roster key AND Gemini model id to call (e.g. "gemini-2.5-flash").
                 Prompts must already exist at runs/{RUN}/prompts/<model>/.
  --base DIR     Base directory (default bench/).
  --limit N      Only call the first N batches (cost control / smoke test).
  --dry-run      Build requests and print what would be sent; make no API calls,
                 write no files, spend no money.
  --help         Show this help.

Writes runs/{RUN}/raw/<model>/batch-NN.txt — the exact response text, unmodified,
so parse_responses.mjs's strict-JSON-array parse applies identically to every
model regardless of how its raw output was produced.`;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MIN_GAP_MS = 250; // politeness, not a workaround — same posture as call_openai.mjs.

function readEnvFileKey(varName) {
  try {
    const content = fs.readFileSync(path.join(import.meta.dirname, "..", ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (line.startsWith(`${varName}=`)) return line.slice(varName.length + 1).trim();
    }
  } catch {
    /* no .env file — fine, may already be in the environment */
  }
  return undefined;
}

function loadKey() {
  // bench/.env must win over an already-set shell variable — see call_openai.mjs for
  // why: process.loadEnvFile() doesn't override process.env, which let a stale shell
  // key silently shadow this project's own file for a whole session (2026-07-28).
  const fileKey = readEnvFileKey("GEMINI_API_KEY");
  const shellKey = process.env.GEMINI_API_KEY;
  if (fileKey && shellKey && fileKey !== shellKey) {
    log(
      `NOTE: bench/.env's GEMINI_API_KEY differs from an already-set shell GEMINI_API_KEY ` +
        `(shell ends ...${shellKey.slice(-4)}, file ends ...${fileKey.slice(-4)}) — using the ` +
        `file's value. bench/.env always takes precedence over the shell environment here.`,
    );
  }
  const key = fileKey || shellKey;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY not set. Set it as an environment variable, or add it to bench/.env " +
        "as GEMINI_API_KEY=... (bench/.gitignore already excludes .env). Never paste " +
        "the key into a prompt, a committed file, or chat.",
    );
  }
  return key;
}

async function callOnce(apiKey, model, system, user, retrieval = false) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      // Uniform-protocol arm (METHODOLOGY §2.5, models.json settings_notes): same
      // "answer from memory, output a JSON array" instruction as every other vendor,
      // nothing extra — no tools, no thinking budget override, no response schema.
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      // §0 retrieval-delta arm: Google's vendor-native grounding tool. Uniform
      // arm sends no tools at all.
      ...(retrieval ? { tools: [{ google_search: {} }] } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: res.status, ok: false, raw: text, error: "non_json_response" };
  }
  if (!res.ok) return { status: res.status, ok: false, raw: text, error: body?.error?.message ?? `http_${res.status}` };
  const candidate = body?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const content = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
  if (typeof content !== "string" || content.length === 0) {
    return { status: res.status, ok: false, raw: text, error: `no_content (finishReason=${finishReason ?? "unknown"})` };
  }
  return { status: res.status, ok: true, content, usage: body.usageMetadata, finishReason };
}

async function callWithRetry(apiKey, model, system, user, retrieval = false) {
  const backoff = [2000, 5000, 12000];
  let lastErr;
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    const r = await callOnce(apiKey, model, system, user, retrieval);
    if (r.ok) return r;
    if (!RETRY_STATUSES.has(r.status) || attempt === backoff.length) return r;
    lastErr = r;
    await new Promise((res) => setTimeout(res, backoff[attempt]));
  }
  return lastErr;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    model: { type: "string" },
    base: { type: "string" },
    limit: { type: "string" },
    "dry-run": { type: "boolean" },
    retrieval: { type: "boolean" },
    help: { type: "boolean" },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.run) throw new Error("--run is required (see --help)");
  if (!args.model) throw new Error("--model is required (see --help)");
  const paths = benchPaths(args.base, args.run);
  const promptsDir = path.join(paths.runDir, "prompts", args.model);
  if (!fs.existsSync(promptsDir)) {
    throw new Error(`no prompts found at ${promptsDir} — run make_prompts.mjs for this run first`);
  }
  let batchFiles = fs.readdirSync(promptsDir).filter((f) => f.endsWith(".json")).sort();
  if (args.limit) batchFiles = batchFiles.slice(0, parseInt(args.limit, 10));
  log(`${args.model}: ${batchFiles.length} batch(es) to call${args["dry-run"] ? " (dry run)" : ""}`);

  const apiKey = args["dry-run"] ? "DRY-RUN-NO-KEY-NEEDED" : loadKey();
  const rawDir = path.join(paths.runDir, "raw", args.model);
  fs.mkdirSync(rawDir, { recursive: true });

  let done = 0;
  let failed = 0;
  for (const file of batchFiles) {
    const prompt = readJson(path.join(promptsDir, file));
    const outPath = path.join(rawDir, file.replace(/\.json$/, ".txt"));
    if (args["dry-run"]) {
      log(`  [dry-run] would POST batch ${prompt.batch_id} (${prompt.qids.length} qids, system ${prompt.system.length} chars, user ${prompt.user.length} chars) -> ${outPath}`);
      continue;
    }
    const r = await callWithRetry(apiKey, args.model, prompt.system, prompt.user, Boolean(args.retrieval));
    if (!r.ok) {
      failed++;
      log(`  FAILED ${prompt.batch_id}: ${r.error ?? `http_${r.status}`}`);
      continue;
    }
    writeText(outPath, r.content);
    done++;
    const tokens = r.usage ? `${r.usage.totalTokenCount} tokens` : "ok";
    log(`  ${prompt.batch_id} -> ${outPath} (${tokens}${r.finishReason && r.finishReason !== "STOP" ? `, finishReason=${r.finishReason}` : ""})`);
    await new Promise((res) => setTimeout(res, MIN_GAP_MS));
  }
  if (args["dry-run"]) {
    log(`dry run complete — no API calls made, no cost incurred, no files written`);
    return;
  }
  log(`${args.model}: ${done} batches called, ${failed} failed. Raw outputs under ${rawDir}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`call_gemini FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
