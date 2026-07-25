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
