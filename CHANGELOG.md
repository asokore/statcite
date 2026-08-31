# Changelog

Semantic versioning on the server (`server/src/mcp.ts` `SERVER_VERSION`).
Releases are tagged `v<version>` from this file's entries. History before
1.5.0 is reconstructed from HANDOFF.md and the git log; dates are deploy
dates.

## 1.12.0

A 34-agent adversarial sweep of the live service found 30 confirmed defects.
Every one was re-verified against the running service before being acted on,
and two of the reported claims did not survive that check (a `displayName` key
said to fail plugin validation passes it, and the /sources evidence was a
methodology error). One defect the sweep missed was found while reading the
code it pointed at.

**Wrong answers, silently.** These are the ones that mattered.

- `GET /v1/verify` silently dropped unknown parameter NAMES, so a misspelled
  tolerance turned a mismatch into a match. Against the official Barbados 2024
  inflation figure of 1.4464366430616 and a claimed 1.4, `tolerance_abs=0.001`
  returns `mismatch`, while `tolerance=0.001`, `toleranceAbs=0.001` and
  `tolerence_abs=0.001` all returned `match` at HTTP 200 — falling back to the
  lenient rounding default rather than the stricter rule the caller asked for.
  That is the exact failure this service exists to prevent. Unknown parameter
  names are now refused with a closest-match suggestion, on every /v1 route.
- `strict_source` on `/v1/verify` used the raw `=== "true"` comparison that the
  `qBool` helper was written to replace, so `strict_source=1` did not fail, it
  SILENTLY DOWNGRADED: the caller asked for a primary-source-only guarantee and
  quietly got a fallback value with a 200. The three sibling routes had been
  migrated and this one was missed. Found by reading the helper's own docstring
  against its call sites, not by the sweep.
- An inverted year window ran the full fetch and then failed with a message
  whose own evidence refuted it: "no observations in the requested window
  2024-2015 ... published data exists for 1967-2025, adjust the year range",
  while returning an `available_range` that CONTAINS both requested years. An
  agent checking its years against that range got `true` and was sent to fix
  the wrong thing. On a multi-source indicator it burned the whole fallback
  chain first. Now refused by name before any upstream fetch, on REST and MCP.
- `search` capped registry matches at 8 with no total and no flag. "gdp"
  matched 20 and served 8, and ranks 2-20 were ALL tied on score, so the 12
  dropped were excluded by declaration order rather than relevance. An agent
  concluded there was no `tax_revenue_gdp` indicator. The response now carries
  `total_indicator_matches` and `truncated`, and the geography filter runs
  BEFORE the cap so a dropped euro-area series no longer wastes a slot.
- The MCP instruction served to every connecting agent asserted "Every response
  includes a citation object", which was false for 7 of 12 tools: `fx_convert`
  returns a `citations` ARRAY (correct — a bridged rate cites one leg per
  currency), three tools nest it per result, three carry none. An agent
  following the instruction literally raised KeyError on every FX conversion.
- `GET /v1/verify` 400'd on `claimed_value`, the name both `verify_claims` and
  the `verify_stat` MCP tool require, and the name it returns in its own
  response body. It could not round-trip its own output. Now an alias.

**The guard that could not fail.** The live audit's indicator-count check read
`i.get("disabled")`, a key `/v1/indicators` has never emitted, so its "active"
count collapsed to the total and the PASS line printed "48 total / 48 active"
when 42 are active. Its regex also required the digits to be followed
immediately by "indicators", so it never matched the site's actual wording,
"42 active curated indicators" — mutating that to 99 left the check green. It
validated exactly one substring site-wide while stating a falsehood. Fixed, and
the harness grew three sections (157 checks, up from 124) covering every defect
in this release, each one confirmed to fail before the fix landed.

**Machine readability.**

- `llms.txt` crashed the reference llms.txt parser. The spec allows free prose
  only before the first H2; `## Reuse terms` was six paragraphs of it, and the
  parser raises rather than degrading, so the whole file was unreadable —
  including the correctly formatted Docs and Quick use lists. Restructured as a
  file list with the licence wording relocated above the first heading, verbatim
  and complete. Verified parsing with the reference implementation.
- `llms.txt` and `llms-full.txt` served as bare `text/plain`, and both carry
  multi-byte UTF-8. Under the RFC 2616 text/* default a client renders the
  documented tolerance "match ≤0.06pp" as mojibake. Both now declare charset.
- `/sources` rendered its entire licence ledger client-side, so the page
  carrying StatCite's whole licensing argument was blank to GPTBot, ClaudeBot
  and PerplexityBot — the audience robots.txt explicitly invites and that
  llms-full.txt points there. The ledger is now server-rendered by
  `tools/gen-sources-prerender.py`, with the existing fetch still overwriting
  it, so the page keeps the "cannot drift from the API" property it claims.
- Structured data on all six pages, not just the homepage: APIReference on
  /docs, Dataset on /bench, DataCatalog on /sources sharing the homepage's
  `@id`, WebPage on /privacy and /terms, plus WebSite and FAQPage nodes. Every
  node carries name and description explicitly, because a missing `description`
  is what Search Console rejected as CRITICAL two days ago.
- `sitemap.xml` carried no `lastmod` on any of its nine URLs. Now generated by
  `tools/gen-sitemap.py` from git history — not file mtime, which would have
  published a false date on its first run.
- 8 of 14 OpenAPI operations declared a bare `type: object` 200 schema, so a
  generated client learned nothing and the `citations` array on /v1/fx stayed
  hidden. All 14 now carry real schemas.
- `Vary: Accept-Encoding` and HSTS on API responses. Four content-codings were
  served from one URL under `public, max-age=3600` with no Vary, so a cache
  between a client and Cloudflare could replay the wrong one.

**Accuracy and discoverability of what already exists.**

- Docs §6 said "42 registry keys, of which 36 are active" while §5 of the same
  page said "48 keys, 42 active". The live registry is 48/42. Six active keys
  were missing from the table entirely, four of them the external-debt and
  tourism series a small-state analyst would search for. Rows are now generated
  from the live registry, and the audit asserts every key appears.
- The Caribbean central bank data — the one thing here not available from the
  World Bank API directly — appeared in no human-readable copy. The sources
  table showed FRED, which is refused, and omitted the ECCB and the Central
  Bank of Barbados, both served. Both now have rows, the `caribstat/` id form is
  documented, and the meta description (the string Google renders as the
  snippet) names them.
- The Claude Code plugin and Gemini CLI extension, both published and versioned
  in lockstep with the service, were advertised nowhere. The plugin does more
  than the documented `claude mcp add`: it also installs the verify-then-cite
  skill, which is what makes a model reach for `verify_stat` before publishing
  a number. Both now have install instructions on the homepage and in /docs.
- Three MCP prompts and three resources were live and undocumented for humans.
  Prompts appear as slash commands the moment a client connects.
- `export_formats` (paste-ready BibTeX and APA on every citation) was declared
  in openapi.json and absent from the human citation spec, which claimed to
  enumerate the payload. It is the strongest thing this product offers a
  researcher and it was mentioned only in a changelog line.
- /docs gained per-tool anchors, so the twelve homepage tool cards now link
  somewhere and a colleague can be sent "the verify_claims docs".
- The `policy_rate / euro_area_hicp` heading sat at tool level inside the tools
  reference while `tools/list` returns neither, inviting a `tools/call` that
  would fail. Retitled.
- /v1/status and /v1/compare, both live and both advertised by the service's own
  /v1 index, were missing from the human endpoint list.
- og.png shipped a fully opaque alpha channel: 37,359 bytes where a
  pixel-identical RGB re-encode is 27,000. Verified 0 of 756,000 pixels differ
  and the sRGB/gAMA/pHYs chunks survive. The regeneration note now says to
  convert, since a browser screenshot reintroduces the channel every time.
- HTML pages inherited `max-age=0, must-revalidate`, paying a blocking
  revalidation round trip on every repeat navigation. Now a short bounded
  window, per page rather than under `/*` so a stale 404 cannot be cached.

**Known defect, not fixed here.** Cloudflare returns 403 ("error code: 1010",
Browser Integrity Check) to any client whose user-agent matches
`Python-urllib/*` or `libwww-perl/*`, on every path including `/mcp` and
`/robots.txt`. Python's standard library sends that UA by default. The block is
a pure user-agent string match with no security value: wget, Go, Java, okhttp
and an EMPTY user-agent all pass. It is generated at the edge before the Worker
runs, so no code in this repo can clear it — it needs a WAF skip rule in the
Cloudflare dashboard. The audit now fails loudly on it rather than being blind
to it, which it was: every previous check set a custom user-agent.

## 1.11.3

Registry metadata only, no behaviour change. The MCP registry description, the
one line every registry consumer sees, said "World Bank, IMF, BIS, ECB" and
omitted the Caribbean central banks. The registry caps descriptions at 100
characters and rejects same-version republishes, so the corrected line ships
as a version: "Cited economic statistics: World Bank, IMF, BIS, ECB, Caribbean
central banks. Verify any figure."

## 1.11.2

Discovery pass: how agents find and start using the service.

- A bare `GET /mcp` stays 405 (stateless server, no SSE stream) but now carries
  a JSON discovery body: name, version, both protocol versions with the
  Mcp-Method note, docs, REST root, openapi and llms.txt links. Until now a
  sniffing agent got zero bytes and learned nothing.
- Homepage JSON-LD extended: the stale description that named only "World Bank,
  IMF, ECB" now includes BIS and both Caribbean central banks, a SearchAction
  entry point is declared, and a DataCatalog lists six datasets each attributed
  to its PUBLISHER with a live example URL. All six verified to resolve 200.
  No licence is stamped across publisher data and no person is named.
- `/.well-known/security.txt` published.
- The Apify actor bundle is rebuilt from current core. It predated the week's
  fixes, so the paid surface was still suggesting series ids that 422 and
  missing the French-territory explanations and the CBB catalogue.

## 1.11.1

Second audit pass, every finding verified against the live service.

- Search no longer recommends a series the caller cannot use. A query naming a
  country now drops fixed-geography series that cannot serve it, so
  `euro_area_hicp` stopped ranking third for "barbados inflation" and
  "jamaica inflation", both of which returned 422 when followed.
- `/docs` no longer scrolls sideways on a phone. Two inline code spans, an MCP
  config JSON and a long DBnomics series id, widened the page to 465px in a
  375px viewport. Inline code now wraps; `pre` still scrolls.
- `openapi.json` documents the `caribstat/` id form, the `#Row Label` selector
  and the `[n]` occurrence form. It had never mentioned caribstat at all, so
  the Caribbean corpus was invisible to generated clients.
- The licence ledger is stated correctly on `/docs` and in `llms-full.txt`.
  Both still listed ECCB and the Central Bank of Barbados as refused sources
  two days after they became served.
- `llms.txt` and `llms-full.txt` now state the real coverage: seven ECCB tables
  across nine geographies and sixteen Barbados tables.
- The country_snapshot description no longer claims a fixed indicator count.
  It varies from 5 to 11 by economy, and was overstated for exactly the small
  states this service exists to cover.

## 1.11.0 — 2026-08-13

Found by auditing the LIVE service rather than the repo, and each item verified
against the deployed site after the fix.

**A transform did not relabel its unit.** `transform=yoy` on Barbados GDP in
current US$ returned 5.18 while still declaring `unit: "current US$"`; the real
2024 figure is 7,597,571,450. An agent trusting the declared unit publishes a
number wrong by nine orders of magnitude, in the one field a consumer is meant
to rely on. `transform=index` was worse: rebasing `cpi_index` to 2018 kept the
source label "index, 2010 = 100" beside a note saying 2018, so one response
asserted two base years at once. Transforms now return their own unit, the
index rebase names the base period it actually used, and the citation carries a
notice that values are computed rather than as-published.

**A coverage fact is not the same as an unknown code.** `country=XYZ` returned
"The World Bank does not publish NY.GDP.MKTP.KD.ZG for XYZ … some economies are
not World Bank reporting economies", inventing a country and then reporting on
it. The cause was not the wording: the country table was missing 19 REAL
economies, including Montserrat and Anguilla, this service's own headline
coverage example, so the three-letter passthrough could not tell an uncovered
economy from a made-up code. Those economies are now in the table, and the
passthrough is marked `unverified` so only genuinely unknown codes take the new
branch.

**Query booleans were compared to the literal string "true".** `strict_source=1`
silently downgraded a reproducibility guarantee to permissive mode and returned
200; `latest_only=1` returned the full series. Both now accept true/1/yes/on and
reject anything unparseable with a 400.

**The sitemap listed URLs that all redirected.** Every content page was
submitted as `/docs.html`, which 307-redirects to `/docs`, and `/docs` declared
its canonical as `/docs.html`: a canonical loop on a temporary redirect. A
credible cause of the near-total absence of search crawling measured the same
day, Googlebot 3 visits per day against ~300 from AI crawlers.

Also: `compare_sources` widened from a 12-observation tail that could miss
overlaps spanning decades; `/v1/compare` no longer says "only one source
responded" when zero did; `/v1/fx` rejects future dates itself instead of
returning 502 and blaming the ECB; `/v1/status` distinguishes a cached probe
from a live one; HEAD is supported and every 405 carries `Allow`; deep-research
`search` no longer emits ids that the paired `fetch` is guaranteed to refuse;
the BIS coverage claim corrected from "~38 central banks" to the 49 economies
actually served; the privacy policy now names all seven upstream hosts rather
than three; and the site gained an og:image, favicon.ico and apple-touch-icon,
all of which were missing or 404.

Reuse terms are now declared machine-readably: robots.txt carries the Content
Signals Policy (`search=yes, ai-input=yes, ai-train=no, use=reference`) and
`/.well-known/tdmrep.json` carries a TDM reservation. Crawlers stay welcome;
the reservation is against training and wholesale reproduction, not reading.

## 1.10.1 — 2026-08-10

- **One honest-absence contract for both World Bank coverage shapes.** The
  World Bank signals "this economy is not one we report" two different ways:
  an empty result set (Anguilla) or a parameter-validation message
  ("Invalid value: The provided parameter value is not valid", Montserrat).
  The second was passed through raw as "World Bank API error — …", which reads
  as a StatCite fault rather than a coverage fact, and carried no
  machine-readable flag. Both now return the same message shape and
  `no_published_data: true`, so an agent deciding whether to look elsewhere
  branches on a field instead of parsing prose.
- A genuine upstream fault is still surfaced as an error — the guard matches
  only the validation-refusal wording, and a test asserts that a transient
  World Bank message is never disguised as absence. That distinction is the
  point: reporting a broken query as "this economy publishes nothing" would be
  a false claim about the world rather than about our request.
- Found by a live Caribbean coverage sweep, and the fix is mutation-verified.

## 1.10.0 — 2026-08-10

**MCP protocol revision 2026-07-28 support, served dual-era.**

The 2026-07-28 revision is breaking: it removes the `initialize` handshake,
protocol-level sessions, `ping`, the GET stream and SSE resumability, and
replaces them with per-request metadata. Rather than pick an era and strand
the other, StatCite now speaks both on the same endpoint, choosing per request
from the version the request itself declares.

- **Legacy clients are provably unaffected.** Everything from 2025-03-26 to
  2025-11-25 behaves exactly as it did in 1.9.1 — same handshake, same result
  shapes, no new required headers, unknown methods still HTTP 200,
  resource-not-found still -32002. This is asserted by its own regression
  tests and confirmed by mutation: leaking modern result-shaping into a legacy
  response fails the suite.
- **New in the modern era**: `server/discover` (mandatory in 2026-07-28 —
  advertises supported versions, capabilities and identity without a
  handshake); `resultType: "complete"` on every result; `ttlMs` + `cacheScope`
  on cacheable results (`server/discover`, `tools/list`, `prompts/list`,
  `resources/list`, `resources/read`); `_meta` server identity; and HTTP 404
  paired with -32601 for unknown methods.
- **Header/body agreement is enforced.** 2026-07-28 requires
  `MCP-Protocol-Version`, `Mcp-Method` and (for `tools/call`,
  `resources/read`, `prompts/get`) `Mcp-Name` on every POST, so intermediaries
  can route without parsing the body. StatCite validates that they match the
  body and refuses disagreement with -32020 `HeaderMismatch` + HTTP 400,
  including the Base64 sentinel (`=?base64?…?=`) form for non-ASCII names. A
  request that declares modern in one place and legacy in the other is treated
  as modern so it reaches this check, rather than being quietly served under
  the older unvalidated rules.
- **Version errors are now the spec's**: an unsupported version returns -32022
  `UnsupportedProtocolVersion` with the supported list in `error.data`, in
  place of the old implementation-defined -32000. Both codes moved into the
  range 2026-07-28 reserves for the specification.
- `server/discover` deliberately answers a bare probe with no headers: it is
  the mechanism a dual-era client uses to discover what the server speaks, so
  refusing it for a missing header would break the negotiation it exists for.
- stdio transport is dual-era too, using the body `_meta` (and the
  `server/discover` probe) since stdio carries no headers.
- Not implemented, by design: `subscriptions/listen` (StatCite emits no change
  notifications — its lists change only on deploy, which `ttlMs` now
  communicates), and the MRTR input-request pattern (no tool ever needs
  sampling, elicitation or roots). Both are advertised accordingly rather than
  claimed.

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
