# CLAUDE.md — StatCite project guide

**New to this project? Read `BRIEF.md` first.** It carries the owner's actual goal, the reasoning behind every choice here, what I'd challenge about my own work, ideas considered but not built, and explicit authority to change or replace any of it. This file is the operating manual; BRIEF.md is the mandate.

**Also read `docs/VENTURE-CONTEXT.md` if present** (imported 2026-07-26; **local-only by design — gitignored, never commit it**). It carries owner-sensitive strategic context this repo was built without, including a proposed repricing that contradicts `docs/MONETIZATION.md`. If it is absent (fresh clone), ask the owner rather than proceeding without it; the public-safe competitive facts from it live in `docs/RESEARCH.md` §4a.

StatCite is a free remote MCP server + REST API serving official economic statistics where every number carries a full citation, plus a `verify_stat` claim-checker and its batch form `verify_claims`. Monorepo: Cloudflare Worker (`server/`), static site (`site/`), Apify pay-per-event actor twin (`apify/`), Claude skill (`skill/`), distribution kit (`distribution/`), strategy docs (`docs/`).

**If the task is "take this live" or "deploy": follow `HANDOFF.md` step by step** — but read `BRIEF.md` §4 and §9 first and decide whether shipping as-is is actually the right move. Growth sequence: `docs/LAUNCH.md`.

## Commands (run in `server/`)

- `npm install` — dev deps only (typescript, tsx, workers-types; wrangler on demand via npx)
- `npm test` — 174 fixture-backed tests (no network)
- `npm run smoke` — live end-to-end against real upstream APIs (network)
- `npm run typecheck` · `npm run dev` (wrangler dev) · `npm run deploy`
- `npm run fixtures` — re-record upstream fixtures if a source changes shape

## Architecture (server/src)

- `index.ts` — router: `/mcp` → mcp.ts, `/v1/*` → rest.ts, `/health`, else static assets
- `mcp.ts` — **stateless MCP Streamable HTTP, hand-rolled, zero deps.** Protocol 2025-03-26/06-18/11-25: single JSON-RPC message or a batch accepted per POST for 2025-03-26 clients (empty batch → -32600), JSON responses (no SSE), no session id, notifications → 202, GET/DELETE → 405, lenient Accept, CORS on. All transport logic lives here on purpose — the 2026-07-28 revision candidate (removes initialize/sessions, not yet ratified) lands as a change to this file only when it ships.
- `tools.ts` — 11 tool definitions + dispatch (incl. `verify_claims`, the batch wrapper over the `verify_stat` core: 1–15 claims, per-claim error isolation, verdict-count summary). Tool failures return `isError: true` results (never protocol errors). `search`/`fetch` follow OpenAI's deep-research connector schema exactly (outputSchema declared).
- `rest.ts` — GET mirror of the tools; 422 for helpful failures with suggestions. One non-GET route: `POST /v1/verify_claims` (JSON body `{ claims: [...] }`; GET on it → 405 advice, non-JSON content-type → 415).
- `core/analytics.ts` — aggregate usage recording (Workers Analytics Engine binding `STATCITE_USAGE` + a `STATCITE_USAGE {json}` log line). Called from `tools.ts` (`callTool`) and `rest.ts` only. **How to read the data: `docs/LAUNCH.md` → "Reading usage analytics".**
- `core/` — pure logic, no Workers APIs: `series.ts` (indicator orchestration + source fallback), `verify.ts` (verdicts + diagnostics), `inflation.ts`, `fx.ts` (ECB daily + WB annual USD-bridge), `snapshot.ts`, `indicators.ts` (42-key curated registry, 36 active — 6 FRED-reserved keys permanently decline), `countries.ts` (ISO resolver), `citations.ts` (per-source citation builders), `transforms.ts`, `upstream.ts` (memory+edge cache, timeout, retry).
- `adapters/` — worldbank (v2 JSON envelope), datamapper (IMF DataMapper API — current-vintage WEO/Fiscal Monitor; primary for the 6 IMF-backed registry keys), dbnomics (v22; dated WEO vintages — now the fallback behind datamapper, and the reproducibility instrument for a pinned vintage), frankfurter (`api.frankfurter.dev`), fred (optional `FRED_API_KEY` secret).
- `core-entry.ts` — bundle entry for the Apify actor (`apify/npm run build:core` → `core.bundle.mjs`, committed).

## Invariants — do not break

1. **Every numeric payload includes a citation object** (`core/citations.ts`); its field names are public API.
2. **Citations carry the source-required attribution** (WB attribution string; FRED disclaimer notice; "Source: International Monetary Fund"). This is licensing compliance, not decoration.
3. **IMF WEO/Fiscal Monitor forward-year values are labeled** as projections (per-observation `note` + series note); `latest_only` prefers the latest value not marked as a projection — and its note must never call that value an "outturn", since pre-boundary IMF values may be staff estimates (verify results expose this as `observation_status: estimate_or_actual`). The DataMapper-path boundary is payload-anchored (data horizon − 5), not derived from the edition label — don't recouple it, that's what let cache skew corrupt it before.
4. **Errors are advice**: unknown country → suggestions; missing year → available range. Keep it that way.
5. **Zero runtime dependencies** in the Worker; CPU budget is 10ms/invocation (free plan). No KV writes on request paths.
6. Registry keys (`indicators.ts`) are stable once published — add, don't rename.
6b. **Analytics is aggregate-only and best-effort**: never record IP, user agent, headers, free-text queries or claimed values (`site/privacy.html` promises no profiling); every recorded string comes from a closed set; `recordUsage()` must never throw into the response path. Analytics Engine blob positions are a schema — append, never reorder.
7. If you change `core/`, run `npm test && npm run smoke`, and rebuild the actor bundle (`cd ../apify && npm run build:core`), and regenerate the docs registry table if keys changed (table in `site/docs.html` + list in `site/llms-full.txt` + `skill/statcite/SKILL.md` + repackage `skill/statcite.skill`).

Domain is `statcite.com` throughout (BASE_URL var in `wrangler.jsonc`). The `GITHUB_USERNAME` placeholder mentioned in older docs is already resolved to `asokore` in `server/package.json` (mcpName) and `distribution/server.json` — nothing left to do there.
