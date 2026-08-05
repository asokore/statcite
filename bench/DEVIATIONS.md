# Protocol Deviations Log

Deviations never edit the pre-registered documents; they are recorded here with date, description, cause, and effect on results. Results tables footnote the count of deviations for their run.

---

## D-001 — 2026-07-25 — Run P0 — Ground truth anchored to `/v1/verify`, not to the frame snapshot

**What changed.** METHODOLOGY §1.1 requires every drawn question to "round-trip through `/v1/verify` as a `match` against its own ground-truth value". As pre-registered, a non-`match` result rejected the cell. The generator now instead **adopts `/v1/verify`'s `official_value` as the cell's ground truth** when it differs from the frame value, logging each case; a cell is rejected only when verify cannot serve a usable outturn for the exact period asked (`cannot_verify`, non-finite value, or `is_projection == true`).

**Why.** During the frame enumeration (2026-07-25, ~4h, 2,884 series), StatCite's upstream fetch to the World Bank intermittently aborted. On those cells `/v1/indicator` fell back to its secondary source (IMF WEO) and returned a *legitimate value for a different source's concept* — e.g. Georgia current account 2022: WEO −4.42 vs WDI −2.58. Once the World Bank upstream recovered, those frame values no longer matched the value `/v1/verify` serves, and 2–6% of every 100-cell draw failed the round-trip, exhausting the redraw budget.

Rejecting those cells would have been the wrong repair twice over: it would silently bias the frame against economies whose series were being served during an upstream wobble (the survivorship failure mode §1.1 exists to prevent), and it would leave ground truth anchored to a value the scorer never uses. `/v1/verify` is the path that scores every model answer, so its value **is** the operative ground truth; the frame value is an eligibility signal only.

**Effect on results.** 5 of 100 headline cells re-anchored, all in the two indicators where WEO and WDI genuinely differ in concept (`current_account_gdp` ×3, `gdp_growth` ×2). Each is listed verbatim in `questions/P0-genlog.json` with both values. The frozen snapshot (`snapshots/P0/ground_truth.json`) is taken *after* re-anchoring, so the scored ground truth is internally consistent and independently re-checked by `audit_ground_truth.mjs` against the primary APIs. No cell was dropped for this reason; the round-trip's original purpose (catching resolution, period-matching, and series-identity faults) is unchanged.

**Upstream product finding (logged, not benchmark-affecting).** The same `indicator`/`country`/`period` can return materially different values from `/v1/indicator` depending on upstream health at request time, because source fallback substitutes a different statistical concept. For a service whose premise is citation-grade consistency this is worth a fix — the citation does correctly name the source that served each value, so nothing is mis-attributed, but a caller who fetches twice can get two different numbers with two different citations. Tracked outside this log as a server issue.

---

## D-002 — 2026-07-28 — Run R1 — `report.mjs`'s quarantine banner hardcoded P0's single-vendor framing onto every future run

**What changed.** `tools/report.mjs` unconditionally stamped every `REPORT.md` — regardless of run — with P0's verbatim pilot banner ("Claude-family models only... multi-vendor API access was not yet provisioned") and the P0-specific interpretation-grid footnote ("P0 branch outcomes..."). This was discovered when generating R1's report: R1's actual roster (4 Claude models + `gpt-5.5` + `gemini-3-flash-preview`, 3 vendors) satisfies COVENANT §6's two-non-Anthropic-vendor threshold, but the report still rendered the single-vendor quarantine language and mislabeled the title `(pilot run)`. Fixed by deriving the banner, disclosure, and title from the run's actual roster (vendor inferred from model-id prefix, `nonAnthropicVendors()` in `report.mjs`) rather than a hardcoded string: single-vendor runs still get P0's exact original banner verbatim (unchanged); runs with ≥2 non-Anthropic vendors get a new banner naming COVENANT §6 and the actual vendor list.

**Why.** `report.mjs` was written once, for P0, before any multi-vendor run existed, and the banner text was never made conditional — a case this codebase hadn't needed until R1.

**Effect on results.** No effect on any scored number, verdict, band, or ground truth — `score.mjs`'s output (`summary.json`) is unchanged; only `report.mjs`'s prose banner/title/footnote changed. Re-ran `report.mjs --run P0` after the fix to confirm P0's `REPORT.md` is byte-identical (P0 is single-vendor, so it takes the unchanged original-banner branch) — confirmed via `git diff --stat` showing no change. This fix happened after the `prereg-R1` freeze (commit `322e64e`) and after all R1 model calls were made, so it is logged here per COVENANT §7 even though it touches presentation, not analysis.

---

## D-003 — 2026-08-01 — Run R1 — The revision/vintage instrument covered zero headline cells as published

**What changed.** `snapshot_ground_truth.mjs` selected vintage-check targets by matching served series ids against the dated-DBnomics scheme only (`dbnomics/IMF/WEO...`). StatCite v1.3.0 (2026-07-25) moved the WEO/Fiscal Monitor cells onto the DataMapper scheme (`imf/CODE`), so at R1's snapshot the filter matched nothing: `revision_check.json` held 4 rows, all recency-segment, zero headline. `score.mjs` then silently emitted `revision_affected: false` for every miss, and REPORT.md rendered a "Revision-affected misses" table of six zeros footnoted as "re-judged against the older dated WEO vintage" — a re-judgement that never ran. 19 headline mismatches on the two WEO-capable indicators were published without the vintage defence §3.3.4 promises. This was foreseeable: P0's NOTES.md carry-over (a) warned the bench tools only understood `worldbank/` and `dbnomics/` schemes.

**Repair (2026-08-01).** The filter now accepts both IMF channels; a `--revision-only` mode rebuilds `revision_check.json` against the FROZEN ground truth (never re-snapshotting it), with vintage-candidate selection pinned to the original snapshot date (2026-07-26, selecting the 2024-10 edition, matching P0's instrument). `score.mjs` now records a `vintage_status` on every miss (never a silent false), and the report renders the instrument's own coverage column so an all-zero table can no longer be read as a result when the instrument is dead. The pre-repair artifact is preserved as `snapshots/R1/revision_check.pre-D003.json`.

**Effect on results.** No headline rate changes (WTR/CR/Answer Rate are unaffected by §3.3.4, re-verified identical after re-scoring). Of the 19 eligible misses, exactly one relabels: claude-opus-5 on P0-050 matches the 2024-10 vintage value and is now marked `revision_affected` (per §5, never described as a model error). The other 18 stand as genuine misses.

---

## D-004 — 2026-08-01 — Run R1 — §8 vendor courtesy preview was not provided

**What happened.** COVENANT §8 and METHODOLOGY §6 commit to a 5-business-day courtesy preview (notification, not approval) to covered vendors from the first multi-vendor wave. R1 is that wave. The scored report was committed 2026-07-28 11:03 and published to statcite.com at 11:18 the same day. No preview was sent. The breach was found in a 2026-08-01 audit and is logged here; vendor notifications are being prepared. Nothing about the published numbers changes; the process commitment was broken and this log entry is the covenant's required record of that.

---

## D-005 — 2026-08-01 — Run R1 — Published without the §6 integrity manifest

**What happened.** METHODOLOGY §6 commits to a SHA-256 manifest of every artifact per run; P0 has one; R1 was published without one, while `models.json` asserted "R1 is a distinct run with its own manifest". Built 2026-08-01 with the existing `hash_manifest.mjs` after the D-003 repair (so the manifest hashes the corrected artifacts). The scorer still performs no automatic hash verification in any run; `hash_manifest.mjs --verify` remains a manual step.

---

## D-006 — 2026-08-01 — Run R1 — The "independent" ground-truth audit was served from the bench's own HTTP cache

**What happened.** §3.2 describes `audit_ground_truth.mjs` as re-fetching every ground-truth value directly from the primary APIs. The tool used `politeFetchJson` defaults (7-day disk cache): 99 of the 117 data-bearing rows in R1's `audit.json` were verified against bytes cached on 2026-07-25, the day BEFORE the audit ran. "0 divergences" therefore meant "0 divergences against yesterday's bytes" — a weaker claim than written. The tool now forces a refresh on every audit fetch. The July artifact is retained unmodified (re-running in August would conflate later upstream revisions with snapshot error); the weakness is disclosed here instead.

---

## D-007 — 2026-08-01 — Run R1 — Consolidated: pre-registered commitments not met in this run

Logged per §7; none were disclosed in DEVIATIONS.md at publication. In R1: (1) the §6 contamination protocol's fresh majority draw was not performed — `questions/R1.json` is byte-identical to P0's bank, and no core-vs-fresh contamination metric exists; (2) the §6 NIST-beacon seed was not used — R1 reuses P0's commit-hash seed; (3) the §2.5 as-deployed arm, pre-registered as required from the first multi-vendor wave with a binding pairing rule, was not run; (4) the §0 retrieval-delta arm was not run; (5) §3.4 commits to ≥25 null probes from the first full wave — R1 has 10; (6) the §4 reweighting sensitivity (GDP/population/equal weights) appears in no report; (7) §3.3.6's `revision_events.json` was never created; (8) the §4 CI equivalence test exists but is not wired into CI; (9) the §6 roster rule ("every generally-available model in each covered vendor's current public lineup") was not applied mechanically — R1 ran 4 Anthropic models, 1 OpenAI model, and 1 Google preview model selected by API-key availability. Each remains open until either implemented in R2 or formally amended in the methodology with its own deviation entry.
