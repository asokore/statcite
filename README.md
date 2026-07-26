# StatCite

**Economic statistics your AI can actually cite.**

StatCite is a free remote MCP server + REST API serving official economic statistics — World Bank, IMF WEO/Fiscal Monitor (current vintage via the IMF DataMapper API, with DBnomics as a fallback), ECB reference rates, optional FRED — where **every number ships with its full citation**: source, dataset, series ID, canonical URL, license, retrieval date, and a ready-to-paste citation sentence. Plus **`verify_stat`**: check any claimed economic figure against the official series and get a verdict (`match / close / mismatch / cannot_verify`) with diagnostics for the classic errors (wrong year, percent-vs-decimal, millions-vs-billions).

- **Website & docs:** https://statcite.com · [docs](https://statcite.com/docs.html) · [OpenAPI](https://statcite.com/openapi.json) · [llms.txt](https://statcite.com/llms.txt)
- **MCP endpoint:** `https://statcite.com/mcp` (Streamable HTTP, stateless, no auth)
- **REST:** `https://statcite.com/v1/...`

## Quick connect

| Client | How |
|---|---|
| Claude (web/desktop) | Settings → Connectors → Add custom connector → `https://statcite.com/mcp` |
| Claude Code | `claude mcp add --transport http statcite https://statcite.com/mcp` |
| ChatGPT | Developer mode → add MCP server, No Authentication (also implements the deep-research `search`/`fetch` pair) |
| Cursor | `{"mcpServers":{"statcite":{"url":"https://statcite.com/mcp"}}}` |
| VS Code | `{"servers":{"statcite":{"type":"http","url":"https://statcite.com/mcp"}}}` |
| stdio-only | `npx -y mcp-remote@latest https://statcite.com/mcp` |

## Try it in 5 seconds

```bash
curl "https://statcite.com/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.1"
curl "https://statcite.com/v1/indicator/govt_debt_gdp?country=JPN&latest_only=true"
curl "https://statcite.com/v1/fx?amount=100&from=USD&to=BBD"
curl -X POST "https://statcite.com/v1/verify_claims" -H "content-type: application/json" \
  -d '{"claims":[{"indicator":"inflation_cpi","country":"USA","period":"2023","claimed_value":4.1}]}'
```

## Tools

`get_indicator` · `verify_stat` · `verify_claims` · `get_series` · `search_indicators` · `country_snapshot` · `inflation_adjust` · `fx_convert` · `list_sources` · `search` · `fetch` — 42 curated indicators, 200+ economies, ~120 currencies. All read-only. Details: [docs](https://statcite.com/docs.html).

## Repo layout

```
server/        Cloudflare Worker: MCP endpoint + REST API + tests (zero runtime deps)
site/          statcite.com static site (landing, docs, llms.txt, OpenAPI, legal)
apify/         Metered twin: Apify actor (pay-per-event) bundling the same core
skill/         Claude skill teaching agents the verify-then-cite workflow
distribution/  Registry manifests, submission steps, launch copy
docs/          Research report, strategy, launch plan, monetization roadmap
BRIEF.md       Context + mandate for anyone (human or agent) picking this up
HANDOFF.md     Deployment runbook (the mechanical steps to take it live)
CLAUDE.md      Working guide: commands, architecture, invariants
```

## Develop

```bash
cd server
npm install
npm test          # 161 tests, fixture-backed, no network
npm run smoke     # live end-to-end against real upstream APIs
npm run dev       # wrangler dev (local Workers runtime + static site)
npm run deploy    # wrangler deploy
```

## Data & licensing

StatCite does not originate the underlying statistical observations; derived values and verification verdicts are calculated transparently from cited source data with the method disclosed. World Bank (CC BY 4.0); IMF (per IMF terms — attribution + downstream conditions; commercial reuse may require IMF permission); ECB (attribution, informational rates); Eurostat via DBnomics (CC BY 4.0); FRED disabled by default (an operator enabling it must review the current FRED API Terms of Use first — they include restrictions relevant to caching, redistribution, and AI/software use). IMF WEO/Fiscal Monitor projections are labeled as projections. The primary IMF path is the DataMapper API (current edition, verbatim edition label); if unavailable, StatCite falls back to the newest edition DBnomics has ingested, which can lag the IMF's release calendar — responses cite the resolved vintage, flag stale ones, and every fallback is disclosed (verify_stat/verify_claims return cannot_verify with the fallback value as indicative when the primary failed transiently, rather than judging against a substitute that may differ by definition or vintage; a series the primary permanently lacks is judged against its stable fallback source with disclosure). Server code: MIT.

Built and curated by a professional economist. Contact: hello@statcite.com
