# StatCite

**Economic statistics your AI can actually cite — and a verifier that catches the ones it invents.**

[![CI](https://github.com/asokore/statcite/actions/workflows/ci.yml/badge.svg)](https://github.com/asokore/statcite/actions/workflows/ci.yml) · [Live status](https://statcite.com/v1/status) · [AI accuracy benchmark](https://statcite.com/bench.html) · [Licence ledger](https://statcite.com/sources.html)

Free remote MCP server + REST API serving official economic statistics — World Bank, IMF WEO/Fiscal Monitor (current vintage via the IMF DataMapper API, DBnomics fallback), ECB reference rates — where **every number ships with its full citation**: source, dataset, series ID, canonical URL, licence, retrieval date, a ready-to-paste citation sentence, and BibTeX/APA export formats.

The differentiator is **verification, not lookup**: `verify_stat` checks a claimed figure against the official series and returns `match / close / mismatch / cannot_verify` with diagnostics for the classic errors (wrong year, percent-vs-decimal, millions-vs-billions, sign flips) — and on a mismatch it re-judges the claim against the previous IMF vintage, so "was right when written, since revised" is never confused with "wrong". When the source cannot support a verdict, it says `cannot_verify` with the reason. It never guesses.

**Three things people use it for**

1. **Fact-check a draft** — the `fact_check` MCP prompt + `verify_claims` audit every macro figure in a document, in batches of 15, each verdict carrying the citation for the correct number.
2. **Cited data for agent reports** — `get_indicator` / `country_snapshot` return official series with paste-ready citations, honest projection labelling, and machine-readable "no published value exists" instead of silent gaps.
3. **Resolve source disagreements** — `compare_sources` fetches one indicator from every official source in its chain and shows the spread (e.g. general-vs-central government debt definitions), each value with its own citation.

## Install in one line

| Client | How |
|---|---|
| Claude (web/desktop) | Settings → Connectors → Add custom connector → `https://statcite.com/mcp` |
| Claude Code | `claude mcp add --transport http statcite https://statcite.com/mcp` |
| Cursor | [**Install in Cursor**](cursor://anysphere.cursor-deeplink/mcp/install?name=statcite&config=eyJ1cmwiOiJodHRwczovL3N0YXRjaXRlLmNvbS9tY3AifQ==) (deeplink) or `{"mcpServers":{"statcite":{"url":"https://statcite.com/mcp"}}}` |
| VS Code | `code --add-mcp '{"name":"statcite","type":"http","url":"https://statcite.com/mcp"}'` or `{"servers":{"statcite":{"type":"http","url":"https://statcite.com/mcp"}}}` |
| ChatGPT | Developer mode → add MCP server, No Authentication (implements the deep-research `search`/`fetch` pair) |
| Cline / stdio-only | `npx -y mcp-remote@latest https://statcite.com/mcp` (see [llms-install.md](llms-install.md)) |

No signup, no API key, no OAuth.

## Try it in 5 seconds

```bash
curl "https://statcite.com/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.1"
curl "https://statcite.com/v1/indicator/govt_debt_gdp?country=JPN&latest_only=true"
curl "https://statcite.com/v1/fx?amount=100&from=USD&to=BBD"
curl -X POST "https://statcite.com/v1/verify_claims" -H "content-type: application/json" \
  -d '{"claims":[{"indicator":"inflation_cpi","country":"USA","period":"2023","claimed_value":4.1}]}'
```

## Tools

`get_indicator` · `verify_stat` · `verify_claims` · `compare_sources` · `get_series` · `search_indicators` · `country_snapshot` · `inflation_adjust` · `fx_convert` · `list_sources` · `search` · `fetch` — plus 3 MCP prompts (`fact_check`, `country_brief`, `cite_this_stat`) and 3 resources (registry, licence ledger, SIDS list). 42 active curated indicators, 200+ economies, ~120 currencies. All read-only. Details: [docs](https://statcite.com/docs.html).

## Repo layout

```
server/        Cloudflare Worker: MCP endpoint + REST API + tests (zero runtime deps)
site/          statcite.com static site (landing, docs, llms.txt, OpenAPI, legal)
apify/         Metered twin: Apify actor (pay-per-event) bundling the same core
skill/         Claude skill teaching agents the verify-then-cite workflow
distribution/  Registry manifests, submission steps, launch copy
bench/         pre-registered AI-accuracy benchmark: COVENANT.md, METHODOLOGY.md, question bank, frozen snapshots, runs/ (R1 REPORT + ADDENDA)
docs/          Research report, strategy, launch plan, monetization roadmap
BRIEF.md       Context + mandate for anyone (human or agent) picking this up
HANDOFF.md     Deployment runbook (the mechanical steps to take it live)
CLAUDE.md      Working guide: commands, architecture, invariants
```

## Develop

```bash
cd server
npm install
npm test          # fixture-backed, no network
npm run smoke     # live end-to-end against real upstream APIs
npm run dev       # wrangler dev (local Workers runtime + static site)
npm run deploy    # wrangler deploy
```

## Data & licensing

StatCite does not originate the underlying statistical observations; derived values and verification verdicts are calculated transparently from cited source data with the method disclosed. World Bank (CC BY 4.0); IMF (published IMF statistical data may be copied, redistributed and used in derivative works with attribution as "Source: International Monetary Fund, \<database\>, \<link\>" — plus data-integrity, downstream-communication and free-of-charge-disclosure conditions, all carried verbatim in every citation's `license` field); BIS (reproduction and redistribution with attribution); ECB (attribution; reference rates informational); Eurostat via DBnomics (CC BY 4.0); FRED permanently disabled — its Services Terms of Use (clauses (p) and (q), https://fred.stlouisfed.org/legal/) prohibit AI/ML use and caching/redistribution of its content, which conflicts with how this service serves data. IMF WEO/Fiscal Monitor projections are labeled as projections. The primary IMF path is the DataMapper API (current edition, verbatim edition label); if unavailable, StatCite falls back to the newest edition DBnomics has ingested, which can lag the IMF's release calendar — responses cite the resolved vintage, flag stale ones, and every fallback is disclosed (verify_stat/verify_claims return cannot_verify with the fallback value as indicative when the primary failed transiently, rather than judging against a substitute that may differ by definition or vintage; a series the primary permanently lacks is judged against its stable fallback source with disclosure). Server code: MIT.

Built and curated by a professional economist. Contact: hello@statcite.com
