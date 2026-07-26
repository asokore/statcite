# Full Run 1 — draft plan (NOT a pre-registration)

Status: draft, awaiting owner review. Nothing here is frozen; no model has been
called under this plan. Per COVENANT §7, an actual pre-registration (methodology,
roster, question bank, ground truth) must be frozen *before* any model call, the
same way P0's was. This document exists to make the decisions explicit before
that freeze happens, not to replace it.

## Budget constraint (owner, 2026-07-26)

$10 loaded on the OpenAI account, not being topped up unless revenue justifies it.
Keep any real (non-dry-run) OpenAI usage well inside that — the connectivity test
run cost 161 tokens (a small fraction of a cent), so $10 covers a lot of batches,
but a full 6-model x 13-batch run across all indicators should still be estimated
before running, not assumed. Gemini's own free tier may cover that vendor's cost
entirely; check before assuming a matching budget is needed there.

## The blocking catch — read this first

**COVENANT §6: "The first citable cross-model result requires at least two
non-Anthropic vendors."** An OpenAI key alone gets the roster to one non-Anthropic
vendor (OpenAI/GPT), not two. A run with Claude + GPT only would still be quarantined
under the same rule that quarantined P0 — it would not be citable as a cross-model
finding, just a bigger pilot.

**To actually produce a citable Full Run 1, a second non-Anthropic vendor is needed
— most naturally Google (Gemini), via a Google AI Studio / Vertex API key.** Same
account-creation-and-billing situation as OpenAI: that's the owner's action, not
something to do inside this session. Worth deciding now whether to get both keys
in one pass rather than running twice.

## What's ready now

- `tools/call_openai.mjs` — reads `runs/{run}/prompts/<model>/*.json` (from the
  existing `make_prompts.mjs`, unchanged), calls the OpenAI Chat Completions API,
  writes `runs/{run}/raw/<model>/*.txt` in the exact shape `parse_responses.mjs`
  already expects. Verified with `--dry-run` against a synthetic prompt file:
  builds the right request, writes to the right path, makes no network call.
  Untested against the real API (no key available in this session).
- `bench/.gitignore` now excludes `.env` — a key dropped in `bench/.env` as
  `OPENAI_API_KEY=sk-...` is picked up automatically (Node's built-in
  `process.loadEnvFile`, no dependency) and never risks being committed.
- A second tool in the same shape (`call_gemini.mjs` or similar) is a short
  follow-on once there's a second vendor to call — same contract, different
  endpoint and auth header.

## What still needs a decision before pre-registering

1. **Roster.** Proposed: keep the 4 Claude models from P0 (comparability with the
   pilot), add one OpenAI model (a current flagship, e.g. whatever GPT-5 variant
   is current when this runs) and one Google model (current Gemini flagship).
   6 models total, 3 vendors, satisfies COVENANT §6.
2. **Question bank: reuse P0's 100 questions, or redraw fresh?** Reusing
   `questions/P0.json` verbatim gives a clean apples-to-apples read against the
   P0 pilot numbers (quarantined but still informative as an internal check) and
   skips the ~4-hour frame re-enumeration `enumerate_frame.mjs` needed the first
   time. Recommended: reuse the question text and qids, but **re-freeze ground
   truth fresh** (see below) — the questions ("what was X's Y in year Z") don't
   go stale, but the served *values* can have revised since 2026-07-25, and the
   whole point of Full Run 1 is scoring against current, correct ground truth.
3. **Ground truth refresh, now safe to do because of two fixes already shipped:**
   - `imf/` audit support (this session) — the 6 DataMapper-served indicators
     will no longer false-flag as divergent.
   - v1.3.0's DataMapper-as-primary path — ground truth can freeze against the
     IMF's *current* edition rather than whatever DBnomics had ingested (the
     root cause of P0's own vintage-lag limitation, `runs/P0/NOTES.md` N-1).
   Running `snapshot_ground_truth.mjs` + `audit_ground_truth.mjs` against
   `questions/P0.json` under a **new run id** (not `--run P0` — that would touch
   P0's frozen, hashed artifacts) produces a clean, current ground truth ready
   for a Full Run 1 the moment the roster is decided. This is safe, cheap
   (no model calls, no cost), and doesn't commit to anything else above.
4. **Temperature / reasoning settings for the new vendors**, disclosed the same
   honest way `models.json` discloses Claude's (not fully controllable in this
   harness; state exactly what was actually used, don't claim a nominal value
   that wasn't verified).

## Suggested next concrete step

Once the roster question (item 1) is settled: run
`node tools/snapshot_ground_truth.mjs --run R1 --base <staging>` and
`node tools/audit_ground_truth.mjs --run R1 --base <staging>` against a copy of
P0's question bank, under a new run id, to produce a fresh, clean, audited
ground truth — before spending anything on the actual model calls. That step
needs no new API keys and can happen as soon as it's approved.
