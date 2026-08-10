# Changelog

Semantic versioning on the server (`server/src/mcp.ts` `SERVER_VERSION`).
Releases are tagged `v<version>` from this file's entries. History before
1.5.0 is reconstructed from HANDOFF.md and the git log; dates are deploy
dates.

## 1.9.1 — 2026-08-10

Correction release from a nine-dimension health audit of the live service.

- **The retired IMF licence wording survived on the prose surfaces.** v1.8.2
  corrected "commercial reuse may require IMF permission" in code, ledger and
  the Apify README — but the same claim stayed live on the site homepage
  (sources table + FAQ), the docs page's licensing section, and the repo
  README. All rewritten to the actual IMF Data terms. A regression test now
  sweeps every public prose surface (site HTML/txt/json, README, Apify README,
  distribution copy) for the retired wording, so prose can no longer silently
  contradict the served licence ledger.
- **Homepage said "Eleven tools" for a 12-tool server** and omitted
  compare_sources from the tools grid entirely; the static sources table
  listed 5 of 11 ledger sources and omitted BIS, the ECB Data Portal and the
  new IMF dated-vintage source. Fixed, with a pointer to the live ledger and a
  test asserting the homepage tool count against the TOOLS array.
- **as_of provenance is now truthful end-to-end**: the source-changed note
  hardcoded "(via DBnomics)" even when the IMF's own vintage dataflow served
  (observed live, contradicting the citation in the same response); it now
  names the source that actually served. Tool/OpenAPI/docs descriptions of
  as_of no longer describe the vintage path as DBnomics-only.
- **DBnomics ledger note corrected**: the curated registry routes only IMF
  through DBnomics, but the raw get_series dbnomics/PROVIDER/... escape hatch
  passes any hosted provider through on flow-through terms — the note claimed
  otherwise; it now describes the real behaviour and tells consumers of
  non-IMF raw series to check the named provider's terms.
- **docs page unstuck from v1.4.2**: changelog entries added for 1.5.0–1.9.0;
  llms-full.txt registry corrected (48 keys, six missing indicators added,
  current IMF attribution format, IMF-first vintage chain).
- Apify actor metadata: description count corrected (36 → 42 active
  indicators), actor versioning aligned.

## 1.9.0 — 2026-08-10

- **New source: the IMF's own dated WEO vintages** (`api.imf.org`, SDMX 3.0),
  inserted AHEAD of DBnomics in the dated-vintage chain used by `as_of`
  verification and the revision probe. No key and no account — the data is
  served anonymously; the sign-in wall on portal.api.imf.org guards the
  developer console, not the data.
- **Fixes a live degradation.** The revision probe re-checks a mismatched claim
  against the previous WEO edition. In production it was returning
  `status: "unavailable"` for WEO 2025-10 purely because DBnomics had not
  ingested that edition, while the IMF published it directly. It now returns
  `status: "checked"` with the IMF's own vintage value.
- This is an ADDITION, not a replacement: the IMF exposes only recent vintages,
  DBnomics carries the archive back to 2010-04 and remains the fallback. Only
  editions enumerated in `IMF_VINTAGE_FLOWS` from the live dataflow listing are
  attempted — never a guessed flow id.
- **Two silent-failure guards in the SDMX adapter**, both for behaviours
  verified live on the real endpoint:
  - IMF dimension values carry `value`, not `id`. Reading `id` yields undefined
    for every period, the period filter drops them all, and a 200 carrying 51
    real observations becomes a silently EMPTY series. Periods now read
    `value ?? id`.
  - A well-formed key in the WRONG dimension order returns HTTP 200 with no
    `series` key at all — no 404, no error. That is now raised as a
    malformed-key error and can never surface as `no_published_data`, which
    would have turned one transposed dimension into a confident false claim
    that the IMF publishes nothing for a country.
  Both guards are covered by mutation-verified regression tests.
- Licence ledger entry `imf_sdmx_vintage` added and verified 2026-08-10, per the
  house rule that a source serves only after its ledger entry exists.

## 1.8.2 — 2026-08-10

- **IMF licence text corrected against the verbatim terms.** The citation
  licence said commercial reuse "may require IMF permission". That is the rule
  for IMF *Content* (publications) and was wrongly applied to statistical
  *Data*, which the IMF governs under separate, far more permissive special
  terms opening "Notwithstanding the general prohibition on the commercial use
  of IMF Content...". The old wording both understated the permission and
  overstated the restriction. It now states the actual conditions: attribution,
  data integrity, the duty to communicate the terms downstream, and the
  sold-as-standalone disclosure.
- **IMF attribution now matches the format the terms specify** — "Source:
  International Monetary Fund, <database>, <link to the dataset>" — instead of
  a bare "Source: International Monetary Fund" that omitted both.
- Ledger entry re-verified 2026-08-10 and pointed at the current canonical
  terms URL (imf.org/en/About/copyright-and-terms; the old /external/terms.htm
  now redirects).
- **Apify actor**: added the disclosure the IMF terms require where data is
  sold as part of a product — that the underlying data is free from its
  publishers and from StatCite's own free API — and corrected a stale
  indicator count.

## 1.8.1 — 2026-08-08

- **Fixes wrong data served by 1.8.0.** `policy_rate` substituted a country's
  ISO2 code into the BIS series key, assuming the two coincide. They do not:
  BIS uses `XM` for the **euro area**, while StatCite's country table uses
  `XM` as the ISO2 of "Low income countries". The result was the ECB's policy
  rate returned under the label "Low income countries", while the genuinely
  useful euro-area query failed with a 404. Provider area codes now come from
  an **explicit allowlist enumerated from the dataflow itself** (49 economies),
  so an uncovered economy gets an honest no-published-data response instead of
  a coincidental hit on a different entity. Regression tests pin both
  directions.
- Coverage corrected in the docs: 49 economies, not "~38".
- `/v1/status` now probes BIS and the ECB Data Portal too — 1.8.0 added two
  serving upstreams without adding them to the health surface. The BIS probe
  uses GET with the vendor Accept header, never HEAD (BIS returns 500 to HEAD
  on URLs that serve 200 to GET).

## 1.8.0 — 2026-08-08

- **Two new official sources, both licence-ledgered before shipping**:
  **BIS** central bank policy rates (`policy_rate` — ~38 central banks in one
  flow, monthly) and the **ECB Data Portal** (`euro_area_hicp` — monthly
  euro-area harmonised inflation). Policy rates fill the gap FRED's permanent
  disablement left, with no key and a clean licence.
- **Upstream freshness is asserted, not assumed.** SDMX responses carry a
  disclosure note when the newest observation is older than the expectation for
  its frequency. This exists because the ECB's legacy `ICP` dataflow was found
  serving December-2025 inflation, with HTTP 200 and valid JSON, in August 2026
  — the registry uses the current `HICP` flow, and any future silent stall now
  announces itself instead of passing as current data.
- The adapter normalises the two SDMX-JSON generations these providers speak
  (BIS wraps in `data` and sends values as strings; the ECB does neither), and
  rejects a 200-with-XML body rather than parsing it — the ECB returns XML with
  a 200 when the format parameter is wrong.
- Registry now 48 keys / 42 active.

## 1.7.0 — 2026-08-08

- **Revision probe on verify mismatches**: for the six indicators with dated
  IMF WEO editions, a `mismatch` verdict now re-judges the claim against the
  PREVIOUS WEO edition. `revision_check.matches_previous_vintage: true` means
  the figure was likely right when written and has since been revised — a
  revision event, not necessarily an author error, the same courtesy this
  project's benchmark methodology extends to models. Degrades honestly to
  `status: "unavailable"`; never guesses. One extra fetch, mismatch path only;
  suppressed under `as_of` and `strict_source`.
- `revision_check.next_edition_expected` carries the calendar-expected next
  WEO release ("October 2026") — "expected" phrasing only.
- Internals: `previousWeoEdition`/`nextExpectedWeoEditionLabel` in the WEO
  calendar; `getIndicatorAtEdition` extracted so `as_of` and the probe share
  one dated-fetch path.

## 1.6.0 — 2026-08-08

- **`compare_sources` tool + `/v1/compare`**: one indicator, one country,
  fetched from EVERY source in its chain independently — per-source values,
  per-source citations, and the spread between them. Differences are framed as
  methodological or vintage differences between official sources, never as an
  error by a source. No other economic-data API surfaces this.
- **Licence ledger**: every source in `list_sources`//v1/sources now carries a
  licence verdict (served / flow-through / refused), the basis note, and the
  date it was verified — including REFUSED sources (FRED, UN Comtrade, ECCB,
  Central Bank of Barbados) with the reason each was declined.
- **Citation export formats**: every citation object now includes
  `export_formats.bibtex` and `export_formats.apa`, derived from the citation's
  own fields.
- **Honest absence, machine-readable**: an empty result now distinguishes
  `no_published_data: true` (the source publishes nothing for that
  series/country) from a wrong window (`available_range` says where the data
  actually is), and the details survive the fallback chain.
- **Typo-tolerant countries**: unique single-typo inputs resolve
  ("Jamiaca" → JAM); ambiguous ones still refuse to guess.
- **Registry +4**: external debt stocks, external debt service, debt
  service-to-exports (World Bank International Debt Statistics, same CC BY 4.0
  terms as WDI), and international tourism receipts (% of exports) — 46 keys,
  40 active.
- **SIDS resource**: `statcite://registry/sids` — the UN OHRLLS list of 39
  Small Island Developing States, a data-availability grouping for the
  small-economy coverage this service prioritizes.

## 1.5.0 — 2026-08-07

- **MCP prompts**: `fact_check`, `country_brief`, `cite_this_stat` — reusable
  workflow templates. `fact_check` turns any MCP client into a document
  fact-checker: the client model extracts the claims, `verify_claims`
  adjudicates them (no free-text parsing enters the server).
- **MCP resources**: `statcite://registry/indicators` and
  `statcite://registry/sources` — the indicator registry and the
  source/licence/attribution table, generated from the same constants the
  tools use so they cannot drift.
- **Structured output on the verify tools**: `verify_stat` and
  `verify_claims` now declare `outputSchema` and return
  `structuredContent` (previously only `search`/`fetch` did).
- **`/v1/status`**: merged status+health endpoint — server version plus live
  upstream probes (World Bank, IMF DataMapper, DBnomics), edge-cached 120s so
  pollers cannot relay load upstream.
- Tool descriptions now state the honesty contract explicitly: verdicts the
  official source cannot support come back `cannot_verify` with the reason —
  never a guess.
- Repo hygiene: CHANGELOG.md (this file), SECURITY.md, scheduled CI smoke
  run against production.

## 1.4.2 — 2026-07-27

- Fourth external-review response (website-focused). Machine-readable
  disabled-key disclosure (registry `active`/`disabled_reason`), doc drift
  fixes, ARIA tabs + skip link, JSON-LD, live verifier form on the homepage,
  per-connector test prompts. 173 tests.

## 1.4.1 — 2026-07-27

- `as_of` honesty pass: historical verification requalified as IMF-vintage
  verification with conservative month-calendar resolution disclosed;
  impossible dates rejected; `source_changed_for_as_of` disclosure;
  `modeled_estimate` observation status for ILO-modeled indicators.

## 1.4.0 — 2026-07-26

- `as_of` parameter on `verify_stat`/`verify_claims`: verify a claim against
  the dated IMF WEO edition in effect at a given date (editions verified back
  to 2010-04 via dated DBnomics series).

## 1.3.2 — 2026-07-26

- FRED permanently disabled after terms-of-use review (AI/ML-use and
  redistribution clauses); explicit disabled responses for `fred/*` ids.

## 1.3.1 — 2026-07-26

- Second external-review response: transient-fallback verifies demote to
  `cannot_verify`; `observation_status`/`status_method` fields;
  fallback_reason in OpenAPI; IMF licence caveat everywhere. 161 tests.

## 1.3.0 — 2026-07-25

- IMF DataMapper API becomes the primary source for the six IMF-backed
  indicators (current WEO/Fiscal Monitor edition, verbatim edition label);
  DBnomics demoted to fallback/vintage instrument. Payload-anchored
  projection boundary; `imf/{CODE}` explicit series ids; PSE/XKX aliases.

## 1.2.0 — 2026-07-25

- `strict_source` reproducibility mode; `fallback_used` disclosure served
  no-store; WEO stale-vintage disclosure; narrowed IMF licensing language;
  privacy page enumerates the closed analytics dimensions.

## 1.1.0 and earlier — 2026-07-24/25

- Initial public release: 11 MCP tools, REST API, registry of 43 indicators
  (World Bank WDI primary + IMF/DBnomics), citation objects with licence and
  required-attribution strings, aggregate-only usage analytics.
