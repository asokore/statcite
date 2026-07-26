# P0 — post-run data-path notes (informational, not protocol deviations)

## N-1 · WEO vintage lag discovered after the run (2026-07-25)

The run's WEO-sourced ground truth reflects **IMF WEO vintage 2025-04** — the newest
edition available via DBnomics, this benchmark's (and StatCite's) IMF data path.
Verified the same day: DBnomics carries no `WEO:2025-10` or `WEO:2026-04` edition,
so the data path trails the IMF's own release calendar by two releases.

This is consistent with the pre-registered methodology (§3.3: ground truth is the
value the scoring path serves, frozen and independently audited — the audit
reproduced all 122 values from the primary APIs *as served through DBnomics*),
but it matters for interpretation: verdicts against Class-C WEO cells are
verdicts against the 2025-04 vintage, not against the IMF's April 2026 release.
The headline reference years (2018–2022, outturns only) minimise the practical
difference — outturns that old move little between vintages — but the limitation
is real and is why the server now emits a stale-vintage disclosure note on every
WEO-served response (v1.2.0).

For Full Run 1: either confirm DBnomics has ingested the then-current WEO
edition at freeze time, or ingest the IMF's WEO release directly (the IMF
DataMapper API is a proven no-auth alternative) before constructing ground truth.

**Update (2026-07-25, v1.3.0):** StatCite now ingests the IMF DataMapper API
directly (`docs/DESIGN-weo-datamapper.md`) — the six IMF-backed indicators serve
the IMF's current edition as primary, with DBnomics as a fallback. This
requirement is satisfied for future runs: Full Run 1 ground truth can freeze
against a current vintage rather than whatever DBnomics happened to have
ingested. Two carry-overs for whoever builds Full Run 1: (a) `audit_ground_truth.mjs`/
`snapshot_ground_truth.mjs` only understand `worldbank/` and `dbnomics/` series-id
schemes — they need an `imf/` fetcher before they can independently reproduce
DataMapper-served cells; (b) expect vintage churn versus P0's frozen values on
rebasing-prone countries (observed up to ±3.7pp between the 2025-04 and
April-2026 editions for some countries' fiscal series) — this is a genuine
data change, not a scoring bug.
