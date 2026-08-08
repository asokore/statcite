# Listings inventory

Every place StatCite is listed, how to update it, and when it was last touched.
`submissions.md` is the how-to-submit runbook; this file is the standing
inventory, so a copy refresh or a version bump is a checklist rather than a
rediscovery exercise.

**Rule:** when a release changes the pitch (new headline tool, new capability),
walk this table top to bottom. When it only changes internals, update the
registry entry and stop.

| # | Surface | URL | Route to update | Auto-syncs? | Last updated |
|---|---|---|---|---|---|
| 1 | Official MCP Registry | `io.github.asokore/statcite` | `cd distribution && ../.tools/mcp-publisher.exe publish` (GitHub device-flow login first) | No — push per release | 2026-07-27 (v1.4.2) — **stale, live server is ahead** |
| 2 | GitHub repo | github.com/asokore/statcite | Push to main | n/a | continuous |
| 3 | Claude Connectors Directory | claude.ai directory (community) | Admin portal → edit listing (editing an unpublished listing sends it back to review) | No | 2026-07-29 (published) |
| 4 | Smithery | smithery.ai/server/asokore-beckles/statcite | Re-scan from repo | Partly | 2026-07-25 |
| 5 | Glama | glama.ai/mcp/servers/asokore/statcite | Auto-scans repo; quality score updates itself | Yes | 2026-07-29 (scored A) |
| 6 | Apify Store | apify.com actor `statcite` | `apify push` **then move the `latest` build tag** (see below) | No | 2026-08-05 (build 1.0.6+) |
| 7 | mcpmarket | mcpmarket.com | Paid listing, edit in dashboard | No | 2026-07-26 |
| 8 | mcp.so | listing id `ea8b3345-51f0-4395-8d31-48cb2fc390b5` | Dashboard edit (their React form drops fast-typed characters — set values via JS native setter) | No | 2026-07-26 (queued review) |
| 9 | PulseMCP | pulsemcp.com | **Auto-ingests from the official MCP registry weekly** — fix #1 and this follows | Yes | auto |
| 10 | Docker MCP Catalog | PR docker/mcp-registry#4538 | PR (open, awaiting Docker review) | No | 2026-07-26 |
| 11 | awesome-mcp-servers | PR #10881 | PR (open, Glama badge added per maintainer precondition) | No | 2026-07-26 |
| 12 | awesome-remote-mcp-servers | PR #527 | PR (open, clean) | No | 2026-07-26 |

## Not yet listed (Phase 2 targets)

| Surface | Route | Blocker |
|---|---|---|
| ChatGPT apps directory | developers.openai.com submission | OpenAI identity verification must be confirmed available to the operator |
| Cursor directory | see submissions runbook | account |
| Cline marketplace | github.com/cline/mcp-marketplace issue | uses `llms-install.md` (now in repo root) |
| Gemini CLI extensions | public repo + `gemini-extension.json` + `gemini-cli-extension` topic | none — buildable |
| awesome-ai-for-economists | PR to README | none — buildable |
| Claude Code plugin marketplace | `.claude-plugin/marketplace.json` in this repo | none — buildable |

## Gotchas that have bitten this project

- **Apify's `latest` tag does not move on push.** After `apify push`, run
  `npx apify-cli builds ls <actorId> --desc --limit 2 --json` and confirm the
  newest build carries `buildTag:"latest"`; if not,
  `npx apify-cli builds add-tag --build <id> --tag latest`. A successful push is
  NOT evidence real callers get the new code (2026-08-05: callers ran a build
  three versions old for days).
- **The MCP registry publish needs a GitHub device-flow login**, and the
  Authorize button only responds to real trusted input — use a coordinate click
  derived from a screenshot taken immediately beforehand, not a JS click.
- **A 200 from `curl` is not proof a listing renders** on SPA-based directories.
  Check in a real browser.
- **mcp.so's form** drops characters when typed quickly; set field values with a
  JS native setter plus an `input` event.
