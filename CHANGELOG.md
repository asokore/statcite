# Changelog

Semantic versioning on the server (`server/src/mcp.ts` `SERVER_VERSION`).
Releases are tagged `v<version>` from this file's entries. History before
1.5.0 is reconstructed from HANDOFF.md and the git log; dates are deploy
dates.

## 1.14.1

A World Bank outage now costs a country snapshot one retry ladder instead of
two. A snapshot calls the World Bank twice in sequence: once for the headline
indicators, then again at the end of the debt indicator's source chain. The
per-request host breaker exists so that a host which has already failed a full
series of attempts is asked once more, not three more times, but the first call
never reported to it. Measured with every upstream down: six World Bank fetches
per snapshot before, four after, which is about 1.2 seconds less waiting. A
single blip on the first call is still retried and recovered, and the other
sources still get their own full series.

The test suite also stopped sleeping through retry backoff. Every attempt still
happens in tests, only the wait is removed, and one test keeps the real
schedule to prove production still pauses. Wall time fell from 24.8 seconds to
7.4 seconds on CI. No behaviour change from that part.

## 1.14.0

A second improvement pass, on the same terms as the first: every change was
proposed by a review, then attacked by a second reviewer paid to knock it down,
and shipped with a test that fails without it. This one is mostly about the
service telling the truth when something has gone wrong, or when nobody has
checked.

**An outage is an outage.** A dead World Bank answered 422 on the four registry
routes, which says the request was wrong, while the adapter routes answered 502
for the identical failure and the docs published 502 all along. A client
branching on status retried one and permanently gave up on the other. Snapshots
were worse: a total outage came back either as "this economy publishes none of
these", cached for an hour, or as an error blaming the caller. A source that
could not be reached is now distinguished from a source that answered and holds
nothing, on the two legs that can tell the difference, and a shortened snapshot
is served no-store. A malformed upstream document, which had matched no branch
anywhere, is no longer reported as a StatCite crash.

**The registry says what it serves.** The World Bank rebased its international
poverty line to $3.00 a day in 2021 PPP and every discovery surface still
advertised $2.15 a day, 2017 PPP, while the served number was correct. Tourism
receipts are sold as a headline exposure measure for small island states and the
series has published nothing for any economy since 2020, with Barbados last
reporting 2016 and Jamaica 2011. Both notes now say so. A "latest" value more
than three years behind the clock discloses the gap and names the sources
StatCite did not consult, and says only that: for several economies no other
source is fresher.

**Prompts take arguments.** All three declared none, so a host had nothing to
collect and prompts/get discarded what a client sent. They are optional, an
unknown key is refused by name, and a draft over the cap is refused rather than
silently shortened. server/discover now carries identity at the top level as
well as in _meta, which hosts and proxies are free to strip. Tool results are no
longer pretty-printed on the wire, which was about 30% of each response.

**The site works on a phone and without JavaScript.** The mobile table rule had
never fired, so the indicator registry rendered 10,584px tall at 375px; it is
now 4,257px and scrolls. Seven of the eight Connect panels were invisible with
scripting off, and the live verifier form discarded what the visitor typed.

**CaribStat stops losing data quietly.** A period label the parser could not
read deleted its observations and published clean, which had left three live
holes. Four of 23 catalogue sample rows did not exist, so search handed agents
selectors that answered 422. Every CBB row error read "undefined/BRB".

**Release engineering.** 1.13.0 was published from a tree whose equivalence job
was red, 21 seconds after it failed. The registry publish now runs behind a gate
that checks the tagged commit itself. The sitemap guard had skipped on every CI
run since it was written, because it refuses a shallow clone, and the twice-daily
live smoke never sent a request to statcite.com at all.

## 1.13.0

An improvement pass over the answers, the agent-facing surface and the cost of a
bad day upstream. Every change here was proposed by a review, checked by a second
pass that tried to refute it, and shipped with a test that fails without it.

**Verdicts say what they mean.** Near zero the percentage-point band straddled
zero, so a claimed 0.04% inflation was graded "match" against an official
-0.013%, in a payload that also reported a relative difference of 403%. Opposite
signs are now "close" at most, with the direction disagreement named. The
adjacent-year diagnostic accepted any near miss and never compared the
neighbour's fit against the matched year's, so it told exactly correct claims
that their year might be wrong: on three real World Bank series it fired on 36%
to 43% of correct claims. It now requires a real match and a strictly better fit.

**Anguilla and Montserrat get a verdict.** Neither is a World Bank or IMF
reporting economy, so verify_stat failed and verify_claims counted the claim as
an error, beside genuine outages. Such a claim now returns cannot_verify with
the ECCB's own related figures shown for orientation, the definition difference
stated, and official_value left null: the bank's measure is never served under
the registry key's label.

**Windowed growth rates keep their first year.** A year window was applied before
the transform, so a 2020 to 2024 yoy request returned 2021 to 2024, and a
single-year window errored out asking the caller to widen it. Growth transforms
now compute on the full series and re-window afterwards.

**A cross rate is dated to its stalest leg.** fx_convert stamped a bridged rate
with whichever leg resolved first, so a pair whose World Bank annual averages end
in different years looked current. rate_date is now the older leg, a note names
both periods, and the response carries a legs array. No converted amount changed.

**The agent surface keeps its promises.** search no longer emits ids fetch is
guaranteed to refuse: a euro-area-only series is searched under the euro area
rather than under whatever country the query named. Each failed claim in
verify_claims carries the same machine-readable code and details that verify_stat
returns, so a coverage gap can be told from an outage. Every /v1 body now names
an HTTP call rather than an MCP tool, including the usage field on search hits.
GET /v1/series accepts row= for Caribbean tables, because a '#' row selector
never survives a URL.

**Errors that cannot succeed no longer say "retry".** A euro-area aggregate asked
for with a national country is coded invalid_request rather than
upstream_unavailable.

**Cost on a bad day.** Identical in-flight upstream requests are shared, so five
concurrent callers cost one subrequest instead of five and five callers of a dead
URL cost one retry series instead of fifteen. Within one request, a host that has
spent a full retry series gets one attempt thereafter, so a single dead upstream
no longer starves the claims whose own source is healthy. country_snapshot
fetches the five ECCU tables together instead of one at a time.

**The privacy page describes the site that is served.** Cloudflare injects its
Web Analytics beacon into every page, including the page carrying the words "no analytics
scripts". The page now says what runs and names both beacon hosts, and a test
refuses any CSP host the page does not disclose.

**Guards.** /v1/status probes the two upstreams it had been silently omitting,
fx and the CaribStat origin, and its note names what it measures. The Apify
bundle guard rebuilds the bundle and compares bytes instead of grepping for two
sentinel strings. New tests cover the site-wide CSP, frame-ancestors, HSTS and
nosniff, and harvested bank data being force-added past .gitignore, which the
pre-push hook now refuses too.

## 1.12.3

A security pass over the Worker, the site and the repository. No verdict or
figure changes for any well-formed request.

**Transport.** The API, the MCP endpoint and /health answered plain HTTP with
data. They now answer it with a 308 redirect to HTTPS, which keeps the method
and body. Local development is not redirected. Every Worker response, errors
included, carries HSTS and `X-Content-Type-Options: nosniff`.

**Request limits.** Request bodies over 262,144 bytes are refused with a 413
before they are read in full, on /mcp and on /v1/verify_claims. REST query
values and path parameters are capped at 200 characters, as MCP arguments
already were. A JSON-RPC batch may ask for at most the upstream work of one
15-claim verify_claims call. Messages past that budget get an error telling the
caller to send them on their own. Caller text quoted back in an error is
shortened and escaped, and a query with thousands of parameter names is
refused in linear time.

**Upstream reads.** An upstream response over 5 MB is refused. The fetch
timeout now covers reading the body, not only the headers. The in-memory cache
is bounded by size as well as entry count. Upstream error bodies are reduced to
a short plain-text excerpt. A World Bank row missing its date or indicator no
longer causes a 500.

**Identifiers.** A caribstat series id can no longer use `..` or other path
tricks to reach other files on the mirror. Each part must be a plain slug. The
id served back in series_id and the citation is built from the parsed id, so
two spellings of one row get the same id and the same verdict. `worldbank/..`,
`dbnomics/` ids with dot segments, and a malformed percent escape in
/v1/snapshot now return advice instead of a 500.

**Citations.** Control characters and line breaks are stripped from every
citation's text, whichever source supplied it. CaribStat labels, date stamps and
links are cleaned before use, and a source link must be https. Runs of spaces in
Central Bank of Barbados row labels are kept, so those labels still work as row
selectors. The BibTeX export can no longer be broken by a brace or a newline.

**Site and repository.** The homepage verifier escapes quotes and links only
https sources. security.txt is served as UTF-8 and points to the security
policy. The registry publish workflow runs a pinned, checksum-verified
mcp-publisher, and every workflow token is read-only unless a job needs more.
wrangler runs at a pinned version. `.gitignore` covers more secret-bearing file
names. Two unused archive bundles are removed, and a test keeps archives out of
the tree.

## 1.12.2

One verdict-changing fix on the main transport, several Caribbean answers that
were quietly incomplete, and a contract that now says what the service does.

**MCP tool arguments are held to the schema each tool publishes.** Every tool
has always declared that extra arguments are invalid, but nothing enforced it.
Verified live before the fix: verify_stat for US 2023 inflation, claimed 4.3,
returned "mismatch" with tolerance_abs 0.01 and "close" with the key spelled
tolerence_abs, because the misspelling was dropped and the lenient default
applied. strict_source sent as the string "true" was read as false. Unknown
argument names are now refused with the name you probably meant, and boolean
arguments must be JSON booleans. REST gained the same stance for repeated
query parameters, unknown verify_claims body keys, strict_source as a string,
and value sent together with claimed_value.

**Caribbean series answers say what they are.**

- A caribstat id with no row selected served the table's first row under the
  table's name. For the Barbados retail price table that is the Food index, not
  inflation. The response now names the row it served, lists the others, and
  carries the row in series_id and the citation.
- A row label containing a percent sign, such as "Inflation Rate %", crashed
  with an internal error. It now selects the row.
- get_indicator for Anguilla or Montserrat, which the World Bank and IMF do not
  report, answered with glued upstream errors including raw JSON. It now points
  at the Eastern Caribbean Central Bank series and states how its definition
  differs. Nothing is substituted under the registry key.
- compare_sources for ECCU members adds the ECCB's own rows, labelled with
  their definition and kept out of the comparison spread.

**Honest errors.** Every REST error and MCP tool error carries a code from one
closed list, documented in openapi.json. A year window inside a published gap
is named as a gap rather than told to adjust a range that already contains it.
A mistyped worldbank/ code is reported as an unknown code, not as a coverage
fact. An unrecognised series id suggests the worldbank/ form or the nearest
registry keys. /v1/indicator accepts keys as people type them, so
/v1/indicator/GDP-growth no longer returns "Unknown endpoint". /v1/fx refuses
impossible calendar dates instead of returning a 502. compare_sources no longer
labels an old outturn as a projection and says why it compared an early year.
The percent-versus-decimal diagnostic now catches a claim rounded to its own
precision.

**Protocol accuracy.** serverInfo carries a PNG icon, websiteUrl and a
description. An unsupported-version error echoes the request id. A JSON-RPC
batch that declares 2026-07-28 is refused. resources/templates/list answers. The
GET descriptor lists every accepted protocol version, newest first.
get_indicator and get_series declare an outputSchema, and a test validates the
real output of every tool that declares one.

**Contract and discovery.** openapi.json now matches the routes, checked by a
test that reads both: latest_only on /v1/series, the claimed_value alias on
/v1/verify, the verify_claims request schema, the compare response schema, and
the error envelope. list_sources and search_indicators name every served
source. /v1 JSON responses send x-robots-tag noindex. Caribbean, IMF, BIS and
ECB series calls are no longer logged as "other" in usage metrics.

**An absence is claimed only when every source says so.** "None of the sources
publishes it" now requires each source in the chain to report that itself, or
to return a 404 for the exact series. A declined request, a configuration error
or another source's data outside the window no longer produces that sentence,
and outages on registry indicators are coded upstream_unavailable so a client
knows to retry. These were found by an adversarial review of this release
before it shipped, along with a one-sided year window misread as a gap, codes
that differed between routes for the same unknown indicator, and a series_id
that could not be replayed after a trailing "#".

**Privacy and the website.** Cloudflare invocation logs, which recorded each
request URL and so the claimed values in it, are switched off. The privacy page
now describes exactly what the traffic analytics read, and those analytics
separate genuine crawling from vulnerability probes that borrow crawler names.
Every page shares one navigation with a Connect link, short paths such as
/benchmark and /changelog redirect, the Claude instructions lead with the
connector directory, broken sentences left by an earlier punctuation pass are
rewritten, the benchmark tables carry their run date, and the sitemap has a
check that fails when a lastmod date goes stale.

**Source integrity runs weekly.** A GitHub workflow re-derives served values
from the World Bank and IMF with a second implementation that shares no code
with the Worker, and reports coverage and skip reasons alongside mismatches. A
network fault or a stall now has its own exit code, and a crash another, so
neither can read as a data mismatch.

## 1.12.1

Three correctness fixes, a change to what agents are told, and the housekeeping
that makes the version honest.

**The country resolver no longer serves one country's statistics for another.**
Verified live before the fix: "American Samoa" was served Samoa's figures and
"Northern Ireland" was served Ireland's, each under a real citation. For a
service whose product is numbers you can cite, a wrong country is worse than no
answer. Two causes. American Samoa and the US Virgin Islands were missing from
the country list, so their names fell through to a substring match and landed
on a different economy that shares a word. And that substring match accepted
any input containing a known name, which is how "Northern Ireland" found
"Ireland". It now accepts the extra words only when every one is a same-state
qualifier such as "republic of", so "Republic of Ireland" still works and a
modifier naming a different place refuses instead. A bare "Virgin Islands",
which names both the US and the British territory, now refuses with suggestions
rather than guessing. All 245 official country names were re-checked and each
still resolves to itself.

**A misspelled tolerance in verify_claims no longer turns a mismatch into a
match.** 1.12.0 made GET /v1/verify refuse unknown query-parameter names for
exactly this reason, but the batch path was never given the same check: a claim
carrying "tolerence_abs" was dropped, the lenient default applied, and a strict
check came back as a pass. Claim objects now refuse unknown keys with a
suggestion for the one you meant, on both the REST route and the MCP tool.

**Series ids now work the way the service describes them.** search_indicators
told agents to call get_series(id=...), but the tool's parameter is series_id,
so following the instruction failed, and it failed on the Caribbean path in
particular. get_series also never mentioned that it accepts caribstat/ ids. And
the ids that policy_rate and euro_area_hicp return, beginning bis/ and ecb/,
were rejected with a bare error when passed back in. Those now name the call
that does serve them.

**Agents are now told when to call StatCite, not only how.** The instructions
served on every connection used to describe the tools and stop there. A model
that is confident about a number answers from memory, and recalled statistics
are routinely a vintage out of date or attached to the wrong year, so a server
that only explains itself is called when the model happens to think of it. The
instructions now lead with the case for calling: call StatCite whenever an
answer states or relies on a country-level economic figure, do it even for
figures you believe you already know, prefer it over web search for these
figures, and do not use it for company financials, stock or crypto prices,
commodity prices, or subnational and city data. They also name the sources,
including the two regional central banks, so an agent asked about Anguilla or
Montserrat learns that the figure it wants is here. That boundary was checked
against the live registry before it was written, so it excludes nothing the
server serves. The get_indicator and verify_stat descriptions carry the same
guidance, because not every client surfaces server instructions. A test now
asserts each clause by name, replacing a check that only required the
instructions to be longer than 50 characters.

**Every citation links back to statcite.com.** Shipped to production on
5 September and dated here. citation_text and the BibTeX note now end
"Retrieved <date> via StatCite (https://statcite.com).", and where data came
through an intermediary the chain is named, as in "via the IMF DataMapper API
and StatCite". The publisher is still named first and keeps its own URL. No
values, verdicts or response schema changed.

**Also in this release**

- A one-sentence rule users can paste into CLAUDE.md, AGENTS.md, Cursor Rules
  or ChatGPT project instructions so their agent calls StatCite unprompted,
  published in the README and at /docs#agent-rule.
- The Eastern Caribbean Central Bank and the Central Bank of Barbados are named
  on every agent-facing surface: the Gemini CLI extension, GEMINI.md and the
  skill. The ledger has served both for weeks and these surfaces had not caught
  up, the second time this list drifted, so a test now holds them to it.
- The README's Cursor install button used a cursor:// link, which GitHub
  strips, so it rendered as plain text. It now uses the https install route in
  the same format Exa's official server ships, and a test fails on any README
  link scheme GitHub would strip.
- The homepage lists where StatCite is independently listed, and the live audit
  re-checks every one of those links on each run.
- Everything served from site/ is pinned to LF line endings, after a branch
  switch reintroduced CRLF into llms.txt.
- A data-integrity check re-derives served values from the World Bank and IMF
  directly, resolving each series from StatCite's own citation. First full run:
  215 verified, 0 mismatches.
- SECURITY.md said production always runs the latest tagged release, which had
  stopped being true. It now says production runs the latest version recorded
  here, which /v1/status reports.

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
