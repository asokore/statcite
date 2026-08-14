# Distribution submissions: exact steps

Work through these top-to-bottom after deployment (they're ordered by impact per hour).
Prerequisites: server live at https://statcite.com/mcp, repo pushed to GitHub, `GITHUB_USERNAME` placeholders replaced everywhere.

## 1. Official MCP Registry (registry.modelcontextprotocol.io): ~1 hour

The one publish that cascades everywhere (GitHub MCP Registry eligibility, VS Code, Glama/PulseMCP crawlers).

```bash
# Install the publisher CLI (see current instructions: https://modelcontextprotocol.io/registry/about)
brew install mcp-publisher   # or download the release binary on Windows
cd statcite
mcp-publisher init            # generates server.json — merge with distribution/server.json
mcp-publisher login github    # verifies the io.github.<username> namespace
mcp-publisher publish
```

Notes:
- The `mcpName` field in `server/package.json` must match the registry name (`io.github.<username>/statcite`).
- Registry is metadata-only; it points at the remote URL. No human review.
- Verify listing: `https://registry.modelcontextprotocol.io/v0.1/servers?search=statcite`

## 2. GitHub repo hygiene: ~1 hour

The README is the listing that Glama/PulseMCP/mcp.so crawl, and "statcite mcp" Google searches land here.

- Repo topics: `mcp`, `mcp-server`, `economics`, `economic-data`, `fact-checking`, `citations`, `ai-agents`, `world-bank`, `imf`
- README top: one-line description, MCP URL, quick-connect snippets per client (copy from site/index.html tabs), demo GIF (record a Claude session using verify_stat)
- Add the VS Code one-click install link and Cursor deeplink (current formats: https://code.visualstudio.com/api/extension-guides/ai/mcp and https://cursor.com/docs/context/mcp)

## 3. Anthropic Claude Connectors Directory: ✅ PUBLISHED 2026-07-29

Submitted via a Team org and **approved as a community connector** (auto-approval
email, `[auto:approved]`), then published from
`claude.ai/admin-settings/directory/submissions/statcite`. Admin state verified
by screenshot: Published / health "Collecting…".

CAVEAT retained from the original verification: the public page
`claude.ai/directory/connectors/statcite` redirected to the Claude home rather
than rendering a listing at publish time. A bare `curl` returns 200 on that URL
even when nothing renders (SPA shell), so status code is NOT evidence the
listing is publicly visible. Re-check in a real browser before claiming it is.

Note for future edits: the portal warns that editing a listing before publishing
sends it back to review. Publish first, edit after.

## 4. Smithery: ~30 min

```bash
npx -y @smithery/cli login    # or use the web UI at https://smithery.ai
# Publish as URL-based remote server pointing at https://statcite.com/mcp
```
Smithery shows per-server usage counts, watch them as a distribution KPI.

## 5. Glama: ~15 min

Glama auto-indexes GitHub. After the repo is public: claim the listing at https://glama.ai/mcp (sign in with GitHub → claim). Optionally add a `glama.json` per their docs for the "claimed" badge.

## 6. Docker MCP Catalog: ~2 hours (optional, enterprise trust signal)

PR to https://github.com/docker/mcp-registry per CONTRIBUTING.md. For a remote server, submit as a "remote" entry pointing at the URL (no image needed).

## 7. Community directories: ~15 min each

- PulseMCP: auto-crawls; use the Submit button at https://www.pulsemcp.com if not indexed within a week. Pitch the newsletter (they feature interesting new servers).
- mcp.so: Submit button / GitHub issue.
- mcpmarket.com: https://mcpmarket.com/submit
- awesome-mcp-servers: PR to https://github.com/punkpeye/awesome-mcp-servers under Finance (follow CONTRIBUTING format; feeds Glama).
- awesome-remote-mcp-servers: PR to https://github.com/JAW9C/awesome-remote-mcp-servers

## 8. OpenAI ChatGPT Apps directory: days–weeks (optional; larger lift, now heavier)

The server implements the `search`/`fetch` pair (no longer strictly required by OpenAI for connected servers as of ~2026-07, see the dated note in docs/RESEARCH.md, but still the interface used by deep research and company knowledge), so it works today as a custom connector in ChatGPT developer mode. As of the 2026-07-09 restructure, OpenAI merged the Apps directory and plugin listings into a single **unified Plugin Directory**, and submission now additionally requires:
- A verification endpoint at `/.well-known/openai-apps-challenge` that returns a token OpenAI supplies at submission time. **The Worker has no such route yet**. TODO: add a route in `server/src/index.ts` when this step is actually attempted; it needs the challenge token from the OpenAI dashboard first, so it can't be pre-built speculatively.
- Explicit `readOnlyHint` / `openWorldHint` / `destructiveHint` annotations on every tool (some of this already exists per `tools.ts`; audit all 10 before submitting).
- 5 positive + 3 negative test cases documented per tool.

Verify identity in the OpenAI Platform Dashboard → submit per https://developers.openai.com/apps-sdk/app-submission-guidelines. Still a larger, later lift. Consider only after initial traction (review favors polished apps) and after the challenge-endpoint TODO above is closed.

## 9. Apify Store: ~1–2 hours (the monetized channel)

```bash
npm i -g apify-cli
apify login
cd apify
npm run build:core          # refresh core.bundle.mjs if server code changed
apify push
```
Then in Apify Console:
- Actor → Publication → publish to Store with the copy from apify/README.md
- Monetization → Pay per event → create two events: `statcite-lookup` (suggested: $1–2 per 1,000 queries) and `statcite-verify` (suggested: $0.01–0.02 per query, the differentiated wedge, priced higher); see docs/MONETIZATION.md
- The actor automatically becomes callable by AI agents through mcp.apify.com.

## 10. Claude Code / Cowork plugin (later)

Bundle the MCP connector + the statcite skill as a plugin; submit at https://clau.de/plugin-directory-submission. Do this after the connector directory listing lands.

## Tracking

Create a simple checklist issue in the GitHub repo with one checkbox per channel above; note submission dates and outcomes. Registries to watch weekly: Smithery uses count, GitHub stars/traffic, Cloudflare analytics requests/day.
