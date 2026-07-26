// bench/tools/call_openai.mjs — call the OpenAI API for a non-Anthropic roster entry.
//
// P0's roster was invoked as Claude Code subagents (see models.json) — there was no
// API-calling code because there was no API to call. COVENANT §6 requires at least
// two non-Anthropic vendors before any result is citable, so Full Run 1 needs an
// actual API path. This is that path for OpenAI, structured to slot into the exact
// same prompt-in/raw-out contract the rest of the harness already expects:
//   reads  {base}/runs/{run}/prompts/<model>/batch-NN.json  (written by make_prompts.mjs)
//   writes {base}/runs/{run}/raw/<model>/batch-NN.txt        (read by parse_responses.mjs)
// So parse_responses.mjs, score.mjs, and report.mjs work unmodified regardless of
// whether a raw/ file came from a Claude subagent or this script.
//
// Requires OPENAI_API_KEY in the environment or a bench/.env file (bench/.gitignore
// covers .env — never commit a key). Never logs the key; only its presence/absence.

import { benchPaths, log, parseArgs, readJson, writeText } from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const HELP = `call_openai.mjs — call the OpenAI API for one model's batch prompts

Usage: node call_openai.mjs --run R1 --model gpt-5 [--base DIR] [--limit N] [--dry-run] [--help]

  --run RUN      Run id whose runs/{RUN}/prompts/<model>/*.json to call.
  --model MODEL  Roster key AND OpenAI model id to call (e.g. "gpt-5"). Prompts
                 must already exist at runs/{RUN}/prompts/<model>/.
  --base DIR     Base directory (default bench/).
  --limit N      Only call the first N batches (cost control / smoke test).
  --dry-run      Build requests and print what would be sent; make no API calls,
                 write no files, spend no money.
  --help         Show this help.

Writes runs/{RUN}/raw/<model>/batch-NN.txt — the exact response text, unmodified,
so parse_responses.mjs's strict-JSON-array parse applies identically to every
model regardless of how its raw output was produced.`;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MIN_GAP_MS = 250; // OpenAI's own rate limits are generous; this is politeness, not a workaround.

function loadKey() {
  try {
    process.loadEnvFile(path.join(import.meta.dirname, "..", ".env"));
  } catch {
    /* no .env file — fine, may already be in the environment */
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not set. Set it as an environment variable, or create bench/.env " +
        "with OPENAI_API_KEY=sk-... (bench/.gitignore already excludes .env). Never paste " +
        "the key into a prompt, a committed file, or chat.",
    );
  }
  return key;
}

async function callOnce(apiKey, model, system, user) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Uniform-protocol arm (METHODOLOGY §2.5, models.json settings_notes): minimum
      // reasoning, no tools, no structured-output mode — the model gets exactly the
      // same "answer from memory, output a JSON array" instruction the Claude arm
      // gets, nothing more. temperature omitted (some models reject a nonzero value
      // when reasoning_effort is set; leaving unset is the honest disclosed setting,
      // same posture as models.json's Claude entries).
      ...(model.startsWith("gpt-5") ? { reasoning_effort: "minimal" } : {}),
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
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return { status: res.status, ok: false, raw: text, error: "no_message_content" };
  return { status: res.status, ok: true, content, usage: body.usage };
}

async function callWithRetry(apiKey, model, system, user) {
  const backoff = [2000, 5000, 12000];
  let lastErr;
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    const r = await callOnce(apiKey, model, system, user);
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
    const r = await callWithRetry(apiKey, args.model, prompt.system, prompt.user);
    if (!r.ok) {
      failed++;
      log(`  FAILED ${prompt.batch_id}: ${r.error ?? `http_${r.status}`}`);
      continue;
    }
    writeText(outPath, r.content);
    done++;
    log(`  ${prompt.batch_id} -> ${outPath} (${r.usage ? `${r.usage.total_tokens} tokens` : "ok"})`);
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
  console.error(`call_openai FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
