# CLAUDE.md — StatCite project guide

**New to this project? Read `BRIEF.md` first.** It carries the owner's actual goal, the reasoning behind every choice here, what I'd challenge about my own work, ideas considered but not built, and explicit authority to change or replace any of it. This file is the operating manual; BRIEF.md is the mandate.

StatCite is a free remote MCP server + REST API serving official economic statistics where every number carries a full citation, plus a `verify_stat` claim-checker. Monorepo: Cloudflare Worker (`server/`), static site (`site/`), Apify pay-per-event actor twin (`apify/`), Claude skill (`skill/`), distribution kit (`distribution/`), strategy docs (`docs/`).

**If the task is "take this live" or "deploy": follow `HANDOFF.md` step by step** — but read `BRIEF.md` §4 and §9 first and decide whether shipping as-is is actually the right move. Growth sequence: `docs/LAUNCH.md`.

## Commands (run in `server/`)

- `npm install` — dev deps only (typescript, tsx, workers-types; wrangler on demand via npx)
- `npm test` — 50 fixture-backed tests (no network)
- `npm run smoke` — live end-to-end against real upstream APIs (network)
- `npm run typecheck` · `npm run dev` (wrangler dev) · `npm run deploy`
- `npm run fixtures` — re-record upstream fixtures if a source changes shape

## Architecture (server/src)

- `index.ts` — router: `/mcp` → mcp.ts, `/v1/*` → rest.ts, `/health`, else static assets
- `mcp.ts` — **stateless MCP Streamable HTTP, hand-rolled, zero deps.** Protocol 2025-03-26/06-18/11-25: single JSON-RPC message or a batch accepted per POST for 2025-03-26 clients (empty batch → -32600), JSON responses (no SSE), no session id, notifications → 202, GET/DELETE → 405, lenient Accept, CORS on. All transport logic lives here on purpose — the 2026-07-28 revision candidate (removes initialize/sessions, not yet ratified) lands as a change to this file only when it ships.
- `tools.ts` — 10 tool definitions + dispatch. Tool failures return `isError: true` results (never protocol errors). `search`/`fetch` follow OpenAI's deep-research connector schema exactly (outputSchema declared).
- `rest.ts` — GET mirror of the tools; 422 for helpful failures with suggestions.
- `core/analytics.ts` — aggregate usage recording (Workers Analytics Engine binding `STATCITE_USAGE` + a `STATCITE_USAGE {json}` log line). Called from `tools.ts` (`callTool`) and `rest.ts` only. **How to read the data: `docs/LAUNCH.md` → "Reading usage analytics".**
- `core/` — pure logic, no Workers APIs: `series.ts` (indicator orchestration + source fallback), `verify.ts` (verdicts + diagnostics), `inflation.ts`, `fx.ts` (ECB daily + WB annual USD-bridge), `snapshot.ts`, `indicators.ts` (42-key curated registry), `countries.ts` (ISO resolver), `citations.ts` (per-source citation builders), `transforms.ts`, `upstream.ts` (memory+edge cache, timeout, retry).
- `adapters/` — worldbank (v2 JSON envelope), dbnomics (v22; WEO vintages), frankfurter (`api.frankfurter.dev`), fred (optional `FRED_API_KEY` secret).
- `core-entry.ts` — bundle entry for the Apify actor (`apify/npm run build:core` → `core.bundle.mjs`, committed).

## Invariants — do not break

1. **Every numeric payload includes a citation object** (`core/citations.ts`); its field names are public API.
2. **Citations carry the source-required attribution** (WB attribution string; FRED disclaimer notice; "Source: International Monetary Fund"). This is licensing compliance, not decoration.
3. **IMF WEO forward-year values are labeled** as projections (per-observation `note` + series note); `latest_only` prefers outturns.
4. **Errors are advice**: unknown country → suggestions; missing year → available range. Keep it that way.
5. **Zero runtime dependencies** in the Worker; CPU budget is 10ms/invocation (free plan). No KV writes on request paths.
6. Registry keys (`indicators.ts`) are stable once published — add, don't rename.
6b. **Analytics is aggregate-only and best-effort**: never record IP, user agent, headers, free-text queries or claimed values (`site/privacy.html` promises no profiling); every recorded string comes from a closed set; `recordUsage()` must never throw into the response path. Analytics Engine blob positions are a schema — append, never reorder.
7. If you change `core/`, run `npm test && npm run smoke`, and rebuild the actor bundle (`cd ../apify && npm run build:core`), and regenerate the docs registry table if keys changed (table in `site/docs.html` + list in `site/llms-full.txt` + `skill/statcite/SKILL.md` + repackage `skill/statcite.skill`).

## Placeholders to resolve at deploy

`GITHUB_USERNAME` in `server/package.json` (mcpName) and `distribution/server.json`. Domain is `statcite.com` throughout (BASE_URL var in `wrangler.jsonc`).
