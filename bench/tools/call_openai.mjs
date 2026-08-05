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
  // bench/.env must win over an already-set shell variable, not the other way around:
  // Node's process.loadEnvFile() does NOT override a variable already present in
  // process.env, which silently made every call in this project use a stale/shared
  // shell-level OPENAI_API_KEY instead of this project's own key in bench/.env for
  // an entire session (2026-07-28) — the file was correct the whole time, the shell
  // env var was shadowing it. Read the file directly and prefer it explicitly.
  const fileKey = readEnvFileKey("OPENAI_API_KEY");
  const shellKey = process.env.OPENAI_API_KEY;
  if (fileKey && shellKey && fileKey !== shellKey) {
    log(
      `NOTE: bench/.env's OPENAI_API_KEY differs from an already-set shell OPENAI_API_KEY ` +
        `(shell ends ...${shellKey.slice(-4)}, file ends ...${fileKey.slice(-4)}) — using the ` +
        `file's value. bench/.env always takes precedence over the shell environment here.`,
    );
  }
  const key = fileKey || shellKey;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not set. Set it as an environment variable, or create bench/.env " +
        "with OPENAI_API_KEY=sk-... (bench/.gitignore already excludes .env). Never paste " +
        "the key into a prompt, a committed file, or chat.",
    );
  }
  return key;
}

// Minimum reasoning_effort value per model family, verified live rather than assumed
// (METHODOLOGY §2.5 disclosure requirement: state exactly what was sent, not a nominal
// guess). gpt-5.5 rejected "minimal" on 2026-07-28 with the API's own valid-values list
// (none/low/medium/high/xhigh) — a different scale than earlier gpt-5 ids (minimal/low/
// medium/high). Extend this map, don't guess, if a new model needs a new minimum.
const REASONING_EFFORT_MIN = {
  "gpt-5.5": "none",
};

function minReasoningEffort(model) {
  if (REASONING_EFFORT_MIN[model]) return REASONING_EFFORT_MIN[model];
  if (model.startsWith("gpt-5")) return "minimal";
  return undefined;
}

// §0 retrieval-delta arm: OpenAI's vendor-native web_search tool is exposed via
// the Responses API, not chat/completions. Same instruction contract; the model
// may search, the output must still be ONLY the JSON array.
async function callOnceResponses(apiKey, model, system, user, { tools, reasoningEffort } = {}) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      instructions: system,
      input: user,
      ...(tools ? { tools } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    }),
    signal: AbortSignal.timeout(600000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: res.status, ok: false, raw: text, error: "non_json_response" };
  }
  if (!res.ok) return { status: res.status, ok: false, raw: text, error: body?.error?.message ?? `http_${res.status}` };
  // Responses API: concatenate output_text parts from message items.
  const parts = [];
  for (const item of body?.output ?? []) {
    if (item.type === "message") {
      for (const c of item.content ?? []) {
        if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
      }
    }
  }
  if (!parts.length) return { status: res.status, ok: false, raw: text, error: "no_output_text" };
  return { status: res.status, ok: true, content: parts.join(""), usage: body.usage };
}

async function callOnce(apiKey, model, system, user, arm = "uniform") {
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
      // §2.5 as-deployed arm: vendor defaults — no reasoning_effort override at
      // all. Uniform arm keeps the verified per-model minimum.
      ...(arm !== "deployed" && minReasoningEffort(model) ? { reasoning_effort: minReasoningEffort(model) } : {}),
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

async function callWithRetry(apiKey, model, system, user, { arm = "uniform", retrieval = false, api = "chat", responsesMinEffort } = {}) {
  const backoff = [2000, 5000, 12000];
  let lastErr;
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    const r = retrieval
      ? await callOnceResponses(apiKey, model, system, user, { tools: [{ type: "web_search" }] })
      : api === "responses"
        ? await callOnceResponses(apiKey, model, system, user, { reasoningEffort: arm === "deployed" ? undefined : responsesMinEffort })
        : await callOnce(apiKey, model, system, user, arm);
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
    arm: { type: "string" },
    retrieval: { type: "boolean" },
    api: { type: "string" },
    "responses-min-effort": { type: "string" },
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
    const r = await callWithRetry(apiKey, args.model, prompt.system, prompt.user, { arm: args.arm ?? "uniform", retrieval: Boolean(args.retrieval), api: args.api ?? "chat", responsesMinEffort: args["responses-min-effort"] });
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
