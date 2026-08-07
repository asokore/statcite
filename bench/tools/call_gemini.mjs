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
  --skip-existing  Resume: skip batches whose raw output file already exists.
  --gap-ms N     Pause between successful calls (default 250; raise to pace
                 around free-tier per-minute quotas).
  --help         Show this help.

Writes runs/{RUN}/raw/<model>/batch-NN.txt — the exact response text, unmodified,
so parse_responses.mjs's strict-JSON-array parse applies identically to every
model regardless of how its raw output was produced.

On a free-tier DAILY quota error, the script stops immediately instead of
retrying or moving to the next batch — every remaining call would fail
identically, and retrying only spends more of the same exhausted quota.
Re-invoke with --skip-existing once the quota resets.`;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 599]);
const MIN_GAP_MS = 250; // politeness, not a workaround — same posture as call_openai.mjs.

// Free-tier 429s carry the server's own RetryInfo ("retryDelay": "9s") and/or a
// "Please retry in 9.35s" message. Waiting less than that guarantees another 429,
// which is exactly how the 2026-08-05 R2 uniform pass lost 9 of 14 batches with
// the fixed [2s,5s,12s] backoff. Honor the server's number when it gives one.
export function serverRetryDelayMs(r) {
  const text = `${r?.raw ?? ""} ${r?.error ?? ""}`;
  const m = text.match(/retry(?:Delay["\s:]+|\s+in\s+)(\d+(?:\.\d+)?)s/i);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : undefined;
}

// Quota-exhaustion detection, learned the hard way across THREE failed sweeps
// (2026-08-06). Google's free-tier daily-cap 429 comes in at least two body
// shapes: one carries the metric name ("..._free_tier_requests, limit: 20") plus
// a RetryInfo hint; the other — observed on the retrieval arm — is a bare
// RESOURCE_EXHAUSTED with NO metric, NO RetryInfo, nothing but a Help link. A
// metric-name regex therefore can never be a reliable detector (the first fix
// attempted exactly that, tested green against the first shape, and silently
// never fired against the second, burning ~70 requests of retry ladder). The
// robust rule is behavioral:
//   - quota 429 WITHOUT a server retry hint => the server itself offers no
//     recovery time; treat as a dead daily bucket and stop immediately.
//   - quota 429 WITH a retry hint => honor the hint once (rolling windows do
//     clear), but do not ride the full ladder against a quota error.
// The batch loop adds a second layer: two consecutive batches ending in quota
// exhaustion abort the whole sweep.
export function isQuotaError(r) {
  if (r?.status !== 429) return false;
  const text = `${r?.raw ?? ""} ${r?.error ?? ""}`;
  return /RESOURCE_EXHAUSTED/i.test(text) || /exceeded your current quota/i.test(text);
}

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
  const backoff = [5000, 15000, 35000, 65000];
  let quotaRetries = 0;
  let lastErr;
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    let r;
    try {
      r = await callOnce(apiKey, model, system, user, retrieval);
    } catch (e) {
      r = { status: 599, ok: false, error: String(e?.message ?? e) };
    }
    if (r.ok) return r;
    if (isQuotaError(r)) {
      const serverMs = serverRetryDelayMs(r);
      // No recovery hint from the server => dead daily bucket. Stop now.
      if (!serverMs) return { ...r, quotaExhausted: true };
      // Hinted quota error: honor the hint once — a rolling window clears in
      // tens of seconds; a daily cap that keeps 429ing after an honored hint
      // is exhausted, and riding the rest of the ladder just burns budget.
      if (quotaRetries >= 1) return { ...r, quotaExhausted: true };
      quotaRetries++;
      await new Promise((res) => setTimeout(res, serverMs + 1000));
      continue;
    }
    if (!RETRY_STATUSES.has(r.status) || attempt === backoff.length) return r;
    lastErr = r;
    const serverMs = serverRetryDelayMs(r);
    await new Promise((res) => setTimeout(res, Math.max(backoff[attempt], serverMs ? serverMs + 1000 : 0)));
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
    "skip-existing": { type: "boolean" },
    "gap-ms": { type: "string" },
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
  let consecutiveQuotaFails = 0;
  const gapMs = args["gap-ms"] ? parseInt(args["gap-ms"], 10) : MIN_GAP_MS;
  for (const file of batchFiles) {
    const prompt = readJson(path.join(promptsDir, file));
    const outPath = path.join(rawDir, file.replace(/\.json$/, ".txt"));
    // Resume support: a raw file that already exists is a completed batch from a
    // prior invocation of this same script — never re-call (and re-randomize) it.
    if (args["skip-existing"] && fs.existsSync(outPath)) {
      log(`  skip ${prompt.batch_id} — raw output already exists`);
      continue;
    }
    if (args["dry-run"]) {
      log(`  [dry-run] would POST batch ${prompt.batch_id} (${prompt.qids.length} qids, system ${prompt.system.length} chars, user ${prompt.user.length} chars) -> ${outPath}`);
      continue;
    }
    const r = await callWithRetry(apiKey, args.model, prompt.system, prompt.user, Boolean(args.retrieval));
    if (r.quotaExhausted) {
      failed++;
      log(`  QUOTA EXHAUSTED on ${prompt.batch_id}: ${r.error ?? `http_${r.status}`}`);
      log(`    body: ${String(r.raw ?? "").replace(/\s+/g, " ").slice(0, 300)}`);
      log(`  stopping now — a quota 429 with no recovery hint (or persisting past an honored hint) is a dead daily bucket; every remaining batch would fail identically. Re-run with --skip-existing after the quota resets.`);
      break;
    }
    if (!r.ok) {
      failed++;
      log(`  FAILED ${prompt.batch_id}: ${r.error ?? `http_${r.status}`}`);
      if (isQuotaError(r)) {
        consecutiveQuotaFails++;
        if (consecutiveQuotaFails >= 2) {
          log(`  stopping — ${consecutiveQuotaFails} consecutive batches ended in quota errors; the bucket is not recovering within this sweep. Re-run with --skip-existing later.`);
          break;
        }
      }
      continue;
    }
    consecutiveQuotaFails = 0;
    writeText(outPath, r.content);
    done++;
    const tokens = r.usage ? `${r.usage.totalTokenCount} tokens` : "ok";
    log(`  ${prompt.batch_id} -> ${outPath} (${tokens}${r.finishReason && r.finishReason !== "STOP" ? `, finishReason=${r.finishReason}` : ""})`);
    await new Promise((res) => setTimeout(res, gapMs));
  }
  if (args["dry-run"]) {
    log(`dry run complete — no API calls made, no cost incurred, no files written`);
    return;
  }
  log(`${args.model}: ${done} batches called, ${failed} failed. Raw outputs under ${rawDir}`);
  if (failed) process.exitCode = 1;
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`call_gemini FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
