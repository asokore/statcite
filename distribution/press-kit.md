# Press kit — the AI Economic-Statistics Accuracy Benchmark

Draft, for use when the Run 2 embargo lifts. Structure follows the EBU/BBC
playbook that earned NPR/CBC/Al Jazeera coverage: one headline number, a
per-model table, a pre-registered methodology anyone can check, and downloadable
per-question data so disputes are checkable rather than rhetorical.

**Nothing here may be sent before the vendor courtesy-preview window closes.**
Bracketed fields are filled from `bench/runs/R2/REPORT.md` after scoring.

---

## The one-line pitch

> An independent, pre-registered benchmark finds that leading AI models state
> official economic statistics incorrectly [X]% of the time when answering from
> memory — and state a wrong figure confidently, rather than declining, in
> [Y]% of cases.

## Why a journalist should care

1. **It is checkable.** Every question, every raw model answer, the frozen
   answer key, and the scoring code are public. A reporter can re-run the
   grading or spot-check any single verdict.
2. **It is pre-registered.** The methodology, scoring bands, and analysis plan
   were committed publicly before any model was called; the question draw is
   seeded from a NIST randomness beacon pulse announced in advance. Deviations
   are logged in a numbered public file.
3. **It measures a specific, consequential failure.** Not "AI is unreliable" in
   general, but: does a model state the correct official figure for a named
   country and year? These are the numbers that end up in reports, briefings,
   and articles.
4. **It is institutionally corroborated.** The IMF's own 2026 paper introducing
   StatGPT — backed by the IMF, World Bank, OECD, Eurostat, BIS and the UN
   statistical system — justifies retrieval because generative models "perform
   poorly at delivering official statistics".
5. **The measurement is honest about itself.** Accuracy is never quoted apart
   from the confabulation rate and the answer rate; a model that declines when
   unsure is scored differently from one that guesses confidently. Answers that
   match an earlier official vintage are never scored as errors — statistics get
   revised, and the benchmark says so.

## Headline results (fill after scoring)

| Model | Within-Tolerance Rate | Confabulation Rate | Answer Rate |
|---|---|---|---|
| [model] | [X]% | [Y]% | [Z]% |

Mandatory framing, per the project's own publication covenant: **these three
numbers are a single unit and are never quoted apart from one another.** At this
sample size, model-to-model differences below roughly 12–15 percentage points
are not distinguishable — this is not a league table.

## What is new in Run 2 versus Run 1

- A mechanically applied model roster (no cherry-picking which models appear)
- A fresh question draw seeded by a pre-announced NIST beacon pulse, with a
  carried panel for contamination control
- 25 null probes (questions with no published answer) to measure whether models
  invent figures that do not exist
- An as-deployed settings arm alongside the uniform-settings arm, answering the
  "you disabled the safety features" objection
- A retrieval arm measuring how much web search actually closes the gap

## Quotable framing (attribute to the maintainer)

> "The failure mode isn't that models don't know economic statistics. It's that
> they answer anyway. A model that says 'I'm not sure' is far more useful to a
> researcher than one that produces a plausible wrong number with a confident
> tone — which is why this benchmark refuses to publish an accuracy figure
> without the confabulation rate beside it."

> "Every number in this benchmark can be checked against the official source,
> because that's the whole point. We published the raw model outputs so anyone
> who disputes a verdict can go and look."

## Assets

- Benchmark explainer: https://statcite.com/bench.html
- Methodology, covenant, deviations log, question banks, scoring code:
  https://github.com/asokore/statcite/tree/main/bench
- Run 1 report and post-publication sensitivity analyses (already public)
- Per-question Run 2 data: [link after publication]
- The tool that fixes it: https://statcite.com (free, no signup)

## What NOT to say

- Do not describe this as ranking models overall — it measures one narrow,
  specific capability.
- Do not quote a within-tolerance rate alone.
- Do not describe a revision-affected answer as a model error.
- Do not characterise any government's statistics or policy. The benchmark
  scores models, never countries.

## Target outlets

Data-journalism desks and AI trade press. Prioritise reporters who have covered
AI accuracy studies (the EBU/BBC and Tow Center stories are the precedent) or
who write about official statistics. One tailored email each — a generic blast
is worse than nothing.
