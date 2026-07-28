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

## Second vendor key: obtained and tested (2026-07-28)

Gemini key created (Google AI Studio, "Default Gemini Project", key named
`statcite-bench` in `bench/.env` as `GEMINI_API_KEY`, never handled by the
agent — the owner pasted it directly into the file). `tools/call_gemini.mjs`
built to the exact same prompt-in/raw-out contract as `call_openai.mjs`.

**Model availability, verified live, not assumed:**
- `gemini-2.5-flash`, `gemini-2.5-flash-lite` — reject with "no longer
  available to new users."
- `gemini-2.0-flash` — free-tier quota is exactly 0 for this project/account.
- `gemini-3-flash-preview` — **works.** Real test call returned a correctly
  formatted response (210 tokens, valid JSON array matching the harness
  contract). **Decision: this is the Gemini roster entry for Full Run 1.**
  Caveat to disclose in `models.json`: this is a *preview* model, which can
  change behavior or be deprecated mid-run without notice — a real limitation,
  not just a formality, and the only model of the ones tried that this key
  can actually call.

## New blocker found (2026-07-28): the OpenAI key stopped working

Testing the OpenAI path for real (not dry-run) before freezing the roster
surfaced a problem: **every OpenAI model tried — `gpt-4o-mini` (the same
model that returned a real, correct 161-token response earlier this
session), `gpt-5-mini`, `gpt-5.5` — now fails identically:**

> "You exceeded your current quota, please check your plan and billing details."

This is account-level, not model-level (three different models, identical
error). The API key itself is still valid (the error is a quota/billing
response, not an auth failure). Checking `/v1/organization/costs` for a
diagnosis hit a separate permissions wall (the key lacks the
`api.usage.read` scope), so the cause can't be confirmed from this session —
it needs the owner to check the OpenAI platform billing/usage page directly.
Possible causes, not verified: the $10 credit didn't actually apply to the
project this key is scoped to, auto-recharge is off and the balance is
genuinely at $0, or a billing/payment-method issue paused the account.

**Net effect: Full Run 1 is blocked again, same COVENANT §6 gate, different
cause.** Gemini alone is one non-Anthropic vendor, same as OpenAI alone was
before — two working non-Anthropic vendors are still needed at the same time.

**Next step (owner action):** check https://platform.openai.com/settings/organization/billing
for the actual balance/status, fix whatever it shows, then say so — the
Gemini side needs no further action and `gpt-5.5` is the intended roster
entry once billing is confirmed working (current-generation flagship,
picked over the oddly-named unversioned `gpt-5.6-*` variants which look
experimental/limited-access).

## What's ready now (as of 2026-07-28)

- **Ground truth: frozen and audited clean.** `snapshots/R1/{ground_truth,audit,revision_check}.json`
  — 122/122 rows, 0 violations, all data-bearing rows current, 18 `imf/`-routed
  cells reproduced with zero divergence (the `imf/` audit-fetcher fix and the
  v1.3.0 DataMapper-as-primary path both hold up at real scale). This does not
  need to be redone regardless of how the OpenAI blocker resolves.
- **Question bank: `questions/R1.json`**, a verbatim copy of `questions/P0.json`
  (same 122 questions, same qids) — decided: reuse, not redraw. No `R1-batches.json`
  exists yet (the per-model batch/order file) — that's generated right before
  the pre-registration freeze, once the roster is final, using the documented
  deterministic formula in `generate_bank.mjs` (`shuffle(qids,
  rngFromHex(deriveSeed(seed, "{model}:{batch_id}")))`) so the 4 existing Claude
  orders are exactly reproducible and the 2 new vendors get orders from the same
  formula — not a fresh draw, not hand-picked.
- **`tools/call_openai.mjs`** — built, dry-run verified, and real-call verified
  earlier this session (161-token `gpt-4o-mini` response). **Now blocked** — see
  the OpenAI section above; the code itself is not in question.
- **`tools/call_gemini.mjs`** — built and real-call verified against
  `gemini-3-flash-preview` (see above).
- `bench/.gitignore` excludes `.env`; both `OPENAI_API_KEY` and `GEMINI_API_KEY`
  load via Node's built-in `process.loadEnvFile`, no dependency, never committed.

## Remaining before the pre-registration freeze

1. **Roster — settled:** `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`,
   `claude-fable-5` (unchanged from P0, via Claude Code subagents same as P0),
   `gpt-5.5` (OpenAI, blocked pending billing fix), `gemini-3-flash-preview`
   (Google, working). 6 models, 3 vendors — satisfies COVENANT §6 once OpenAI
   is unblocked.
2. **Temperature / reasoning settings**, to disclose in `models.json` the same
   honest way as Claude's: OpenAI arm sends `reasoning_effort: "minimal"` for
   `gpt-5.*` models, no temperature override (some `gpt-5` models reject a
   nonzero value when `reasoning_effort` is set); Gemini arm sends no
   generation-config override at all — nominal defaults, not independently
   verified as "minimal," disclosed as such rather than assumed.
3. **Extend `R1-batches.json`'s `model_order`** for `gpt-5.5` and
   `gemini-3-flash-preview` using the exact formula above, then update
   `models.json` to the 6-model roster, then run `make_prompts.mjs --run R1`.
4. **Freeze:** commit + tag `prereg-R1` (same pattern as `prereg-P0`) — only
   after the OpenAI blocker clears, since freezing now would either omit a
   vendor (back to one-vendor quarantine) or freeze a roster entry that can't
   actually be called yet.

## Root cause found and fixed (2026-07-28)

The OpenAI billing page (checked live, `platform.openai.com/settings/organization/billing`)
showed credit balance **-$0.12** — not a huge deficit, but enough to hard-block
every request regardless of model, since auto-recharge is off. Usage breakdown
(`platform.openai.com/usage/chat-completions`) showed the entire draw: **5.431M
input tokens on `gpt-5_5-2026-04-23`**, not on anything this session called
(my one real `gpt-4o-mini` test this session used 118 input tokens, exactly
matching the earlier-session record; my one `gpt-5.5` test today failed
instantly on a quota rejection before any generation, so it billed nothing).

API Keys page named the actual source: **two keys exist on this account** —
`statcite-bench` (created 2026-07-26, this project's key, **$0.00 monthly
spend**) and **`OpenClaw`** (created 2026-04-03, months before this project,
**$10.12 monthly spend**, last used the same day the account was topped up).
OpenClaw is the third autonomous engine on this operator's machine (alongside
Claude Code and ChatGPT Cowork, per the operator's own multi-engine
discipline note) and evidently shares this OpenAI account/project with no
budget isolation from `statcite-bench`.

**Owner action taken:** OpenClaw's key revoked via the API Keys page
(2026-07-28) — it no longer appears in the Active key list. `statcite-bench`
is untouched, $0.00 spend, ready for a fresh top-up whenever the owner adds
one. OpenAI's key-level edit dialog only exposes name/permissions, no
per-key dollar cap; project-level "Usage limits" would have capped both keys
together, not isolated one from the other, so revoking the second engine's
key was the correct fix, not a project-limit workaround.

This is a distinct, real root cause from Gemini's blocker — it has nothing to
do with model choice or quota tiers, only with a second, older key on the
same account spending against the same balance. Once a fresh top-up lands,
the roster (§ above) is otherwise ready to freeze and run.
