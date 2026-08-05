# R1 Addenda — post-publication sensitivity analyses and disclosures

Added 2026-08-01 after an internal audit. Nothing here changes a published headline number; each item either discloses a sensitivity the pre-registered report lacked, or corrects the record where the report implied something that did not happen. Deviations arising from the same audit are D-003 through D-007 in `bench/DEVIATIONS.md`.

## 1. Parse-policy sensitivity (the boundary the tolerance sweep does not cover)

METHODOLOGY §2.4 pre-registers a strict parse: a response file must BE a JSON array — no fence stripping, no salvage. §4's tolerance sweep shows no result is a knife-edge artifact of band choice, but parse policy has no equivalent sweep, and that is where the actual knife-edge sits. Re-running the run's own `parse_responses.mjs` + `score.mjs` with markdown code fences stripped from the raw responses (all other policy unchanged):

| model | published WTR / CR / AR | fence-stripped WTR / CR / AR | §8 branch |
|---|---|---|---|
| claude-haiku-4-5 | 33.3 / 32.5 / 49.4 | 35.0 / 36.4 / 55.0 | invalid → invalid (AR < 70% both ways) |
| claude-sonnet-5 | 64.8 / 31.4 / 94.5 | 68.0 / 28.4 / 95.0 | **C ("unreliable") → B ("mixed")** |
| claude-opus-5 | 82.0 / 15.5 / 97.0 | unchanged | B → B |
| claude-fable-5 | 81.0 / 15.6 / 96.0 | unchanged | B → B |
| gpt-5.5 | 75.0 / 22.7 / 97.0 | unchanged | B → B |
| gemini-3-flash-preview | 79.0 / 20.2 / 99.0 | unchanged | B → B |

Exactly 9 raw files contain fences: 6 claude-haiku-4-5, 3 claude-sonnet-5, none for any other model. Two readings follow. First, claude-haiku-4-5's exclusion is robust to parse policy — its answer rate stays under 70% either way. Second, claude-sonnet-5's published branch-C ("headline unreliable") classification sits 0.2pp from the branch boundary under the pre-registered parse and flips to branch B under fence-stripping; its strict-parse figure is the pre-registered one and stands, but any use of the branch label for this model should carry this sensitivity. Fence emission is a formatting behaviour, not a recall behaviour, and it affected only one vendor's arm — the arm invoked through a harness whose platform system prompt is not publishable (§7).

## 2. Revision instrument repair (D-003)

As published, the "Revision-affected misses" table was all zeros because the vintage instrument matched zero headline cells (see D-003). After repair against the frozen ground truth and the 2024-10 vintage: 16 headline cells were vintage-eligible; of the 19 headline mismatches on WEO-capable indicators, exactly one relabels — claude-opus-5 on P0-050, whose answer matches the 2024-10 vintage value (34.54). Per COVENANT §5 that miss is never described as a model error. The other 18 stand as genuine misses. Current REPORT.md tables reflect the repaired instrument, and the table now shows the instrument's own coverage so a dead instrument can no longer render as a clean result.

## 3. Adjacent-year non-discrimination in the question bank

Applying the run's own scoring bands to each headline cell's stored adjacent-year values: for 60 of 100 headline questions, a model that returned the ADJACENT year's official value would still score within tolerance (match or close) for the asked year. Concentrated in slow-moving series: population (8), life expectancy (8), unemployment rate (8), government debt (7), FDI (6), reserves (5). This inflates every model's WTR relative to a bank of purely year-discriminating questions and weakens the "trust ceiling for uncited figures" framing accordingly — in both directions of interest, it is a bank-design limitation, not a scoring error, and it cuts against StatCite's own commercial framing, which is why it is published. R2's draw should include a year-discrimination filter or report the two figures separately.

## 4. Roster and settings asymmetry

The run states "6 models across 3 vendors"; the composition is 4 Anthropic models, 1 OpenAI model, and 1 Google PREVIEW model (`gemini-3-flash-preview`, the only Gemini model the run's key could call — selected by key access, not by the §6 lineup rule; see D-007 item 9). Settings were also not uniform: the OpenAI arm ran `reasoning_effort: "none"`; the Google arm ran nominal defaults not independently verified as minimal; the Anthropic arm ran through Claude Code subagents with an unpublishable platform system prompt and uncontrollable temperature (§7). The "uniform minimum-reasoning protocol" is therefore uniform in instruction, verified for neither the Google arm's settings nor the Anthropic arm's platform layer.

## 5. Tool-call compliance counts (promised, not evidenced)

§7 and `models.json` promise per-agent tool-call counts as the memory-only compliance check for the Claude arm. No such artifact exists in the run outputs. "No tools, no retrieval" for the four Claude models is an instruction-based assumption, not an evidenced fact, and should be read as such until R2 publishes the counts.

## 6. Ground-truth audit independence (D-006)

The R1 audit's "0 divergences" was computed against the bench's own ≤1-day-old HTTP cache for 99 of 117 rows, not against fresh primary-API bytes. The audit tool now forces refresh; the July artifact is retained unmodified with this disclosure.

## 7. Ground truth is source-dependent for the 18 relocated fiscal cells

Between P0 and R1 the served source for 18 WEO/Fiscal Monitor cells moved from dated-DBnomics (`dbnomics/IMF/WEO:2025-04/...`) to the IMF DataMapper (`imf/...`, April 2026 edition), and every one of those cells' frozen ground-truth values changed. Sixteen changed only by the DataMapper's one-decimal rounding (e.g. EGY government debt 89.903 to 89.9). Two moved materially: Jordan government debt 2023 (96.961 to 81, a change of roughly 16 percentage points) and Central African Republic fiscal balance 2025 (-1.619 to -5.5). Both material movers are recency-segment cells, so no headline rate is affected — but they are live evidence that "the official value" for a fiscal indicator depends on which IMF channel and edition serves it, the same class of source-dependence D-001 logged on the World Bank side. Treat cross-run comparisons of individual fiscal cells accordingly.
