# Growth Plan: August 2026

Produced 2026-08-07 from a 12-agent research pass (2 repo-ground agents, 6 web
research lanes, 3 adversarial judges, 1 synthesis; 301 web/file lookups; 67
ideas → 57 surviving the constraint/impact/ops filter). Load-bearing repo
claims were re-verified by the orchestrator before this file was written;
external claims carry their evidence URL inline. Where a claim is unverified
it says so.

**Measured verdicts since this plan was written.**

- *Sitemap/canonical fix, judged 2026-08-29.* The 2026-08-14 fix (extensionless
  sitemap URLs, canonicals that resolve 200) did NOT move search-crawl volume:
  the week before averaged 14.3 search-engine crawls a day (13, 16, 6, 29, 5,
  19, 12) and the week of 22-28 Aug averages 17.1 (24, 11, 7, 20, 48, 5, 5),
  which is noise on daily swings of 5 to 48. Days 15-21 are unrecoverable:
  Cloudflare keeps request-level detail about seven days and no snapshot ran
  that week. Crawl VOLUME on a site this small is budget-driven and was the
  wrong success metric anyway; the question that matters is whether the pages
  are INDEXED, which only Search Console answers. ANSWERED 2026-08-29, same
  day: statcite.com had NEVER been a verified Search Console property. It is
  now — URL-prefix property verified by HTML file (`googlee227cf46ca3fa231.html`,
  committed to `site/` and it must never be removed), sitemap.xml submitted,
  and indexing requested for the homepage. The URL inspection gave the real
  diagnosis the crawl counts never could: "Crawled — currently not indexed",
  LAST CRAWL 25 JULY 2026 — Google fetched the homepage before the canonical
  and sitemap fixes existed, declined to index it, and never came back. The
  sitemap row read "Couldn't fetch" minutes after submission with Last read
  empty, which is the known placeholder before Google's first read (same
  pattern asokore.com showed). CHECK BACK in about a week: Sitemaps "Last
  read" should be populated and the homepage indexing state should move. Do
  not keep re-measuring crawl counts looking for this signal.
- *First search impressions, 2026-08-29.* Google confirmed by email the same
  day that it "started collecting Google Search impressions" for statcite.com,
  meaning pages now appear in results for some queries. That is the first
  search-visibility signal this property has ever produced, and it followed
  within hours of verification, sitemap submission and the indexing request.
  Performance data lags about two days, so the first real query list should be
  readable from roughly 31 August.
- *Indexing CONFIRMED, checked 2026-09-02.* URL inspection on
  https://statcite.com/ reports "URL is on Google", "Page is indexed", served
  over HTTPS, and **6 valid Data sets items detected**. That closes the
  "Crawled - currently not indexed" problem that had stood since 25 July, and
  it closes the Dataset structured-data defects flagged on 29 August: the
  Data sets report shows Invalid 0 with "Missing field 'description'" marked
  **Validation: Passed**, and the sitemap now reads Success, last read
  1 September, 9 pages discovered (it was "Couldn't fetch" with an empty Last
  read). Note the trap: the aggregate **Pages report still said "Indexed 0"**
  with a last-update stamp of 27 August, because that report lags. The
  per-URL inspection is the current answer and the aggregate is not. Reading
  the summary tile alone would have produced a confident, wrong "still not
  indexed".
- *Usage review, 2026-09-05.* The MCP side has real traction and the website
  side has none, and those are different problems. Claude-User calls to /mcp
  went from about 1,000 a day on 8 August to **3,125 on 5 September**, tripling
  in a month, with 61% of all MCP traffic now user-driven. The outcome mix for
  user-class callers that day was 3,181 x 2xx, 7 x 4xx (all 405, a client
  probing GET), 0 x 5xx: a 0.2% error share, so retention is not being lost to
  failures. Pageviews stayed flat at ~140 a day and search-engine crawl at
  5 to 48 pages a day, and the only attributed Google query is still the
  brand name.
- *The biggest organic channel was carrying nothing, fixed 2026-09-05.* Every
  one of those ~3,000 daily responses ends its citation_text with "Retrieved
  <date> via StatCite." and then links only the publisher. The words were
  there and the link was not, so citations pasted into reports and papers led
  nowhere. citation_text and the BibTeX note now read "via StatCite
  (https://statcite.com)", built in one helper across all seven templates,
  with the publisher still first and still carrying its own URL. That is the
  standard form for a retrieval intermediary and the FAQ already said it was
  appreciated. Verified live on the World Bank, IMF DataMapper and ECCB paths.
- *Listings, checked 2026-09-05.* Glama auto-synced to 1.12.0, grade A.
  Smithery is serving a month-old scan: old description, 10 of 12 tools, and
  a get_series blurb that advertises the FRED path (the live tool description
  says FRED is permanently disabled, so this is their cache, not our code).
  Needs a rescan from their dashboard. PulseMCP is still not listed and their
  submissions are still paused ("while we rework how we ingest"); nothing to
  do but wait. The three directory PRs (docker/mcp-registry#4538,
  awesome-mcp-servers#10881, awesome-remote-mcp-servers#527) are all
  mergeable and clean and all awaiting their maintainers since July.
- *Search Console not re-read, 2026-09-05.* The Chrome extension was down for
  the whole session and the in-app browser has no Google session, so the
  three-day-old impressions figures above are the latest. The 2 September
  numbers stand.
- *The discovery problem is now the REAL problem, 2026-09-02.* Three months of
  Performance data: 9 impressions, **0 clicks**, average position 7.1, and
  exactly one attributed query - `statcite`, the brand name itself. There is
  no non-brand discovery at all. Being indexed was necessary and is now done;
  it bought brand-name visibility and nothing else, and position 7.1 is weak
  even for one's own name. Nobody is finding this service by searching for
  what it DOES. The next lever is therefore on-domain content that can rank
  for the questions the target audience actually types, not further technical
  SEO: the technical surface is now clean (158 audit checks, structured data
  on all six pages, sitemap with lastmod, llms.txt spec-conformant).
- *Dataset structured data, 2026-08-29.* Google immediately flagged the new
  DataCatalog: "Missing field 'description'" (CRITICAL, 6 items) and "Missing
  field 'license'" (non-critical, 6 items). Both were defects in markup added
  the same morning, and both are fixed: every dataset now carries a description
  and its OWN publisher's licence, taken from the live ledger. Re-validation
  requested for the critical issue and confirmed Started. Note the harness
  passed 124 checks while that markup was invalid, because it tested that
  datasets existed rather than that they carried the fields Google requires; it
  now tests the fields.
- *AI-native confirmation stands.* Across every measured day, AI crawlers
  outnumber search engines except on the very quietest days (e.g. 611 vs 24 on
  22 Aug, 215 vs 48 on 26 Aug). Distribution effort belongs on agent surfaces,
  which is where the 1.11.x releases, the registry description, llms.txt and
  the GET /mcp descriptor went.
- *PulseMCP, checked 2026-08-29.* Still paused, still "mid-August" verbatim,
  still not listing statcite. The prerequisite they name (official registry)
  serves 1.11.3. Waiting on them; the lever if it drags is an email, which is
  the owner's.

**Strategic read.** The growth engine is not the product; it is the benchmark
result, funnelled through a zero-friction demo into agent-native distribution
surfaces. All directory plumbing exists, but there has never been a launch
moment, and organic web presence is near-zero (only the Glama listing ranks
for "statcite"). The story genre is proven: the EBU/BBC "45% of AI news
answers wrong" study earned NPR/CBC/Al Jazeera coverage from one headline
number plus a public methodology
(https://www.npr.org/sections/npr-extra/2025/10/21/g-s1-94424/), and the
IMF's own StatGPT paper concedes generative models "perform poorly at
delivering official statistics"
(https://www.imf.org/en/publications/departmental-papers-policy-papers/issues/2026/03/10/statgpt-ai-for-official-statistics-573514).
Meanwhile the layer that decides whether agents ever call this server is
text, tool descriptions, prompts, the skill. So: (1) make the server legibly
alive, routable and hardened; (2) build launch assets and remaining
distribution surfaces; (3) fire the launch cluster once, the day the
benchmark embargo lifts. Launch the result, not the tool.

**Correction applied at verification:** the research called per-IP rate
limiting a launch blocker "verified absent from server/src". Code-level
limiting is indeed absent, but a Cloudflare WAF rate rule (200 req/10s per
IP) is already deployed at the edge, which is what burst protection actually
requires. Rate limiting is therefore NOT a blocker; cache headers on /v1
remain worth adding for CPU headroom.

## Phase 1: this week (pure code/content, no external gates)

Priority order. Verified-true starting facts: `resources/list` and
`prompts/list` return empty arrays in `server/src/mcp.ts`; `outputSchema` +
`structuredContent` are implemented and live for exactly two tools (search,
fetch); LAUNCH.md checkboxes have drifted from reality.

1. **Doc reconciliation.** Fix LAUNCH.md checkbox drift; update
   distribution/submissions.md §3 (Connectors Directory approved 2026-07-29);
   add a StatGPT row to STRATEGY.md's competitive posture (VENTURE-CONTEXT
   finding 1 instructed this before any new copy, still unexecuted); log
   closed licence/funding verdicts so no session re-researches them
   (UN Comtrade blocked: for-profit trigger is the application,    https://uncomtrade.org/docs/policy-on-use-and-re-dissemination/; IDB Lab
   closed: loans to companies with audited financials, not individual grants;
   Project Galileo: null payoff on existing free tier).
2. **Tool description rewrite** (`server/src/tools.ts`): verification verbs,
   the honesty contract ("returns cannot_verify rather than a guess"),
   vintage capability. Tool descriptions are the routing layer
   (https://community.openai.com/t/chatgpt-only-uses-search-tool-in-mcp-server/1358796).
   Update snapshot tests; sanity-check routing after deploy.
3. **outputSchema on verify_stat + verify_claims** (then the rest): the
   mcp.ts plumbing already exists; add schemas + a test asserting every tool
   that advertises outputSchema always returns structuredContent.
4. **MCP prompts + resources** (`server/src/mcp.ts`): `fact_check`,
   `country_brief`, `cite_this_stat` prompt templates; the indicator registry
   and licence table as resources, generated from the same constants the
   tools use. The `fact_check` prompt is the constraint-compliant form of the
   deferred verify_report wedge: the CLIENT model extracts claims,
   verify_claims adjudicates, no NLP enters the Worker.
5. **Aliveness pack**: /v1/status (upstream probes, ttl-cached), CHANGELOG.md
   with semver + tagged releases, SECURITY.md, scheduled CI cron running the
   existing live smoke script. Rationale: ~52% of audited MCP servers are
   dead; evaluators now score aliveness
   (https://rapidclaw.dev/blog/mcp-servers-dead-what-it-means-2026).
6. **Licence ledger as product surface**: per-source licence name, verdict,
   verbatim quote, terms URL, verified-on date, exposed via list_sources,
   /v1/sources and a public page, including refused sources (FRED, ECCB, CBB,
   UN Comtrade). Gates all later source additions; pre-answers DPG/grant
   diligence (https://www.digitalpublicgoods.net/standard).
7. **Verification depth** (the moat): unit/scale advisory notes on verify
   verdicts; fuzzy country resolution + structured honest-absence payloads;
   vintage revision diagnosis on mismatch (probe claim-date WEO edition,
   return match_previous_vintage/revised_since, degrade honestly);
   expected-release info; BibTeX/APA fields in citations; a compare_sources
   divergence tool. Evidence: real user pain in wbgapi/imfp issue trackers
   (https://github.com/tgherzog/wbgapi/issues/25,
   https://github.com/Promptly-Technologies-LLC/imfp/issues/84).
8. **Registry adds, cheapest first**: World Bank IDS debt series (same WB
   adapter/endpoint, same CC BY 4.0); a SIDS country group + small-states
   coverage page framed strictly as data availability (StatGPT's SDMX
   mechanism structurally misses these economies).
9. **Content**: benchmark explainer page (embargo-safe: why LLMs fail
   official statistics, anchored on the IMF concession + the public
   methodology. No Run 2 numbers); /try page (static, dropdowns baked from
   the registry, client-side verify_stat call, no free text, no NLP); README
   overhaul with one-line install + editor deeplinks; repurpose llms-full.txt
   as agent onboarding (stop further llms.txt investment: production crawler
   data shows ~408 fetches in 500M+ AI-bot requests,    https://ariashaw.com/does-llms-txt-actually-work).

## Phase 2: this month (distribution + assets)

- **ChatGPT app directory** submission (identity-verification eligibility
  must be confirmed first), largest uncovered user pool at zero cost
  (https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/).
- **Deep Research compatibility** page + CI contract test pinning
  search/fetch to OpenAI's schema.
- **Skill eval then plugin**: run the skill-creator eval loop on the
  never-evaluated skill; publish a Claude Code plugin (marketplace.json
  in-repo), submit to plugin/skill directories.
- **Editor surfaces**: Cursor marketplace + cursor.directory; Cline
  marketplace (llms-install.md); a thin Gemini CLI extension repo
  (gemini-extension.json + GEMINI.md, no code).
- **Directory hygiene**: fix Glama's ungraded Maintenance signal (tagged
  releases + SECURITY.md from Phase 1); refresh every listing to lead with
  verification; create distribution/listings.md as the standing inventory;
  one batch pass over long-tail directories; nudge the pending PRs.
- **awesome-ai-for-economists PR** (MCP section exists, StatCite absent).
- ~~.well-known server card~~, **DO NOT SHIP. Verified 2026-08-08:** SEP-2127
  is an OPEN DRAFT with merge conflicts and a stalled sponsor, it defines no
  `.well-known` MCP path at all (the recommended location is
  `<streamable-http-url>/server-card`; the `.well-known/ai-catalog.json` in the
  document belongs to a different, non-MCP spec), and it carries no schema to
  implement. The normative schema sits in a repo still named "experimental".
  Three competing paths are circulating. Shipping one would squat a path on a
  guess.
- **MCP 2026-07-28 migration**, see the new note below; this is no longer a
  "cheap parts only" item.
- **Credibility rails**: Zenodo DOI for the benchmark question set +
  methodology (nothing embargoed) + Hugging Face dataset mirror; finalize the
  OpenAI Researcher Access application citing the DOI (September window);
  Gemini for Research application if eligible (award would also unblock the
  quota-gated bench leg).
- **Scoped source adds with licence ledger entries first**: BIS policy rates
  + effective exchange rates (https://www.bis.org/terms_statistics.htm); ECB
  policy rates/HICP/EUR reference rates
  (https://www.ecb.europa.eu/services/disclaimer/html/index.en.html); BEA
  (permanent key). BLS only if the operator accepts annual key renewal.
- **Launch prep, all embargo-safe**: leaderboard repo skeleton + /bench page
  shell generated from the same per-run CSV; press-kit draft on the EBU
  model; journalist/newsletter target list; demo GIF (a REAL verification of
  a real public figure); refreshed social copy; vendor notices finalized.
- **Apify 30-day price revisit + monthly bookkeeping sheet** (the manual
  stand-in for the Workers-Paid-gated analytics loop).

## Phase 3: the quarter (compounding bets)

- **The launch cluster, fired once, the day the embargo lifts**: leaderboard
  repo + /bench page with downloadable per-question data → Show HN (numeric
  title, full day in comments) → r/LocalLLaMA (open-weight models in the
  table, disclosed affiliation) → r/mcp + MCP Discord → X thread → press
  pitches on the EBU playbook → re-announce the Connectors Directory listing
  + PulseMCP pitch + dev.to tutorial. Wording scores models, never
  governments.
- **TMLR paper** with textually identical arXiv preprint (preserves TMLR
  eligibility, http://jmlr.org/tmlr/).
- **DPG registration** (open-source software category) and **NLnet NGI Zero
  Commons** (application window 2026-09-03 → 2026-11-03; cite the DOI + DPG).
- **Guarded source expansions** behind named gates, each entering the licence
  ledger first: ILOSTAT (API probe before any code), WHO (per-indicator CC BY
  check, 3-4 headline indicators max), IMF Primary Commodity Prices via
  DBnomics, Eurostat/OECD strictly as triangulation series for verify_stat.
  Monthly-frequency keys only after a transforms audit (yoy/inflation assume
  annual).
- **SIDS programmatic pages pilot** (~76 pages, not 1,000; visible as-of
  dates; quarterly rebuild; expand only if impressions arrive; schema.org
  Dataset JSON-LD on the hubs).
- **Comparison pages** (vs StatGPT, Data Commons, Data360) only if a
  quarterly recheck calendar actually exists; date-stamp every table.
- **Conditional**: statcite-verify GitHub Action (composite bash+curl+jq,
  annotated-claims syntax, no NLP) only if post-launch demand appears;
  citation-object JSON Schema published as documentation (not "spec" until a
  second implementer exists).
- **MCP 2026-07-28 migration (RATIFIED, this is now real work, not a watch
  item).** Verified 2026-08-08: the revision is GA, not a release candidate,
  and it is BREAKING. `initialize` and `notifications/initialized` are gone,
  replaced by a required `server/discover` RPC; `Mcp-Session-Id` is removed
  entirely; `Mcp-Method` (all requests) and `Mcp-Name` (tools/call,
  resources/read, prompts/get) headers are REQUIRED; `ttlMs` and `cacheScope`
  are REQUIRED on complete list results; the MRTR `InputRequiredResult` pattern
  replaces server-initiated requests; and Roots, Sampling and Logging are
  formally deprecated on a twelve-month clock. StatCite currently negotiates
  2025-03-26 / 2025-06-18 / 2025-11-25 and is unaffected until it opts in,   transport code is already isolated in `server/src/mcp.ts` for exactly this.
  Plan it as a versioned dual-support release, not a swap: keep the old
  revisions working while adding the new one, since client uptake will lag.
  Do NOT start it in the same session as unrelated work.
- **Watch only**: Cloudflare Monetization Gateway admission; Stage 1
  monetization triggers via the bookkeeping sheet; whether GitHub's MCP
  registry onboarding becomes self-serve (it was manual as of 2026-05).

## DO-NOT list (killed with evidence; do not re-propose)

- Any Run 2 number before the vendor preview window passes.
- Free-text paste-a-claim demo / NLP claim extraction in the Worker (the
  structured /try page + fact_check prompt are the compliant forms).
- CaribStat / any ECCB or CBB ingestion (terms + unattended-operation).
- The Caribbean fiscal/SOE monitor (operator clearance gate; depends on
  blocked CaribStat).
- FRED in any form (ToU: AI/ML use and redistribution prohibited).
- UN Comtrade even "just the free tier" (for-profit trigger is the
  application itself).
- Custom GPT in the GPT Store (requires a paid plan → fails zero-cost).
- Workers Analytics Engine binding (Workers Paid gate; bookkeeping sheet is
  the stand-in).
- statcite.dev defensive registration (costs money).
- x402/Stripe build-out, Stage 1 keys, or paid bulk tiers now (triggers have
  not fired).
- Eurostat/OECD breadth or any "add all of X" (breadth-first competitor is
  kill-listed; StatGPT exists).
- ~1,000 programmatic pages in one shot (scaled-content-abuse demotion risk
  on a zero-authority domain).
- Full early adoption of the 2026-07-28 spec (days-old churning surface;
  cheap parts only).
- Any sub-24h response-SLA promise (solo unattended operation).
- IDB Lab, Project Galileo, Anthropic Economic Futures now (closed/misfit;
  watch entries at best).
- Paid directory placements.
- Date-exact vintage resolution beyond the shipped as_of design (BRIEF 6.1
  stays rejected).
- Third-party uptime-badge accounts (GitHub-Actions-generated badges only).

## Standing decisions this plan encodes

- llms.txt gets no further investment beyond the onboarding repurpose.
- /v1/status and /v1/health are ONE endpoint, not two.
- The CSV-export free-vs-Pro contradiction (BRIEF 6.8 vs MONETIZATION
  Stage 1) is an open operator decision, do not ship CSV until resolved.
- Every new source enters the licence ledger BEFORE its adapter is written.
