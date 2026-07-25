# P0 — AI Economic-Statistics Accuracy Benchmark (pilot run)

**PILOT — METHODOLOGY VALIDATION RUN.** Claude-family models only, executed on Claude infrastructure by a Claude-assisted developer. Deterministically scored, fully reproducible — and still not for citation as a cross-model or industry finding.

> This benchmark measures one thing: how reliably AI assistants state official economic statistics from memory — no tools, no retrieval, no web. It is not a measure of what AI can do with a data connection. It is a measure of what happens in the many real conversations where no data connection is used, and in the moments when a model answers from memory because it believes it knows.
>
> Read the scores as a trust ceiling for uncited figures: a model's accuracy here tells you how far to trust a number it states in a chat window without a citation — nothing more, and nothing less.

Agentic deployments with retrieval will outperform these scores. That is expected and is not what this benchmark measures.

**Disclosure (verbatim per METHODOLOGY §7):** This benchmark's harness, scoring code, and drafts were developed with the assistance of Claude (Anthropic). The pilot tests Claude-family models exclusively because multi-vendor API access was not yet provisioned. No model — Claude or otherwise — plays any role in scoring: verdicts are deterministic numeric comparisons against pinned official values, and the scoring code, prompts, raw responses, and ground truth are published in full.

Run `P0` · scored 2026-07-25T20:20:38.869Z · seed `9a173ab9f6e75866e0ca1f080f24ef0d1e2c91a1a9dbd699be6b796450840c3e` · bank: 100 headline / 12 recency / 10 null probes.

**Protocol deviations logged for this run: 1** (see bench/DEVIATIONS.md).

## Headline (Within-Tolerance Rate, refusals count against)

Per the quotation covenant, WTR, CR, and Answer Rate are one unit and travel together.

| model | WTR [95% CI] | strict | CR [95% CI] | Answer Rate | Answered Accuracy | refusals | answer_failures | format_failures | scoreable |
|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-4-5 | 34.2% [24.5–45.4] (26/76) | 7.9% | 33.3% [20.6–49.0] | 51.3% | 66.7% | 37 | 0 | 24 | 76 |
| claude-sonnet-5 | 64.0% [54.2–72.7] (64/100) | 24.0% | 32.6% [24.0–42.6] | 95.0% | 67.4% | 5 | 0 | 0 | 100 |
| claude-opus-5 | 75.0% [65.7–82.5] (75/100) | 34.0% | 19.4% [12.6–28.5] | 93.0% | 80.7% | 7 | 0 | 0 | 100 |
| claude-fable-5 | 79.0% [70.0–85.8] (79/100) | 36.0% | 18.6% [12.1–27.4] | 97.0% | 81.4% | 3 | 0 | 0 | 100 |

*Wilson 95% intervals; at n≈100 the half-width is ±7–10pp. Minimum detectable model-vs-model difference ~12–15pp — no league tables at pilot scale (§5).*

## Revision-affected misses

| model | revision_affected |
|---|---|
| claude-haiku-4-5 | 0 |
| claude-sonnet-5 | 0 |
| claude-opus-5 | 0 |
| claude-fable-5 | 0 |

*Re-judged against the older dated WEO vintage (§3.3.4): still not within-tolerance in the headline (the figure is outdated today), and per the covenant never described as model errors.*

## Breakdowns

### Revision class

| Revision class | claude-haiku-4-5 WTR | claude-sonnet-5 WTR | claude-opus-5 WTR | claude-fable-5 WTR |
|---|---|---|---|---|
| A | 37.5% (3/8) | 83.3% (10/12) | 91.7% (11/12) | 100.0% (12/12) |
| B | 43.3% (13/30) | 52.5% (21/40) | 65.0% (26/40) | 70.0% (28/40) |
| C | 26.3% (10/38) | 68.8% (33/48) | 79.2% (38/48) | 81.3% (39/48) |

*Strata cells with n<50 are descriptive only — no significance language (§5).*

### Economy tier

| Economy tier | claude-haiku-4-5 WTR | claude-sonnet-5 WTR | claude-opus-5 WTR | claude-fable-5 WTR |
|---|---|---|---|---|
| T1 | 64.7% (11/17) | 84.0% (21/25) | 88.0% (22/25) | 92.0% (23/25) |
| T2 | 27.3% (6/22) | 72.0% (18/25) | 80.0% (20/25) | 92.0% (23/25) |
| T3 | 30.0% (6/20) | 60.0% (15/25) | 76.0% (19/25) | 76.0% (19/25) |
| T4 | 17.6% (3/17) | 40.0% (10/25) | 56.0% (14/25) | 56.0% (14/25) |

*Strata cells with n<50 are descriptive only — no significance language (§5).*

### Reference year

| Reference year | claude-haiku-4-5 WTR | claude-sonnet-5 WTR | claude-opus-5 WTR | claude-fable-5 WTR |
|---|---|---|---|---|
| 2018 | 47.1% (8/17) | 65.0% (13/20) | 80.0% (16/20) | 85.0% (17/20) |
| 2019 | 35.7% (5/14) | 80.0% (16/20) | 95.0% (19/20) | 90.0% (18/20) |
| 2020 | 58.3% (7/12) | 75.0% (15/20) | 75.0% (15/20) | 80.0% (16/20) |
| 2021 | 33.3% (5/15) | 50.0% (10/20) | 70.0% (14/20) | 75.0% (15/20) |
| 2022 | 5.6% (1/18) | 50.0% (10/20) | 55.0% (11/20) | 65.0% (13/20) |

*Strata cells with n<50 are descriptive only — no significance language (§5).*

### Batch position

| Batch position | claude-haiku-4-5 WTR | claude-sonnet-5 WTR | claude-opus-5 WTR | claude-fable-5 WTR |
|---|---|---|---|---|
| 1 | 25.0% (2/8) | 72.7% (8/11) | 72.7% (8/11) | 80.0% (8/10) |
| 2 | 0.0% (0/6) | 63.6% (7/11) | 88.9% (8/9) | 77.8% (7/9) |
| 3 | 25.0% (2/8) | 44.4% (4/9) | 66.7% (6/9) | 66.7% (6/9) |
| 4 | 42.9% (3/7) | 63.6% (7/11) | 80.0% (8/10) | 80.0% (8/10) |
| 5 | 50.0% (4/8) | 72.7% (8/11) | 83.3% (10/12) | 60.0% (6/10) |
| 6 | 33.3% (2/6) | 66.7% (6/9) | 54.5% (6/11) | 90.9% (10/11) |
| 7 | 33.3% (3/9) | 70.0% (7/10) | 88.9% (8/9) | 72.7% (8/11) |
| 8 | 44.4% (4/9) | 75.0% (6/8) | 80.0% (8/10) | 90.0% (9/10) |
| 9 | 37.5% (3/8) | 60.0% (6/10) | 50.0% (4/8) | 77.8% (7/9) |
| 10 | 42.9% (3/7) | 50.0% (5/10) | 81.8% (9/11) | 90.9% (10/11) |

*Strata cells with n<50 are descriptive only — no significance language (§5).*

## Tolerance sweep (WTR at band multiplier ×0.5 / ×1 / ×2 / ×4)

| model | ×0.5 | ×1 | ×2 | ×4 |
|---|---|---|---|---|
| claude-haiku-4-5 | 22.4% | 34.2% | 40.8% | 43.4% |
| claude-sonnet-5 | 53.0% | 64.0% | 72.0% | 79.0% |
| claude-opus-5 | 66.0% | 75.0% | 83.0% | 84.0% |
| claude-fable-5 | 69.0% | 79.0% | 84.0% | 89.0% |

*No result here is a knife-edge artifact of band choice; the full signed-error distribution ships in scores/<model>.json (§4).*

## Signed relative error distribution (deciles)

| model | n | p5 | p10 | p25 | p50 | p75 | p90 | p95 |
|---|---|---|---|---|---|---|---|---|
| claude-haiku-4-5 | 39 | -40.9% | -35.7% | -9.9% | -1.9% | 2.5% | 30.8% | 148.2% |
| claude-sonnet-5 | 95 | -65.0% | -26.1% | -7.1% | -0.6% | 3.2% | 24.8% | 61.4% |
| claude-opus-5 | 93 | -52.7% | -13.0% | -2.8% | -0.2% | 0.7% | 7.2% | 13.3% |
| claude-fable-5 | 97 | -13.4% | -9.0% | -2.8% | -0.2% | 0.7% | 16.8% | 36.1% |

## Recency supplement (2023–2025 — never scored in the headline)

| model | n | refused | answered | within-tol of current | mismatch vs current | uncorroborated | projection_echo |
|---|---|---|---|---|---|---|---|
| claude-haiku-4-5 | 8 | 5 | 3 | 2 | 1 | 0 | 0 |
| claude-sonnet-5 | 12 | 3 | 9 | 4 | 5 | 0 | 2 |
| claude-opus-5 | 12 | 5 | 7 | 5 | 2 | 0 | 3 |
| claude-fable-5 | 12 | 4 | 8 | 6 | 2 | 0 | 3 |

*A model echoing a pre-cutoff WEO forecast is repeating something it legitimately saw, not fabricating; the two are never conflated (§1.4).*

## Null probes (diagnostic only, n=10)

| model | probes | fabricated | fabrication_rate [95% CI] |
|---|---|---|---|
| claude-haiku-4-5 | 6 | 0 | 0.0% [0.0–39.0] |
| claude-sonnet-5 | 10 | 10 | 100.0% [72.3–100.0] |
| claude-opus-5 | 10 | 5 | 50.0% [23.7–76.3] |
| claude-fable-5 | 10 | 4 | 40.0% [16.8–68.7] |

*Never part of any gate or headline; n=10 supports no strong claim (§3.4).*

## Calibration (descriptive)

| model | mean conf (within) | mean conf (mismatch) | mean conf (refused) |
|---|---|---|---|
| claude-haiku-4-5 | 0.57 | 0.38 | 0.01 |
| claude-sonnet-5 | 0.41 | 0.32 | 0.00 |
| claude-opus-5 | 0.46 | 0.31 | 0.01 |
| claude-fable-5 | 0.49 | 0.26 | 0.00 |

## Model-vs-model (exact McNemar, Holm-corrected — report-only)

| pair | discordant (a-only / b-only) | p | p (Holm) |
|---|---|---|---|
| claude-haiku-4-5 vs claude-sonnet-5 | 1 / 25 | 0.000001 | 0.000004 |
| claude-haiku-4-5 vs claude-opus-5 | 0 / 30 | 0 | 0 |
| claude-haiku-4-5 vs claude-fable-5 | 0 / 35 | 0 | 0 |
| claude-sonnet-5 vs claude-opus-5 | 2 / 13 | 0.007385 | 0.01477 |
| claude-sonnet-5 vs claude-fable-5 | 1 / 16 | 0.000275 | 0.000825 |
| claude-opus-5 vs claude-fable-5 | 2 / 6 | 0.289063 | 0.289063 |

*No league tables at pilot scale; minimum detectable difference ~12–15pp at n=100 (§5).*

## Permitted claims (filled templates, §5)

- claude-haiku-4-5 answered 34.2% of questions within the published tolerance of the current official value (95% CI [24.5–45.4]; 26/76 scoreable), with a Confabulation Rate of 33.3% and an Answer Rate of 51.3%.
- claude-sonnet-5 answered 64.0% of questions within the published tolerance of the current official value (95% CI [54.2–72.7]; 64/100 scoreable), with a Confabulation Rate of 32.6% and an Answer Rate of 95.0%.
- claude-opus-5 answered 75.0% of questions within the published tolerance of the current official value (95% CI [65.7–82.5]; 75/100 scoreable), with a Confabulation Rate of 19.4% and an Answer Rate of 93.0%.
- claude-fable-5 answered 79.0% of questions within the published tolerance of the current official value (95% CI [70.0–85.8]; 79/100 scoreable), with a Confabulation Rate of 18.6% and an Answer Rate of 97.0%.

*Never: "model X is wrong Y% of the time."*

## Pre-committed interpretation grid (§8)

| model | branch | grid valid? | basis |
|---|---|---|---|
| claude-haiku-4-5 | C — unreliable | NO | Answer Rate 51.3% < 70% — grid evaluation not valid for this model (§8) |
| claude-sonnet-5 | C — unreliable | yes | WTR 64.0%, CR 32.6%, Answer Rate 95.0% (>= 70%: grid valid) |
| claude-opus-5 | B — mixed | yes | WTR 75.0%, CR 19.4%, Answer Rate 93.0% (>= 70%: grid valid) |
| claude-fable-5 | B — mixed | yes | WTR 79.0%, CR 18.6%, Answer Rate 97.0% (>= 70%: grid valid) |

*Evaluated per model on point estimates with CIs alongside, never CI-gated; valid only when Answer Rate ≥ 70% (§8). P0 branch outcomes validate the machine — they are not citable findings (§7).*

---

**PILOT — METHODOLOGY VALIDATION RUN.** Claude-family models only, executed on Claude infrastructure by a Claude-assisted developer. Deterministically scored, fully reproducible — and still not for citation as a cross-model or industry finding.
