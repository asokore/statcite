# The AI Economic-Statistics Accuracy Benchmark — Methodology

**Version:** 1.0.0-P0 (pilot pre-registration) · **Date frozen:** 2026-07-25 · **Repo:** github.com/asokore/statcite (`bench/`)
**Status:** this document, the covenant, the question generator, the scoring code, and the tolerance constants are committed and third-party-timestamped **before any model is queried**. Post-freeze changes are logged in `DEVIATIONS.md` and never edit this file.

This methodology was produced by synthesizing three independently drafted designs (measurement/statistics, operations/reproducibility, credibility/attack-surface) which were then adversarially reviewed by two further independent critics before synthesis. The full panel record is preserved in the repo history.

---

## 0. Estimand, scope, and the conflict of interest

**Estimand.** For each model M under a fixed elicitation protocol: the probability that M, answering **from parametric memory only** (no tools, no retrieval, no web), states a figure for an official economic statistic that falls within the pre-registered tolerance band of the current official value.

**Scope claim (binding wording for every publication of results):**

> This benchmark measures one thing: how reliably AI assistants state official economic statistics from memory — no tools, no retrieval, no web. It is not a measure of what AI can do with a data connection. It is a measure of what happens in the many real conversations where no data connection is used, and in the moments when a model answers from memory because it believes it knows.
>
> Read the scores as a trust ceiling for uncited figures: a model's accuracy here tells you how far to trust a number it states in a chat window without a citation — nothing more, and nothing less.

**Mandatory concession (verbatim in every report):** "Agentic deployments with retrieval will outperform these scores. That is expected and is not what this benchmark measures." A retrieval-delta arm (vendor-native tools, never StatCite itself) is pre-registered for the first multi-vendor run.

**Conflict of interest, in plain words:** StatCite benefits commercially if models score poorly. That is why the methodology was frozen before results, the scoring is deterministic and re-runnable by anyone, the "models are accurate" outcome has a pre-committed publication plan (§8), and the publication covenant (`COVENANT.md`) binds how results may be quoted. The two purposes of this benchmark — falsification test of StatCite's premise, and credibility asset if the premise holds — are both real. Neither is hidden.

**Related work and novelty scope.** OpenAI's SimpleQA / SimpleQA Verified established the short-form parametric-factuality protocol this benchmark descends from; AfriEconQA (arXiv 2601.15297) is the nearest economics benchmark but targets retrieval-grounded analysis QA, not parametric numeric recall of official statistics; the Stanford RegLab legal-hallucination study is the domain-specific precedent pattern. The claim made here is scoped accordingly: **the first revision-aware, tolerance-banded, vintage-cited benchmark of parametric recall of official macroeconomic statistics** — not "the first benchmark of AI on economics."

---

## 1. Sampling frame

### 1.1 The eligible cell universe is enumerated and published first

The frame is the full cross-product of **12 eligible indicators × all registry economies in the four tiers × reference years 2018–2022**, with eligibility of every cell determined mechanically by `bench/tools/enumerate_frame.mjs`: the cell's official value must exist, be non-null, and be a published outturn (`is_projection == false`). Every *drawn* question additionally round-trips through `/v1/verify` as a `match` against its own ground-truth value before entering the bank (verifying the resolution path, period matching, and series identity end-to-end). **The full frame with per-cell eligibility and the attrition table (by tier × indicator × reason) is committed as `bench/frame/` before sampling.** Every claim in every report is conditional on this frame ("StatCite-verifiable, non-projection cells"), and the attrition table makes the conditioning inspectable — the known failure mode this prevents is silent survivorship: "small-economy accuracy" quietly becoming "accuracy on well-documented small economies."

### 1.2 Indicators: 12 registry keys in 3 revision classes

Revision class is the primary indicator stratum because it drives tolerance bands (§4) and because revision behavior — not topic — is the dimension critics attack.

| Class | Keys (registry names) | Questions |
|---|---|---|
| **A — stable outturns** | `inflation_cpi` | 12 |
| **B — moderately revised** | `population`, `life_expectancy`, `unemployment_rate`, `trade_gdp`, `reserves_total_usd` | 8 each = 40 |
| **C — heavily revised** | `gdp_growth`, `gdp_current_usd`, `govt_debt_gdp`, `fiscal_balance_gdp`, `current_account_gdp`, `fdi_inflows_gdp` | 8 each = 48 |

`population` and `life_expectancy` are deliberately classed **B, not A**: UN WPP biennial revisions have moved back-series by 1–6% for many countries (including COVID-era life-expectancy re-estimation). Classing them as "near-immutable" was asserted in early drafts and failed adversarial review; the wider Class-B band is the conservative correction, and it cuts **against** StatCite's commercial interest (wider bands make models look better).

**Excluded indicator classes, with reasons (pre-registered):**
- `gdp_per_capita_ppp`, `gni_per_capita_atlas` — ICP benchmark rounds and Atlas smoothing revise levels by double digits; grading recall against them measures methodology churn, not memory.
- `cpi_index` — base-year convention (2010=100) tests convention knowledge, not statistical knowledge.
- `gini`, `poverty_headcount_intl` — survey-year sparsity makes "for year Y" ill-posed; their non-survey-year cells are reused as **null probes** (§3.4), which is the legitimate use.
- `lending_rate`, `deposit_rate`, `real_interest_rate` — cross-country definitional heterogeneity; a correct national-definition answer would be a false miss.
- `official_fx_rate` — period-average vs end-of-period ambiguity, and hard pegs are memorized constants that inflate accuracy.
- All monthly/US-only FRED series — different frequency protocol; out of scope v1.
- Remaining registry keys not listed above are simply out of the v1 frame (kept for future waves).

### 1.3 Economy tiers: mechanical rule, 25 questions each

All economies in the frame are ranked by nominal GDP (current US$, latest frozen-snapshot year). **T1** = ranks 1–20 · **T2** = 21–60 · **T3** = 61–120 · **T4** = 121+. Tier lists are emitted by the generator and committed with the bank. Maximum **2 questions per economy** (→ ≥ 50 distinct economies). No human selects a country.

Additional hard constraints: `gdp_current_usd` is drawn from T1/T2 only (GDP rebasings in developing economies — Nigeria 2014 +89%, Ghana +60% — make level recall ungradable); `fdi_inflows_gdp` from T1–T3 only (single transactions swing small-state FDI by tens of pp of GDP). A **contested-data exclusion list** (committed in `bench/frame/exclusions.json`, each entry justified) removes economy×indicator×year cells where the official value itself is contested (e.g. Venezuela Class-C cells, WEO-only entities absent from WDI): where the official value is contested, grading measures politics, not recall.

The equal 25/25/25/25 allocation is defended by openness, not "representativeness" — no weighting is neutral. Every report includes a **reweighting sensitivity** (headline recomputed under GDP-weighted, population-weighted, and equal weights).

### 1.4 Reference years: 2018–2022, projections ineligible

20 questions per year. Rationale (cutoff fairness): first-published outturns for all these years predate every plausible training cutoff of every model in scope, and the bulk of revisions has landed. Class-C cross-model comparisons remain **partially cutoff-confounded** (later-trained models saw values closer to today's truth); the claim templates flag this.

**Recency supplement:** 12 additional questions on 2023–2025, asked identically, **never scored in the headline**, reported separately: they measure whether models know what they cannot know (confabulation vs. appropriate refusal), with `projection_echo` detection — a model echoing a pre-cutoff WEO forecast is repeating something it legitimately saw, not fabricating; the two are never conflated.

---

## 2. Question protocol

### 2.1 Canonical templates

One canonical, human-reviewed phrasing per indicator (committed in `bench/templates/questions_v1.json`); paraphrase sensitivity is a later-wave appendix, not a headline contaminator. Every template names **source, definition, period basis, and required answer unit** — a model is never marked wrong for answering a legitimate sibling definition it was not asked about. Binding examples:

- `inflation_cpi`: "What was consumer price inflation in {COUNTRY} in {YEAR}, measured as the annual average change in the consumer price index, in percent (World Bank WDI definition)? Note: annual average, not December-over-December. Answer in percent."
- `govt_debt_gdp`: "What was {COUNTRY}'s general government gross debt in {YEAR}, as a percentage of GDP (IMF World Economic Outlook definition)? Answer in percent of GDP."
- `population`: "What was the total population of {COUNTRY} in {YEAR} (World Bank definition, mid-year estimate)? Answer in millions of people."

Level-kind questions request a human-natural magnitude via a frozen rule (`unit_scale` per question: billions USD for GDP where GDP ≥ $10bn, millions below; millions of people for population ≥ 1m, thousands below).

### 2.2 Elicitation (system prompt committed verbatim in `bench/templates/system_prompt_v1.txt`)

Models must output ONLY a JSON array, one object per question:
`{"qid": <copied from the question>, "value": number|null, "unit": string, "year_basis": integer, "confidence": 0.0–1.0, "refused": boolean, "basis_note": optional ≤140 chars}`

- **`qid` echo is mandatory** — it is the batch-alignment key; a dropped element cannot silently misalign the remaining answers.
- The prompt states that fabricating is worse than refusing and **that some questions may have no published official value** (required disclosure for null probes; models are warned traps exist, never which).
- Structured output is a disclosed deviation from natural chat: scores measure recall under this protocol; the protocol is identical for all models, so cross-model comparisons are internally valid.

### 2.3 Batching (pilot: accepted with controls)

10 questions per call. Controls: batch **membership identical across models** (context effects are common-mode); **within-batch order randomized per model** with a recorded seed; within a batch no repeated country, no repeated indicator, ≤ 2 null probes. Batch-position accuracy is reported descriptively. Batching-effect checks are **descriptive only** — no protocol change triggers off a single wave's noise; the first multi-vendor wave moves to single-question calls if budget allows (pre-committed intent).

### 2.4 Retries and repair

Transport errors: retried, not recorded. Schema-invalid output: exactly **one** repair reprompt ("Your previous output was not valid JSON. Output only the JSON array."), response flagged `repaired`, both raw outputs kept. Still invalid → those questions become `format_failure`: **excluded from all accuracy denominators** (plausibly harness-induced), reported as an own rate. Valid JSON with an unparseable unit or a non-numeric value with `refused:false` is `answer_failure` and **counts against the model** — the question stated the required unit.

### 2.5 Settings

Uniform protocol arm: minimum available temperature and reasoning/thinking settings, recorded exactly per model in `bench/models.json` and the manifest. The known objection — "they disabled the anti-hallucination feature" — is met from the first multi-vendor wave by an **as-deployed arm** (vendor-default settings), with a binding rule that the uniform-protocol number is never quoted without the as-deployed number adjacent once it exists.

---

## 3. Ground truth

### 3.1 Frozen before any model call

`bench/tools/snapshot_ground_truth.mjs` writes every question's full StatCite payload (value, unit, native series ID, source, citation, WEO edition, `is_projection`, retrieval timestamp) to `bench/snapshots/<run>/ground_truth.json`, committed and SHA-256-hashed in the manifest **before the first model call**. Scoring never touches the live API for values; results remain byte-auditable forever.

### 3.2 StatCite is the pipe, never the source

Every scored row carries the **primary attribution tuple**: institution (World Bank / IMF / ECB), native series ID (e.g. `NY.GDP.MKTP.KD.ZG`), ISO3, year, value, unit, vintage, and a direct primary-source API URL that reproduces the value without StatCite. `bench/tools/audit_ground_truth.mjs` re-fetches **every** ground-truth value directly from the primary APIs — StatCite is not in the code path — and diffs against the snapshot; its output is committed with each run. A divergence is a logged deviation and a corrected, re-hashed snapshot *before* scoring.

### 3.3 Revision doctrine (the hard problem, layered)

1. **Avoidance:** mature years only (§1.4); projections ineligible; vintage-pathological indicators excluded (§1.2).
2. **Absorption:** class-specific tolerance bands (§4) sized to revision behavior.
3. **Honest framing:** the headline measures **agreement with today's official value** — what a user experiences today. It is never described as "the model was wrong at training time."
4. **Vintage instrument:** for WEO-sourced cells, the snapshot job also fetches the same cell from the WEO vintage ~18 months older (dated DBnomics editions). Every headline `mismatch` is re-judged against that older vintage; hits are relabeled **`revision_affected`** — still not within-tolerance in the headline (the figure is outdated *today*), but broken out in every table, and the report is **barred from describing them as model errors**. Vintage agreement is diagnostic, never scored credit: scoring against model-specific cutoffs would make ground truth model-specific and unauditable.
5. **Rebasing errata valve:** ≥3 level-kind misses clustered on one economy across models triggers a documented upstream check; voiding a question requires published upstream evidence (e.g. a rebasing notice), recorded in `bench/errata/`; scores are always published **with and without** errata.
6. A scoring-time live cross-check logs any freeze-to-scoring upstream drift to `revision_events.json` — itself publishable evidence on revision magnitude.

### 3.4 Null probes (diagnostic only)

10 cells validated to have **no** published official value (survey indicators in non-survey years; `/v1/verify` returns `cannot_verify`). `fabrication_rate` = share answered with a number. Reported as a diagnostic with its n; **never part of any gate or headline** (n=10 supports no strong claim); ≥25 probes from the first full wave.

---

## 4. Tolerance bands

Bands start from StatCite's published verify bands but are **class-widened for revision behavior, adopted with justification rather than silently inherited**:

| Class | match | within-tolerance ("close") |
|---|---|---|
| A (percent-kind) | ≤ 0.06pp or ≤ 0.5% rel | ≤ 0.3pp or ≤ 2% rel (StatCite defaults) |
| B percent-kind | ≤ 0.06pp or ≤ 0.5% rel | ≤ max(0.5pp, 3% rel) |
| B level-kind | ≤ 0.5% rel | ≤ 5% rel (product default retained — already covers documented WPP back-revisions of 1–3%; the benchmark never tightens below the product's public bands) |
| C percent-kind | ≤ 0.06pp or ≤ 0.5% rel | ≤ max(1.0pp, 5% rel) (WEO first-print→current drift routinely ≥ 0.3pp) |
| C level-kind | ≤ 0.5% rel | ≤ 5% rel |

Constants are **pre-registered provisional values**, floored at source publication precision; the first full wave re-derives them from the empirical revision distribution in the WEO vintage archive via a committed script, as a major-version change. Two disclosure devices ship with every report so no result can be a knife-edge artifact of band choice: a **tolerance sweep** (headline vs. band multiplier 0.5×–4×) and the **full signed-error CDF** per model. If you dislike the bands, the raw errors are published; bring your own.

Scoring is deterministic code — a standalone scorer (`bench/tools/score.mjs`) with these constants as in-repo literals, plus a CI equivalence test against StatCite's `judge()` at the pinned server SHA. **No LLM and no human is anywhere in the scoring loop.** Unit normalization uses only the model's declared `unit` string, never the value's magnitude (magnitude inference would be grading help). Residual human involvement is confined to diagnostic subtype labels, logged, with the model column hidden.

---

## 5. Metrics

Per model, over the 100-question headline set (`scoreable` = 100 − format_failures):

- **WTR — Within-Tolerance Rate** = (match + close) / scoreable ← primary headline; refusals count against
- **Strict rate** = match / scoreable
- **CR — Confabulation Rate** = mismatch / attempted (attempted = answered with a number; refusals exempt — a model that abstains is safer than one that confabulates)
- **Answer Rate** = attempted / scoreable · **Answered Accuracy** = (match + close) / attempted
- `revision_affected` count · `fabrication_rate` (null probes) · `format_failure_rate` · calibration (confidence vs. outcome, descriptive at this n)

**Quotation rule (binding, in `COVENANT.md`):** WTR, CR, and Answer Rate are one unit. None may be quoted in any StatCite asset without the other two in the same asset. No tail anecdote ("model X was 40% off on Y") without the headline WTR in the same asset.

**Statistics discipline:** Wilson 95% intervals on all rates (at n=100 the half-width is ±7–10pp and reports say so); model-vs-model comparisons via exact McNemar on discordant pairs with Holm correction, minimum detectable difference stated (~12–15pp at n=100 — hence **no league tables at pilot scale**); strata cells with n<50 are descriptive only, no significance language; question-level bootstrap for any pooled quantity. Permitted claim template: "model X answered Y% of questions within the published tolerance of the current official value [CI]" — never "model X is wrong Y% of the time."

---

## 6. Reproducibility and integrity

- **Run order (load-bearing):** commit methodology + covenant + tools → enumerate frame (commit) → generate bank (commit) → snapshot + audit ground truth (commit, hash) → **then and only then** call models → commit raw responses → score → report. Report tables are regenerated from `summary.json` by CI; prose cannot edit numbers.
- **Seeds:** pilot seed = SHA-256 of the pre-registration commit hash (committed formula; fishing would require rewriting public history against the third-party timestamp). From Wave 1: NIST Randomness Beacon 2.0 pulse at a pre-announced timestamp (drand fallback), namespaced derived seeds, in-repo splitmix64 PRNG, lexicographic pre-sort before every shuffle — bit-identical regeneration on any machine.
- **Manifest:** SHA-256 of every artifact; scorer refuses on hash mismatch; exact dated model IDs, settings, request IDs, timestamps, token usage; StatCite server SHA (= scorer-equivalence pin); upstream vintage metadata. Release tags immutable; third-party timestamp via archive.org capture of the tagged tree.
- **Contamination:** each wave = frozen core panel (selected at pilot) + fresh majority draw; core-vs-fresh gap (matched on strata and year-offset) is a published contamination metric. Note the incentive arithmetic: contamination inflates scores, i.e. works *against* StatCite's commercial interest. Models added >30 days after a bank is published are scored but flagged and excluded from that wave's headline table.
- **Vendors:** from the first multi-vendor wave, the roster rule is mechanical — every generally-available model in each covered vendor's current public lineup at a stated snapshot date. Each vendor gets a 5-business-day courtesy preview (notification, not approval; factual errata only; changes logged). Tone rule: neutral statement of results, no dunking; failure examples always shown with the model's stated confidence and error class.

---

## 7. Pilot annex (run P0, this week)

**What P0 is:** a methodology shakedown that produces Claude-family numbers as a by-product. It validates the machine — generation, freezing, prompts, batching, parsing, scoring, reporting. **What P0 may never be:** cited as a finding about Claude, about AI, or used in StatCite marketing.

- Models: `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`, `claude-fable-5`, invoked as Claude Code subagents.
- **Deviations from the full protocol, disclosed:** (1) memory-only enforcement is instruction-based (the harness cannot strip tools); mitigations: agents are invoked without a structured-output tool so compliant runs make zero tool calls, per-agent tool-call counts are published as a compliance check, and full prompt texts and raw outputs are published verbatim. The platform's own system prompt is vendor-controlled and not publishable — a disclosed limitation, replaced by hard tool-less API calls in full waves. (2) Temperature is not controllable in this harness; reasoning effort is set to the minimum and recorded. (3) Seed is commit-hash-derived (beacon seeding starts Wave 1).
- **Quarantine (non-negotiable):** results live only in `bench/runs/P0/`; the report opens with: *"PILOT — METHODOLOGY VALIDATION RUN. Claude-family models only, executed on Claude infrastructure by a Claude-assisted developer. Deterministically scored, fully reproducible — and still not for citation as a cross-model or industry finding."* statcite.com may link the methodology; it may not surface pilot numbers. The first citable result requires **≥ 2 non-Anthropic vendors**.
- **Disclosure (verbatim in the P0 report):** "This benchmark's harness, scoring code, and drafts were developed with the assistance of Claude (Anthropic). The pilot tests Claude-family models exclusively because multi-vendor API access was not yet provisioned. No model — Claude or otherwise — plays any role in scoring: verdicts are deterministic numeric comparisons against pinned official values, and the scoring code, prompts, raw responses, and ground truth are published in full."

---

## 8. Pre-committed interpretation grid (the falsification branch)

Evaluated **per model**, on point estimates with CIs reported alongside (never CI-gated — a gate that arithmetic cannot trigger is theater), valid only when Answer Rate ≥ 70%:

- **Branch A — premise weakened (WTR ≥ 85% and CR ≤ 8%):** the report **must lead** with the pre-drafted finding: *"Frontier-model recall of headline economic statistics is more reliable than commonly assumed: N% of answered questions fell within tolerance of current official values. The risk does not disappear — it concentrates: in revision-prone indicators, small economies, the recency cliff, and the structural fact that an uncited figure, however likely to be right, cannot be checked."* StatCite's positioning then pivots to provenance, citation, and recency — without spin, because the recency supplement will have measured the cliff directly.
- **Branch B — mixed (WTR 65–85%):** the per-stratum table is the story; no blanket "AI is wrong" claim is permitted.
- **Branch C — unreliable (WTR < 65%):** the scoped claim is licensed — with the tolerance sweep and CDFs displayed exactly as prominently as in Branch A. Symmetry is the proof this is a test, not an ad.

Partial-falsification branches are evaluated per stratum where n supports them (e.g. "≥ 90% on T1 stable indicators" is reportable even when small-state fiscal recall fails).

---

## 9. Authorship, licensing, change control

- **Authorship:** currently "StatCite maintainers." The panel's recommendation — named authorship with a blunt COI statement ("The author operates StatCite, a service whose commercial value depends partly on the failure modes this benchmark measures"), credential in the COI section rather than the headline — is recorded here as a recommendation. **Owner's decision, pending.**
- **Licensing:** code under the repo license (MIT); bench data and reports intended CC BY 4.0, pending owner confirmation.
- **Change control:** semver. Anything touching bank composition, bands, prompts, or metrics is a major bump and breaks cross-wave comparability, annotated in the report. If StatCite's product bands change in `verify.ts`, the benchmark keeps scoring under the pinned constants until a major bump adopts new ones explicitly.
