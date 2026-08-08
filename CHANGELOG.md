# Changelog

Semantic versioning on the server (`server/src/mcp.ts` `SERVER_VERSION`).
Releases are tagged `v<version>` from this file's entries. History before
1.5.0 is reconstructed from HANDOFF.md and the git log; dates are deploy
dates.

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
