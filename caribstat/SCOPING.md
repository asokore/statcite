# CaribStat: Scoping Document

Date: 2026-07-26. Status: **blocked on source permission** (see Section 2.3). Recon and architecture are done and stand ready; Phases 1 and 3 (ingestion) do not proceed until either ECCB or CBB grants reuse permission, or the owner decides to park this vertical.

CaribStat is a Caribbean and small-states data vertical. It ingests official statistics from regional central banks on a schedule, stores them as dated, citable series snapshots, and serves them to AI agents and analysts through the existing StatCite platform (statcite.com, MCP + REST). First slice: ECCB (8 ECCU territories plus the ECCU aggregate) and the Central Bank of Barbados.

## 1. Why this exists

No aggregator carries this data. Verified live on 2026-07-26: DBnomics lists 93 providers and none of them is the ECCB or the Central Bank of Barbados. World Bank WDI covers these economies only at annual frequency with long lags. IMF WEO is annual and mostly projections at the recent edge. The monthly and quarterly monetary, fiscal, tourism and banking data for the Eastern Caribbean exists only on the publishing banks' own websites, in formats no agent can consume. The Caribbean Tourism Organization sells static PDF compilations at USD 495 per issue.

StatCite already has distribution (MCP registry, directories, live agent traffic surface) and a citation-first contract. CaribStat supplies the series nobody else serves, through the pipe that already exists.

## 2. Source recon: verified live, 2026-07-26

### 2.1 ECCB (eccb-centralbank.org): GRADE: A, build first

- **What exists:** a statistics portal with server-rendered HTML data tables on stable GET URLs, pattern `/statistics-category/{category}/{table}/{a|q|m}` (annual/quarterly/monthly). A dashboard, an interactive database, CSV and Excel download buttons, and metadata documents.
- **Table inventory (from live nav):** Monetary and Financial Statistics: Summarized Monetary Survey, ECCB Statement of Assets and Liabilities, Selected Commercial Bank's Assets and Liabilities, Deposits, Loans, Interbank Transactions, Other Assets, Other Liabilities, Interest Rates, Financial Soundness Indicators. Economic Statistics: External Sector (incl. Selected Tourism Statistics), National Accounts, Other Real Sector (incl. Consumer Price Index), Public Sector Debt, Central Government Fiscal Accounts. Plus a Regional Government Securities Market section and a separate Debt Portal.
- **Geographies:** country selector with 9 codes: 8 member territories (Anguilla, Antigua and Barbuda, Dominica, Grenada, Montserrat, St Kitts and Nevis, Saint Lucia, St Vincent and the Grenadines) plus the ECCU aggregate.
- **Frequencies:** M / Q / A selectable per table (confirmed in the form markup of the Summarized Monetary Survey).
- **Provenance:** every table page carries a "Data as at DD Month YYYY" line (seen live: "Data as at 09 July 2026"). This maps directly onto StatCite's citation contract.
- **Access mechanics, tested:**
  - Default `curl` gets HTTP 403. The same URL with a normal browser User-Agent header returns HTTP 200 with the full data table. Tested live. Plain scripted ingestion works with one header. No headless browser needed.
  - The default GET renders the ECCU aggregate, annual, latest 5 periods. Country / frequency / period variants are a Laravel POST (CSRF `_token` in the page, cookie session). Automatable: GET page, parse token and cookie, POST the filter. Two requests per variant.
  - CSV/Excel download buttons are JS-driven POSTs with Laravel-encrypted parameters. Not worth automating: the rendered HTML table itself is the cleaner extraction target.
- **Update cadence:** monthly tables observed current to within weeks. Exact per-table cadence to be catalogued in Phase 1.

### 2.2 Central Bank of Barbados (centralbank.org.bb): GRADE: B, build second

- **What exists:** CBBWEBSTATS (launched 2019), pre-formatted Excel tables integrated into the main site, in categories: Deposit Taking Financial System, Tourism, Trade in Goods, Interest Rates and Exchange Rates, GDP/Inflation/Labour and Other General Statistics, Balance of Payments. Query contact: statistics@centralbank.org.bb.
- **Access mechanics, tested:**
  - The old dedicated portal `data.centralbank.org.bb` is DEAD (DNS does not resolve). Search engines still index it, including its old Terms of Use page. Do not cite it.
  - Category listing pages are Laravel and render their item lists client-side via `POST /news/fetchdata` with an X-CSRF-TOKEN header. The static HTML contains no data links. Automation requires the same GET-token-cookie-POST handshake as ECCB, plus parsing the returned listing HTML for item pages, then extracting the Excel/CDN attachment from each item.
  - Once discovered, actual files sit on `cdn.centralbank.org.bb/documents/{timestamp}-{name}` and download with a plain GET, no auth.
  - Main site responds HTTP 200 to curl with a browser UA. No hard bot wall observed.
- **Format:** Excel workbooks per table (their own description). Parsing is xlsx, not HTML. More per-table schema work than ECCB.
- **Grade B because:** two-step discovery (AJAX listing then CDN file), xlsx parsing per table, and the front end demonstrably mid-migration (dead subdomain, listing shell that can hang on "Loading..."). Nothing blocking, just more brittle.

### 2.3 Licensing and terms: GATE CLOSED, 2026-07-26: blocks ingestion as scoped

Both banks' current terms were read live in a browser on 2026-07-26. **Neither permits what CaribStat set out to do.** This is the same class of finding as the FRED terms conflict that forced StatCite v1.3.2 (FRED permanently disabled), caught before any code was written, not after.

**ECCB**, `https://www.eccb-centralbank.org/disclaimer-policy`, read in full:

> "The ECCB grants permission to visit its website and to download and copy information, documents, and materials from the site for **personal, noncommercial usage only, without any right to resell or redistribute or to compile or create derivative works**, subject to these Terms and Conditions of Usage. Any rights not expressly granted herein are reserved."

This is an explicit, unambiguous prohibition on exactly what an ingestion-and-API-serving pipeline does: it redistributes (serves the values to third parties through an API) and creates derivative works (transforms, snapshots, cross-referencing against claims). It does not matter that StatCite's base tier is free, "noncommercial" is about the nature of the use (redistribution to any user, indefinitely, at scale), not whether money changes hands on day one, and the roadmap explicitly includes a future paid bulk-export tier regardless.

**CBB**. Checked the full footer and site nav; there is no dedicated terms-of-use or data-reuse page at all (only a GDPR-style Data Privacy Notice covering personal data, dated 11 June 2026, and a bare footer line: "Copyright © 2026 Central Bank of Barbados. All Rights Reserved."). No explicit permission is granted anywhere. Under default copyright, "all rights reserved" with no reuse grant means no reuse is authorized without asking. Softer than ECCB's explicit prohibition (there's no written "no redistribution" clause to violate), but still not a green light.

**Conclusion: do not build Phase 1 or Phase 3 as scoped.** Both would ingest and redistribute copyrighted material from sources that have either explicitly forbidden it (ECCB) or granted no permission at all (CBB). This is not a judgment call to route around technically (e.g. "we're not literally reselling it"). The ECCB clause names "redistribute" and "compile" directly, which is the pipeline described in Section 3 word for word.

**What actually unblocks this, in order of preference:**
1. **Ask.** Email both banks (ECCB: info@eccb-centralbank.org; CBB: statistics@centralbank.org.bb, the contact CBBWEBSTATS itself publishes) explaining StatCite, the citation-first model, and asking for permission to ingest and serve their published statistics with full attribution and a link back to the source page on every value. Regional central banks publish this data specifically to be used and cited; a citation-forward, non-scraping-for-resale pitch is a reasonable ask. This is slow (days to weeks, maybe no reply) and not guaranteed, but it is the only path to the vertical as designed.
2. **Reframe as a pointer, not a redistributor.** A narrower tool that tells an agent "here is the exact ECCB/CBB table and URL for this claim, go read it yourself" rather than serving the number itself, calling live per request with no caching or storage, might sit closer to fair-use citation than redistribution. But StatCite's whole value proposition is serving the number with a citation, not sending the agent away, so this guts the product. Worth a lawyer's read, not an engineer's guess, before relying on it.
3. **Park it.** Treat this the way the do-not-build list treats other evidence-blocked ideas: a good idea, blocked on a real-world permission step that is the owner's to pursue, not something to build around.

No code has been written against either source. Nothing to unwind.

## 3. Architecture

Two repos, one serving surface.

```
caribstat (this repo)                          statcite (existing, live)
┌──────────────────────────────┐               ┌──────────────────────────┐
│ scheduled ingestion           │               │ Cloudflare Worker         │
│ (GitHub Actions cron)         │               │ MCP + REST, zero deps     │
│                               │    static     │                           │
│ fetchers (UA header, CSRF     │    JSON       │ new adapter:              │
│  handshake where needed)      │──published──▶ │  caribstat/{SERIES}       │
│ parsers (HTML table / xlsx)   │    origin     │  fetchJson + edge cache   │
│ validators (shape sentinels)  │               │  citation objects         │
│ snapshots (append-only,       │               │                           │
│  dated vintages from day one) │               │                           │
└──────────────────────────────┘               └──────────────────────────┘
```

Decisions and reasoning:

1. **Ingestion lives here, serving stays in StatCite.** Scheduled fetching and xlsx parsing cannot live in a zero-dependency 10 ms Worker, and should not. The Worker treats CaribStat's published JSON exactly like it treats the World Bank API: an upstream it fetches and edge-caches. StatCite stays zero-dep; the two repos deploy independently; a broken scrape never breaks statcite.com.
2. **Publish target: static JSON at a stable public origin.** Simplest viable: GitHub Pages on this repo (or raw.githubusercontent as fallback). Zero infra cost, versioned by git, cache-friendly. Each series file carries `source`, `source_url`, `data_as_at` (the bank's own stamp), `retrieved_at`, `frequency`, `unit`, `country`, and observations.
3. **Dated vintages from day one.** Every ingest writes an immutable snapshot alongside the mutable "latest" file (append-only, in git). This is cheap now and impossible to retrofit. It gives CaribStat the same revision-aware verification capability (`as_of`) that just shipped for IMF data in StatCite v1.4.0. For series where no other vintage archive exists anywhere.
4. **Sentinels, learned the hard way.** Every fetcher gets a shape sentinel (expected row labels present, plausible value ranges, "Data as at" parseable and advancing) and the pipeline distinguishes "source moved/changed" from "no new data". A silent scrape death must surface as a loud pipeline status, not stale data served as fresh. Sentinels assert on the field the consumer reads, and a status report lives inside the pipeline it reports on.
5. **StatCite integration surface:** new explicit series ids (`caribstat/ECCB/{table}/{country}.{frequency}`, `caribstat/CBB/{table}`), a `list_sources` entry with the banks' attribution lines, and later, registry keys where a cross-country concept genuinely maps (tourism arrivals is the obvious first). Verification (`verify_stat`) works automatically once series resolve.

## 4. Phasing

- **Phase 0 (gate):** read ECCB and CBB terms in a browser, record findings here. Decide repo visibility (public repo enables free Pages; owner has GitHub Pro so private repo with Pages is also possible).
- **Phase 1. ECCB core (build first, ~1-2 sessions):** fetch + parse the 6 highest-value tables (Summarized Monetary Survey, CPI, Selected Tourism Statistics, Central Government Fiscal Accounts, Public Sector Debt, Interest Rates) for all 9 geographies at their native frequencies. Snapshots + sentinels + Pages publish. Fixture-backed tests per parser.
- **Phase 2. StatCite adapter (~1 session):** `caribstat/` series ids, citations with the banks' attribution and both `data_as_at` and `retrieved_at`, docs + llms-full.txt + registry table updates, live smoke.
- **Phase 3. CBB (~1-2 sessions):** fetchdata handshake, item discovery, xlsx parsers for Deposit Taking Financial System, Tourism, Interest and Exchange Rates, GDP/Inflation/Labour. Same snapshot/sentinel discipline.
- **Phase 4. Later:** more jurisdictions (Bank of Jamaica, Central Bank of Trinidad and Tobago, Bank of Guyana all publish Excel/portal statistics), cross-country harmonised registry keys, bulk export as the first paid surface (per the monetisation plan: lookups free, bulk/volume paid).

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Bank site redesign breaks parsers | High, will happen eventually | Sentinels fail loud; fixtures pin current shape; snapshots preserve history through outages |
| Terms forbid redistribution | Low but real | Phase 0 gate; FRED precedent shows we do rip sources out when terms say so |
| CBB front-end brittleness | Medium | Pin CDN file URLs once discovered; re-discover monthly; ECCB alone still ships value |
| UA-based blocking tightens | Low | Respectful cadence (weekly/monthly per table, matching publication rhythm), identifiable UA string with contact email, talk to the banks |
| Scope creep into a Bloomberg-lite terminal | Strategic | Explicitly out of scope; this is a data layer behind StatCite, not a product UI |

## 6. What this is not

No non-public data from any source, and no government-internal material of any kind. No policy commentary and no scoring of any country's performance; this serves published numbers with citations, nothing else. Repo docs stay in this abstract voice.
