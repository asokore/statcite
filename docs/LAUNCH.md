# StatCite — Launch Plan

Deployment runbook lives in ../HANDOFF.md. This file is the go-to-market sequence once the server is live.

## T+0 (deploy day)

- [ ] Smoke test against production: `cd server && BASE=https://statcite.com npm run smoke` (or run the curl checks in HANDOFF §6)
- [ ] Add StatCite to your own Claude as a custom connector; use it for a real task; fix anything that annoys you
- [ ] Register hello@statcite.com forwarding (Cloudflare Email Routing)
- [ ] Join the Cloudflare Monetization Gateway waitlist

## T+1–3 (distribution wave 1 — ~half a day total)

- [ ] Push repo to GitHub (public), topics + README polish (distribution/submissions.md §2)
- [ ] Publish to the official MCP registry (§1) — the cascade starts here
- [ ] Smithery (§4), Glama claim (§5)
- [ ] awesome-mcp-servers PR + awesome-remote-mcp-servers PR (§7)
- [ ] Submit to Claude Connectors Directory (§3) — review takes days–weeks, start early
- [ ] Push the Apify actor + enable pay-per-event (§9)

## T+4–10 (launch wave)

- [ ] Record a 30–60s GIF: Claude catching a wrong stat via verify_stat and citing the correction (this GIF is the whole pitch)
- [ ] Show HN — post from distribution/social-copy.md, morning US time, mid-week; stay online 4–6 hours answering every comment
- [ ] r/mcp same day (different copy, same demo)
- [ ] LinkedIn post (your professional network is unusually right for this product)
- [ ] Email PulseMCP the newsletter pitch
- [ ] mcp.so + mcpmarket submissions

## T+2–8 weeks (authority wave)

- [ ] Build and publish the **AI Economic-Stats Accuracy Benchmark** (docs/STRATEGY.md — Growth): 100 questions × major assistants, verified via StatCite, error rates by model/indicator/country. Publish as a page on statcite.com + GitHub repo with the data
- [ ] Pitch the benchmark to one data journalist and 2–3 AI newsletters
- [ ] Write one tutorial: "Fact-checking economic claims in Claude/ChatGPT with StatCite" (dev.to + repo docs)
- [ ] Watch for the Claude directory approval; when live, announce again

## Cadence after launch

- Weekly (15 min): check Cloudflare analytics, Smithery uses, GitHub issues; reply to everything
- Monthly (2–4 h): dependency bumps, data-source spot checks (`npm run smoke`), one small improvement or content piece
- Quarterly: rerun the benchmark; revisit monetization triggers (docs/MONETIZATION.md)

## Success criteria (honest)

- 90 days: listed in ≥6 directories, ≥1 launch post with real discussion, measurable daily agent traffic, first Apify events
- 180 days: recognizable as the default "economic data with citations" MCP; verify_stat appearing in third-party tutorials/workflows; first recurring revenue
- If both miss: the free service still costs ≈nothing and remains professionally useful — park it in maintenance mode, keep the domain, revisit when agent payments mature

---

## Reading usage analytics (which tools agents actually call)

Implemented 2026-07-24 — this is the feedback loop BRIEF.md §7 said was missing.
Every MCP tool call and every REST GET records **one aggregate event**. Code:
`server/src/core/analytics.ts`; call sites: `tools.ts` (`callTool`, used by the
MCP dispatch path) and `rest.ts` (`handleRest`).

**What is recorded** — and nothing else:

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
search queries, claimed values, full query strings. Enforced structurally —
every string written comes from a closed set, not from the request — and proved
by `server/test/analytics.test.ts`. This keeps `site/privacy.html` true (no
accounts, no profiling; only "aggregate infrastructure logs and metrics").

### Sink 1 — Workers Analytics Engine (free plan)

Binding `STATCITE_USAGE` → dataset `statcite_usage` (`server/wrangler.jsonc`).
Free-plan allocation: **100,000 data points written/day, 10,000 read
queries/day, 3-month retention**; Cloudflare currently does not bill for
Analytics Engine at all. Our ceiling is the Workers free plan itself
(100k requests/day), so we cannot exceed the write allocation.

Schema (positions are the contract — append, never reorder):

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
curl "https://api.cloudflare.com/client/v4/accounts/41bdc6946a127c4d016ddc87103d3326/analytics_engine/sql" \
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

# verify_stat verdict mix — the benchmark input (docs/STRATEGY.md)
curl ... --data "SELECT blob5 AS verdict, SUM(_sample_interval) AS n
                 FROM statcite_usage WHERE blob5 != '' GROUP BY verdict"

# Error rate + latency by tool
curl ... --data "SELECT blob2 AS op, SUM(_sample_interval) AS calls,
                        AVG(double3) AS ok_rate, AVG(double2) AS avg_ms
                 FROM statcite_usage WHERE timestamp > NOW() - INTERVAL '7' DAY
                 GROUP BY op ORDER BY calls DESC"
```

### Sink 2 — structured log line (zero setup, always on)

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
