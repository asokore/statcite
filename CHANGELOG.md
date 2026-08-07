# Changelog

Semantic versioning on the server (`server/src/mcp.ts` `SERVER_VERSION`).
Releases are tagged `v<version>` from this file's entries. History before
1.5.0 is reconstructed from HANDOFF.md and the git log; dates are deploy
dates.

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
