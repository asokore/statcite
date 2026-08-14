# StatCite: Launch Plan

Deployment runbook lives in ../HANDOFF.md. This file is the go-to-market sequence once the server is live.

## T+0 (deploy day)

- [x] Smoke test against production: `cd server && BASE=https://statcite.com npm run smoke` (done repeatedly; every release since 1.2.0 was live-smoke-verified, see HANDOFF)
- [x] Add StatCite to your own Claude as a custom connector; use it for a real task; fix anything that annoys you (in continuous use by the operator's own agents since 2026-07-25)
- [x] Register hello@statcite.com forwarding (Cloudflare Email Routing) (done 2026-07-25)
- [x] Join the Cloudflare Monetization Gateway waitlist (done 2026-07-25)

## T+1–3 (distribution wave 1: ~half a day total)

- [x] Push repo to GitHub (public), topics + README polish (distribution/submissions.md §2) (done 2026-07-25)
- [x] Publish to the official MCP registry (§1). The cascade starts here (done 2026-07-25, v1.4.2 latest)
- [x] Smithery (§4), Glama claim (§5) (done; Glama scored A quality 2026-07-29)
- [x] awesome-mcp-servers PR + awesome-remote-mcp-servers PR (§7) (both open, awaiting maintainers)
- [x] Submit to Claude Connectors Directory (§3) (approved + published 2026-07-29)
- [x] Push the Apify actor + enable pay-per-event (§9) (live, differentiated PPE pricing)

## T+4–10 (launch wave)

- [ ] Record a 30–60s GIF: Claude catching a wrong stat via verify_stat and citing the correction (this GIF is the whole pitch)
- [ ] Show HN. Post from distribution/social-copy.md, morning US time, mid-week; stay online 4–6 hours answering every comment
- [ ] r/mcp same day (different copy, same demo)
- [ ] LinkedIn post (your professional network is unusually right for this product)
- [ ] Email PulseMCP the newsletter pitch (listing itself auto-ingested from the official registry, done; the PITCH remains untried)
- [x] mcp.so + mcpmarket submissions (done 2026-07-26: mcp.so queued review id ea8b3345, mcpmarket listed)

## T+2–8 weeks (authority wave)

- [x] Build and publish the **AI Economic-Stats Accuracy Benchmark**. BUILT and pre-registered well beyond the original sketch (bench/: frozen methodology, NIST-beacon seeding, primary-source-audited ground truth, deviations log). Run 1 published; **Run 2 complete-in-parts and EMBARGOED until the vendor courtesy-preview window passes** (bench/DEVIATIONS.md D-008 item 9). The statcite.com results page remains to be built (GROWTH-PLAN Phase 2 launch prep)
- [ ] Pitch the benchmark to one data journalist and 2–3 AI newsletters (scheduled for the post-embargo launch cluster, GROWTH-PLAN Phase 3)
- [ ] Write one tutorial: "Fact-checking economic claims in Claude/ChatGPT with StatCite" (dev.to + repo docs)
- [ ] Watch for the Claude directory approval; when live, announce again, **the trigger FIRED 2026-07-29 (approved + published) and the re-announcement never happened**; folded into the Phase 3 launch cluster so it lands with the benchmark story instead of alone

## Cadence after launch

- Weekly (15 min): check Cloudflare analytics, Smithery uses, GitHub issues; reply to everything
- Monthly (2–4 h): dependency bumps, data-source spot checks (`npm run smoke`), one small improvement or content piece
- Quarterly: rerun the benchmark; revisit monetization triggers (docs/MONETIZATION.md)

## Success criteria (honest)

- 90 days: listed in ≥6 directories, ≥1 launch post with real discussion, measurable daily agent traffic, first Apify events
- 180 days: recognizable as the default "economic data with citations" MCP; verify_stat appearing in third-party tutorials/workflows; first recurring revenue
- If both miss: the free service still costs ≈nothing and remains professionally useful. Park it in maintenance mode, keep the domain, revisit when agent payments mature

---

## Reading usage analytics (which tools agents actually call)

Implemented 2026-07-24. This is the feedback loop BRIEF.md §7 said was missing.
Every MCP tool call and every REST GET records **one aggregate event**. Code:
`server/src/core/analytics.ts`; call sites: `tools.ts` (`callTool`, used by the
MCP dispatch path) and `rest.ts` (`handleRest`).

**What is recorded**, and nothing else:

| field | example | notes |
|---|---|---|
| `transport` | `mcp` / `rest` | |
| `op` | `verify_stat`, `indicator`, `snapshot` | tool name, or REST endpoint name from a fixed table |
| `indicator` | `inflation_cpi`, `worldbank/*`, `other` | registry keys only; anything else collapses |
| `country` | `BRB` | resolved ISO3 only; unresolvable input is dropped |
| `verdict` | `match` / `close` / `mismatch` / `cannot_verify` | verify_stat only |
| `outcome` | `ok` / `tool_error` / `upstream_error` / `crash` | |
| duration | `250` ms + bucket `lt500ms` | |

**Never recorded:** IP, user agent, headers, cookies, session ids, free-text
search queries, claimed values, full query strings. Enforced structurally. Every string written comes from a closed set, not from the request, and proved
by `server/test/analytics.test.ts`. This keeps `site/privacy.html` true (no
accounts, no profiling; only "aggregate infrastructure logs and metrics").

### Sink 1: Workers Analytics Engine (**NOT ACTIVE, Workers Paid gate**)

**Status 2026-08-07: the binding is commented out in `server/wrangler.jsonc`.**
Despite the free-tier documentation below, deploying the binding on this
account fails with API error 10089 (Analytics Engine requires Workers Paid).
The section is retained as the design of record for if/when the account is
upgraded; until then Sink 2 (the log line) is the only live sink, and the
weekly query cadence below CANNOT run, use the monthly bookkeeping sheet
(docs/GROWTH-PLAN-2026-08.md Phase 2) with `wrangler tail` sampling instead.

Binding `STATCITE_USAGE` → dataset `statcite_usage` (`server/wrangler.jsonc`).
Documented free-plan allocation: **100,000 data points written/day, 10,000 read
queries/day, 3-month retention**, not honored for this account in practice
(see status note above).

Schema (positions are the contract, append, never reorder):

```
index1  = op
blob1..7 = transport, op, indicator, country, verdict, outcome, duration_bucket
double1..3 = count(=1), duration_ms, ok(1|0)
```

Query it with the SQL API (no dashboard UI for custom datasets). Create a token
once at https://dash.cloudflare.com/profile/api-tokens → **Create Custom Token**
→ Permissions: *Account* | *Account Analytics* | *Read*.

```bash
# Top tools over the last 7 days
curl "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" \
  --data "SELECT blob2 AS op, blob1 AS transport, SUM(_sample_interval) AS calls
          FROM statcite_usage
          WHERE timestamp > NOW() - INTERVAL '7' DAY
          GROUP BY op, transport ORDER BY calls DESC"

# Which indicators actually matter
curl ... --data "SELECT blob3 AS indicator, SUM(_sample_interval) AS calls
                 FROM statcite_usage WHERE timestamp > NOW() - INTERVAL '30' DAY
                   AND blob3 != '' GROUP BY indicator ORDER BY calls DESC LIMIT 25"

# Which countries
curl ... --data "SELECT blob4 AS iso3, SUM(_sample_interval) AS calls
                 FROM statcite_usage WHERE timestamp > NOW() - INTERVAL '30' DAY
                   AND blob4 != '' GROUP BY iso3 ORDER BY calls DESC LIMIT 25"

# verify_stat verdict mix, the benchmark input (docs/STRATEGY.md)
curl ... --data "SELECT blob5 AS verdict, SUM(_sample_interval) AS n
                 FROM statcite_usage WHERE blob5 != '' GROUP BY verdict"

# Error rate + latency by tool
curl ... --data "SELECT blob2 AS op, SUM(_sample_interval) AS calls,
                        AVG(double3) AS ok_rate, AVG(double2) AS avg_ms
                 FROM statcite_usage WHERE timestamp > NOW() - INTERVAL '7' DAY
                 GROUP BY op ORDER BY calls DESC"
```

### Sink 2: structured log line (zero setup, always on)

Every event also prints `STATCITE_USAGE {json}`, captured by Workers
observability (`observability.enabled` in wrangler.jsonc). Useful for live
watching and as the fallback if the Analytics Engine binding is ever removed.

```bash
cd server && npx wrangler tail --format pretty --search STATCITE_USAGE
```

Dashboard path: **Workers & Pages → statcite → Logs** (Live / Logs tab), filter
on `STATCITE_USAGE`. Retention there is short (a few days); the Analytics Engine
dataset is the 3-month record.

Add to the weekly 15-minute cadence above: run the "top tools" and "which
indicators" queries and let them drive registry additions.
