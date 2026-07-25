# Protocol Deviations Log

Deviations never edit the pre-registered documents; they are recorded here with date, description, cause, and effect on results. Results tables footnote the count of deviations for their run.

---

## D-001 — 2026-07-25 — Run P0 — Ground truth anchored to `/v1/verify`, not to the frame snapshot

**What changed.** METHODOLOGY §1.1 requires every drawn question to "round-trip through `/v1/verify` as a `match` against its own ground-truth value". As pre-registered, a non-`match` result rejected the cell. The generator now instead **adopts `/v1/verify`'s `official_value` as the cell's ground truth** when it differs from the frame value, logging each case; a cell is rejected only when verify cannot serve a usable outturn for the exact period asked (`cannot_verify`, non-finite value, or `is_projection == true`).

**Why.** During the frame enumeration (2026-07-25, ~4h, 2,884 series), StatCite's upstream fetch to the World Bank intermittently aborted. On those cells `/v1/indicator` fell back to its secondary source (IMF WEO) and returned a *legitimate value for a different source's concept* — e.g. Georgia current account 2022: WEO −4.42 vs WDI −2.58. Once the World Bank upstream recovered, those frame values no longer matched the value `/v1/verify` serves, and 2–6% of every 100-cell draw failed the round-trip, exhausting the redraw budget.

Rejecting those cells would have been the wrong repair twice over: it would silently bias the frame against economies whose series were being served during an upstream wobble (the survivorship failure mode §1.1 exists to prevent), and it would leave ground truth anchored to a value the scorer never uses. `/v1/verify` is the path that scores every model answer, so its value **is** the operative ground truth; the frame value is an eligibility signal only.

**Effect on results.** 5 of 100 headline cells re-anchored, all in the two indicators where WEO and WDI genuinely differ in concept (`current_account_gdp` ×3, `gdp_growth` ×2). Each is listed verbatim in `questions/P0-genlog.json` with both values. The frozen snapshot (`snapshots/P0/ground_truth.json`) is taken *after* re-anchoring, so the scored ground truth is internally consistent and independently re-checked by `audit_ground_truth.mjs` against the primary APIs. No cell was dropped for this reason; the round-trip's original purpose (catching resolution, period-matching, and series-identity faults) is unchanged.

**Upstream product finding (logged, not benchmark-affecting).** The same `indicator`/`country`/`period` can return materially different values from `/v1/indicator` depending on upstream health at request time, because source fallback substitutes a different statistical concept. For a service whose premise is citation-grade consistency this is worth a fix — the citation does correctly name the source that served each value, so nothing is mis-attributed, but a caller who fetches twice can get two different numbers with two different citations. Tracked outside this log as a server issue.
