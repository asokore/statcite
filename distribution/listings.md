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
| 1 | Official MCP Registry | `io.github.asokore/statcite` | `cd distribution && ../.tools/mcp-publisher.exe login github` then `../.tools/mcp-publisher.exe publish` | No. Push per release | 2026-08-08 (v1.8.1); 2026-08-10 (v1.10.0 published, isLatest confirmed via API). NOTE: the registry JWT expires in well under an hour. Run `login github` immediately before `publish`, never earlier in the session |
| 2 | GitHub repo | github.com/asokore/statcite | Push to main | n/a | continuous |
| 3 | Claude Connectors Directory | claude.ai directory (community) | Admin portal → edit listing (editing an unpublished listing sends it back to review) | No | 2026-07-29 (published) |
| 4 | Smithery | smithery.ai/server/asokore-beckles/statcite | Re-scan from repo | Partly | 2026-07-25 |
| 5 | Glama | glama.ai/mcp/servers/asokore/statcite | Auto-scans repo; quality score updates itself | Yes | 2026-07-29 (scored A) |
| 6 | Apify Store | apify.com actor `statcite` | `apify push` **then move the `latest` build tag** (see below) | No | 2026-08-05 (build 1.0.6+) |
| 7 | mcpmarket | mcpmarket.com | Paid listing, edit in dashboard | No | 2026-07-26 |
| 8 | mcp.so | listing id `ea8b3345-51f0-4395-8d31-48cb2fc390b5` | Dashboard edit (their React form drops fast-typed characters, set values via JS native setter) | No | 2026-07-26 (queued review) |
| 9 | PulseMCP | pulsemcp.com | **NOT LISTED as of 2026-08-15.** Submissions paused on their side, see note below | Yes | auto |
| 10 | Docker MCP Catalog | PR docker/mcp-registry#4538 | PR (open, awaiting Docker review) | No | 2026-07-26 |
| 11 | awesome-mcp-servers | PR #10881 | PR (open, Glama badge added per maintainer precondition) | No | 2026-07-26 |
| 12 | awesome-remote-mcp-servers | PR #527 | PR (open, clean) | No | 2026-07-26 |

## Checked 2026-08-15

**PulseMCP: not listed, and nothing to submit.** `pulsemcp.com/servers?q=statcite`
returns "No servers". Their `/submit` page says, in plain text, that until
mid-August they are "not accepting new MCP server or client submissions" and
are "not making changes to existing listings", and directs submitters to the
Official MCP Registry: "we will pick it up automatically once we are back."
That prerequisite is met — StatCite is in the registry at **v1.11.0**, marked
`isLatest`, published 2026-08-14, carrying the current description. So this is
waiting on them, not on us. Re-check after their pause lifts.

One measurement note. PulseMCP's `v0beta` API is deprecated and *randomly
fails requests*, returning `API_SUNSET` errors for queries that should match.
An empty result from it is only believable against a positive control: the
`statcite` query returns a well-formed `{"servers":[],"total_count":0}` while
`filesystem` and `github` returned errors in the same run.

**LobeHub: listing is a stale 25 July snapshot.**
`lobehub.com/mcp/asokore-statcite` carries
`"dateModified":"2026-07-25T03:00:49.282Z"` and still describes StatCite as
serving "optional FRED", six times, including inside the page's JSON-LD
`keywords` array, which is the part other tools ingest. FRED was retired in
v1.2.0 on terms-of-use grounds, so this is a public claim that we use a source
we deliberately do not touch.

Our own text is clean, checked rather than assumed: `README.md` states "FRED is
not served" with the reason, and the only other mention in the repository is
the `site/docs.html` changelog line for 1.0.0, which correctly records the
retirement. LobeHub scrapes `github.com/asokore/statcite`, so a re-scan alone
fixes it. No self-service refresh or submissions repo exists for their MCP
marketplace. Asking them directly is an owner decision.

## Not yet listed (Phase 2 targets)

| Surface | Route | Blocker |
|---|---|---|
| ChatGPT apps directory | developers.openai.com submission | OpenAI identity verification must be confirmed available to the operator |
| cursor.directory | web form at cursor.directory/plugins/new (GitHub sign-in; auto-reviewed by an agent). NOT a PR; the old cursor/mcp-servers repo is deprecated | account sign-in |
| Cursor official marketplace | cursor.com/marketplace/publish. Publisher application, manual review, open source required | account sign-in |
| Cline marketplace | GitHub issue, template `mcp-server-submission.yml` | needs a **400x400 PNG logo** + a checkbox asserting the submitter TESTED setup in Cline. `llms-install.md` is explicitly optional (their FAQ says a good README suffices). Do not tick the tested box without actually testing |
| Gemini CLI extensions | ✅ DONE, `gemini-extension.json` at repo root + `gemini-cli-extension` topic. **No submission, no review**: the gallery crawls the topic | shipped 2026-08-08 |
| awesome-ai-for-economists | ✅ PR #13 OPEN (2026-08-08) | awaiting maintainer |
| VS Code | **No direct submission path.** Its built-in gallery reads the GitHub MCP Registry (github.com/mcp, ~210 curated servers), not registry.modelcontextprotocol.io. Route: publish to the official registry, then request onboarding via partnerships@github.com | manual curation |
| Claude Code plugin marketplace | `.claude-plugin/marketplace.json` in this repo | none, buildable |

## Gotchas that have bitten this project

- **Apify's `latest` tag does not move on push.** After `apify push`, run
  `npx apify-cli builds ls <actorId> --desc --limit 2 --json` and confirm the
  newest build carries `buildTag:"latest"`; if not,
  `npx apify-cli builds add-tag --build <id> --tag latest`. A successful push is
  NOT evidence real callers get the new code (2026-08-05: callers ran a build
  three versions old for days).
- **The MCP registry publish needs a GitHub device-flow login**, and the
  Authorize button only responds to real trusted input, use a coordinate click
  derived from a screenshot taken immediately beforehand, not a JS click.
- **A 200 from `curl` is not proof a listing renders** on SPA-based directories.
  Check in a real browser.
- **mcp.so's form** drops characters when typed quickly; set field values with a
  JS native setter plus an `input` event.
