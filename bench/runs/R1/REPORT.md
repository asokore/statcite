# R1 — AI Economic-Statistics Accuracy Benchmark

**MULTI-VENDOR RUN — satisfies COVENANT §6 (>=2 non-Anthropic vendors: OpenAI, Google).** Deterministically scored, fully reproducible. Per COVENANT §1, all outcomes are published regardless of direction; per §3 the quotation unit (WTR, CR, Answer Rate) travels together in any citation.

> This benchmark measures one thing: how reliably AI assistants state official economic statistics from memory — no tools, no retrieval, no web. It is not a measure of what AI can do with a data connection. It is a measure of what happens in the many real conversations where no data connection is used, and in the moments when a model answers from memory because it believes it knows.
>
> Read the scores as a trust ceiling for uncited figures: a model's accuracy here tells you how far to trust a number it states in a chat window without a citation — nothing more, and nothing less.

Agentic deployments with retrieval will outperform these scores. That is expected and is not what this benchmark measures.

**Disclosure:** This benchmark's harness, scoring code, and drafts were developed with the assistance of Claude (Anthropic). This run's roster spans 3 vendors (Anthropic plus OpenAI and Google), satisfying COVENANT §6's two-non-Anthropic-vendor threshold for a citable cross-model result. No model — any vendor's — plays any role in scoring: verdicts are deterministic numeric comparisons against pinned official values, and the scoring code, prompts, raw responses, and ground truth are published in full.

Run `R1` · scored 2026-07-28T15:02:34.949Z · seed `9a173ab9f6e75866e0ca1f080f24ef0d1e2c91a1a9dbd699be6b796450840c3e` · bank: 100 headline / 12 recency / 10 null probes.

**Protocol deviations logged for this run: 2** (see bench/DEVIATIONS.md).

## Headline (Within-Tolerance Rate, refusals count against)

Per the quotation covenant, WTR, CR, and Answer Rate are one unit and travel together.

| model | WTR [95% CI] | strict | CR [95% CI] | Answer Rate | Answered Accuracy | refusals | answer_failures | format_failures | scoreable |
|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-4-5 | 33.3% [24.0–44.1] (27/81) | 6.2% | 32.5% [20.1–48.0] | 49.4% | 67.5% | 41 | 0 | 19 | 81 |
| claude-sonnet-5 | 64.8% [54.6–73.9] (59/91) | 30.8% | 31.4% [22.6–41.8] | 94.5% | 68.6% | 5 | 0 | 9 | 91 |
| claude-opus-5 | 82.0% [73.3–88.3] (82/100) | 39.0% | 15.5% [9.6–24.0] | 97.0% | 84.5% | 3 | 0 | 0 | 100 |
| claude-fable-5 | 81.0% [72.2–87.5] (81/100) | 38.0% | 15.6% [9.7–24.2] | 96.0% | 84.4% | 4 | 0 | 0 | 100 |
| gpt-5.5 | 75.0% [65.7–82.5] (75/100) | 36.0% | 22.7% [15.5–32.0] | 97.0% | 77.3% | 3 | 0 | 0 | 100 |
| gemini-3-flash-preview | 79.0% [70.0–85.8] (79/100) | 41.0% | 20.2% [13.5–29.1] | 99.0% | 79.8% | 1 | 0 | 0 | 100 |

*Wilson 95% intervals; at n≈100 the half-width is ±7–10pp. Minimum detectable model-vs-model difference ~12–15pp — no league tables at pilot scale (§5).*

## Revision-affected misses

| model | revision_affected |
|---|---|
| claude-haiku-4-5 | 0 |
| claude-sonnet-5 | 0 |
| claude-opus-5 | 0 |
| claude-fable-5 | 0 |
| gpt-5.5 | 0 |
| gemini-3-flash-preview | 0 |

*Re-judged against the older dated WEO vintage (§3.3.4): still not within-tolerance in the headline (the figure is outdated today), and per the covenant never described as model errors.*

## Breakdowns

### Revision class

| Revision class | claude-haiku-4-5 WTR | claude-sonnet-5 WTR | claude-opus-5 WTR | claude-fable-5 WTR | gpt-5.5 WTR | gemini-3-flash-preview WTR |
|---|---|---|---|---|---|---|
| A | 22.2% (2/9) | 90.9% (10/11) | 100.0% (12/12) | 100.0% (12/12) | 91.7% (11/12) | 100.0% (12/12) |
| B | 40.6% (13/32) | 54.0% (20/37) | 75.0% (30/40) | 75.0% (30/40) | 65.0% (26/40) | 72.5% (29/40) |
| C | 30.0% (12/40) | 67.4% (29/43) | 83.3% (40/48) | 81.3% (39/48) | 79.2% (38/48) | 79.2% (38/48) |

*Strata cells with n<50 are descriptive only — no significance language (§5).*

### Economy tier

| Economy tier | claude-haiku-4-5 WTR | claude-sonnet-5 WTR | claude-opus-5 WTR | claude-fable-5 WTR | gpt-5.5 WTR | gemini-3-flash-preview WTR |
|---|---|---|---|---|---|---|
| T1 | 52.6% (10/19) | 77.3% (17/22) | 92.0% (23/25) | 92.0% (23/25) | 88.0% (22/25) | 92.0% (23/25) |
| T2 | 27.3% (6/22) | 85.7% (18/21) | 96.0% (24/25) | 96.0% (24/25) | 88.0% (22/25) | 92.0% (23/25) |
| T3 | 36.4% (8/22) | 52.2% (12/23) | 76.0% (19/25) | 80.0% (20/25) | 72.0% (18/25) | 76.0% (19/25) |
| T4 | 16.7% (3/18) | 48.0% (12/25) | 64.0% (16/25) | 56.0% (14/25) | 52.0% (13/25) | 56.0% (14/25) |

*Strata cells with n<50 are descriptive only — no significance language (§5).*

### Reference year

| Reference year | claude-haiku-4-5 WTR | claude-sonnet-5 WTR | claude-opus-5 WTR | claude-fable-5 WTR | gpt-5.5 WTR | gemini-3-flash-preview WTR |
|---|---|---|---|---|---|---|
| 2018 | 41.2% (7/17) | 81.3% (13/16) | 90.0% (18/20) | 85.0% (17/20) | 85.0% (17/20) | 85.0% (17/20) |
| 2019 | 42.9% (6/14) | 73.7% (14/19) | 85.0% (17/20) | 85.0% (17/20) | 85.0% (17/20) | 80.0% (16/20) |
| 2020 | 47.1% (8/17) | 63.2% (12/19) | 85.0% (17/20) | 85.0% (17/20) | 80.0% (16/20) | 80.0% (16/20) |
| 2021 | 21.4% (3/14) | 61.1% (11/18) | 80.0% (16/20) | 75.0% (15/20) | 65.0% (13/20) | 80.0% (16/20) |
| 2022 | 15.8% (3/19) | 47.4% (9/19) | 70.0% (14/20) | 75.0% (15/20) | 60.0% (12/20) | 70.0% (14/20) |

*Strata cells with n<50 are descriptive only — no significance language (§5).*

### Batch position

| Batch position | claude-haiku-4-5 WTR | claude-sonnet-5 WTR | claude-opus-5 WTR | claude-fable-5 WTR | gpt-5.5 WTR | gemini-3-flash-preview WTR |
|---|---|---|---|---|---|---|
| 1 | 50.0% (4/8) | 60.0% (6/10) | 100.0% (11/11) | 90.0% (9/10) | 70.0% (7/10) | 72.7% (8/11) |
| 2 | 0.0% (0/7) | 60.0% (6/10) | 77.8% (7/9) | 77.8% (7/9) | 83.3% (10/12) | 77.8% (7/9) |
| 3 | 22.2% (2/9) | 66.7% (6/9) | 77.8% (7/9) | 77.8% (7/9) | 72.7% (8/11) | 90.9% (10/11) |
| 4 | 50.0% (4/8) | 70.0% (7/10) | 90.0% (9/10) | 80.0% (8/10) | 81.8% (9/11) | 70.0% (7/10) |
| 5 | 37.5% (3/8) | 90.0% (9/10) | 75.0% (9/12) | 60.0% (6/10) | 81.8% (9/11) | 80.0% (8/10) |
| 6 | 50.0% (3/6) | 62.5% (5/8) | 72.7% (8/11) | 90.9% (10/11) | 77.8% (7/9) | 60.0% (6/10) |
| 7 | 22.2% (2/9) | 66.7% (6/9) | 100.0% (9/9) | 81.8% (9/11) | 83.3% (5/6) | 90.9% (10/11) |
| 8 | 30.0% (3/10) | 71.4% (5/7) | 80.0% (8/10) | 90.0% (9/10) | 45.5% (5/11) | 90.9% (10/11) |
| 9 | 25.0% (2/8) | 66.7% (6/9) | 50.0% (4/8) | 66.7% (6/9) | 77.8% (7/9) | 83.3% (5/6) |
| 10 | 50.0% (4/8) | 33.3% (3/9) | 90.9% (10/11) | 90.9% (10/11) | 80.0% (8/10) | 72.7% (8/11) |

*Strata cells with n<50 are descriptive only — no significance language (§5).*

## Tolerance sweep (WTR at band multiplier ×0.5 / ×1 / ×2 / ×4)

| model | ×0.5 | ×1 | ×2 | ×4 |
|---|---|---|---|---|
| claude-haiku-4-5 | 21.0% | 33.3% | 39.5% | 43.2% |
| claude-sonnet-5 | 53.8% | 64.8% | 74.7% | 81.3% |
| claude-opus-5 | 71.0% | 82.0% | 84.0% | 92.0% |
| claude-fable-5 | 71.0% | 81.0% | 84.0% | 91.0% |
| gpt-5.5 | 63.0% | 75.0% | 80.0% | 87.0% |
| gemini-3-flash-preview | 67.0% | 79.0% | 84.0% | 89.0% |

*No result here is a knife-edge artifact of band choice; the full signed-error distribution ships in scores/<model>.json (§4).*

## Signed relative error distribution (deciles)

| model | n | p5 | p10 | p25 | p50 | p75 | p90 | p95 |
|---|---|---|---|---|---|---|---|---|
| claude-haiku-4-5 | 40 | -54.1% | -26.5% | -3.8% | -0.2% | 4.5% | 34.1% | 166.1% |
| claude-sonnet-5 | 86 | -41.9% | -20.8% | -6.0% | -0.2% | 0.8% | 32.2% | 60.3% |
| claude-opus-5 | 97 | -18.6% | -11.3% | -2.6% | -0.1% | 0.7% | 10.3% | 24.2% |
| claude-fable-5 | 96 | -15.9% | -12.4% | -2.8% | -0.0% | 0.7% | 10.3% | 25.9% |
| gpt-5.5 | 97 | -27.8% | -13.5% | -1.6% | 0.0% | 2.0% | 20.5% | 52.6% |
| gemini-3-flash-preview | 99 | -28.1% | -10.1% | -1.8% | -0.0% | 1.1% | 16.8% | 37.5% |

## Recency supplement (2023–2025 — never scored in the headline)

| model | n | refused | answered | within-tol of current | mismatch vs current | uncorroborated | projection_echo |
|---|---|---|---|---|---|---|---|
| claude-haiku-4-5 | 11 | 7 | 4 | 2 | 2 | 0 | 0 |
| claude-sonnet-5 | 12 | 4 | 8 | 5 | 3 | 0 | 3 |
| claude-opus-5 | 12 | 2 | 10 | 6 | 4 | 0 | 4 |
| claude-fable-5 | 12 | 2 | 10 | 6 | 4 | 0 | 4 |
| gpt-5.5 | 12 | 6 | 6 | 4 | 2 | 0 | 2 |
| gemini-3-flash-preview | 12 | 9 | 3 | 1 | 2 | 0 | 3 |

*A model echoing a pre-cutoff WEO forecast is repeating something it legitimately saw, not fabricating; the two are never conflated (§1.4).*

## Null probes (diagnostic only, n=10)

| model | probes | fabricated | fabrication_rate [95% CI] |
|---|---|---|---|
| claude-haiku-4-5 | 8 | 0 | 0.0% [0.0–32.4] |
| claude-sonnet-5 | 9 | 8 | 88.9% [56.5–98.0] |
| claude-opus-5 | 10 | 1 | 10.0% [1.8–40.4] |
| claude-fable-5 | 10 | 2 | 20.0% [5.7–51.0] |
| gpt-5.5 | 10 | 4 | 40.0% [16.8–68.7] |
| gemini-3-flash-preview | 10 | 2 | 20.0% [5.7–51.0] |

*Never part of any gate or headline; n=10 supports no strong claim (§3.4).*

## Calibration (descriptive)

| model | mean conf (within) | mean conf (mismatch) | mean conf (refused) |
|---|---|---|---|
| claude-haiku-4-5 | 0.56 | 0.45 | 0.02 |
| claude-sonnet-5 | 0.42 | 0.32 | 0.00 |
| claude-opus-5 | 0.46 | 0.20 | 0.00 |
| claude-fable-5 | 0.47 | 0.22 | 0.00 |
| gpt-5.5 | 0.56 | 0.35 | 0.00 |
| gemini-3-flash-preview | 0.83 | 0.73 | 0.95 |

## Model-vs-model (exact McNemar, Holm-corrected — report-only)

| pair | discordant (a-only / b-only) | p | p (Holm) |
|---|---|---|---|
| claude-haiku-4-5 vs claude-sonnet-5 | 1 / 25 | 0.000001 | 0.000011 |
| claude-haiku-4-5 vs claude-opus-5 | 0 / 38 | 0 | 0 |
| claude-haiku-4-5 vs claude-fable-5 | 0 / 40 | 0 | 0 |
| claude-haiku-4-5 vs gpt-5.5 | 0 / 33 | 0 | 0 |
| claude-haiku-4-5 vs gemini-3-flash-preview | 0 / 38 | 0 | 0 |
| claude-sonnet-5 vs claude-opus-5 | 2 / 17 | 0.000729 | 0.00729 |
| claude-sonnet-5 vs claude-fable-5 | 2 / 16 | 0.001312 | 0.011808 |
| claude-sonnet-5 vs gpt-5.5 | 4 / 12 | 0.076813 | 0.460878 |
| claude-sonnet-5 vs gemini-3-flash-preview | 2 / 14 | 0.004181 | 0.033448 |
| claude-opus-5 vs claude-fable-5 | 3 / 2 | 1 | 1 |
| claude-opus-5 vs gpt-5.5 | 8 / 1 | 0.039063 | 0.273441 |
| claude-opus-5 vs gemini-3-flash-preview | 5 / 2 | 0.453125 | 1 |
| claude-fable-5 vs gpt-5.5 | 8 / 2 | 0.109375 | 0.546875 |
| claude-fable-5 vs gemini-3-flash-preview | 3 / 1 | 0.625 | 1 |
| gpt-5.5 vs gemini-3-flash-preview | 3 / 7 | 0.34375 | 1 |

*No league tables at pilot scale; minimum detectable difference ~12–15pp at n=100 (§5).*

## Permitted claims (filled templates, §5)

- claude-haiku-4-5 answered 33.3% of questions within the published tolerance of the current official value (95% CI [24.0–44.1]; 27/81 scoreable), with a Confabulation Rate of 32.5% and an Answer Rate of 49.4%.
- claude-sonnet-5 answered 64.8% of questions within the published tolerance of the current official value (95% CI [54.6–73.9]; 59/91 scoreable), with a Confabulation Rate of 31.4% and an Answer Rate of 94.5%.
- claude-opus-5 answered 82.0% of questions within the published tolerance of the current official value (95% CI [73.3–88.3]; 82/100 scoreable), with a Confabulation Rate of 15.5% and an Answer Rate of 97.0%.
- claude-fable-5 answered 81.0% of questions within the published tolerance of the current official value (95% CI [72.2–87.5]; 81/100 scoreable), with a Confabulation Rate of 15.6% and an Answer Rate of 96.0%.
- gpt-5.5 answered 75.0% of questions within the published tolerance of the current official value (95% CI [65.7–82.5]; 75/100 scoreable), with a Confabulation Rate of 22.7% and an Answer Rate of 97.0%.
- gemini-3-flash-preview answered 79.0% of questions within the published tolerance of the current official value (95% CI [70.0–85.8]; 79/100 scoreable), with a Confabulation Rate of 20.2% and an Answer Rate of 99.0%.

*Never: "model X is wrong Y% of the time."*

## Pre-committed interpretation grid (§8)

| model | branch | grid valid? | basis |
|---|---|---|---|
| claude-haiku-4-5 | C — unreliable | NO | Answer Rate 49.4% < 70% — grid evaluation not valid for this model (§8) |
| claude-sonnet-5 | C — unreliable | yes | WTR 64.8%, CR 31.4%, Answer Rate 94.5% (>= 70%: grid valid) |
| claude-opus-5 | B — mixed | yes | WTR 82.0%, CR 15.5%, Answer Rate 97.0% (>= 70%: grid valid) |
| claude-fable-5 | B — mixed | yes | WTR 81.0%, CR 15.6%, Answer Rate 96.0% (>= 70%: grid valid) |
| gpt-5.5 | B — mixed | yes | WTR 75.0%, CR 22.7%, Answer Rate 97.0% (>= 70%: grid valid) |
| gemini-3-flash-preview | B — mixed | yes | WTR 79.0%, CR 20.2%, Answer Rate 99.0% (>= 70%: grid valid) |

*Evaluated per model on point estimates with CIs alongside, never CI-gated; valid only when Answer Rate ≥ 70% (§8).*

---

**MULTI-VENDOR RUN — satisfies COVENANT §6 (>=2 non-Anthropic vendors: OpenAI, Google).** Deterministically scored, fully reproducible. Per COVENANT §1, all outcomes are published regardless of direction; per §3 the quotation unit (WTR, CR, Answer Rate) travels together in any citation.
