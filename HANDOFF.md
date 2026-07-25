# HANDOFF — Take StatCite live

> **STATUS: LIVE as of 2026-07-25.** Steps 1–6 below are DONE. See "Launch status" immediately below before following anything else here — most of this runbook is now historical record, not to-do.

## Launch status (2026-07-25)

**Done and verified:**
- `statcite.com` registered (Cloudflare) · Worker + site deployed · apex and `www` both serving · `/v1`, `/mcp`, `/health` all 200
- Public repo: https://github.com/asokore/statcite (topics + homepage set)
- **Official MCP registry: published, status `active`** — `io.github.asokore/statcite`
- `hello@statcite.com` → Gmail via Cloudflare Email Routing (MX + SPF live, destination pre-verified)
- Usage analytics live (`core/analytics.ts`) — verified in production via `wrangler tail --search STATCITE_USAGE`
- WAF rate limit: 200 req/10s per IP on `/v1*` + `/mcp*`, block for 10s (free plan allows exactly 1 rule)
- Directory PRs open: [awesome-mcp-servers#10881](https://github.com/punkpeye/awesome-mcp-servers/pull/10881) · [awesome-remote-mcp-servers#527](https://github.com/jaw9c/awesome-remote-mcp-servers/pull/527)

**Blocked on the owner (nothing else is):**
1. **Apify** — needs a token from https://console.apify.com/settings/integrations, then `cd apify && npx apify login -t <token> && npx apify push`, then set the pay-per-event `statcite-query` event in Console. CLI is already installed and the actor passes locally.
2. **Claude Connectors Directory** — requires a paid Team/Enterprise Claude.ai org (see §3).
3. **FRED key** (optional) — account creation at https://fredaccount.stlouisfed.org/apikeys, then `npx wrangler secret put FRED_API_KEY`.
4. **Analytics Engine** (optional) — the dataset exists but deploys are rejected with API error 10089 on this account (gated behind Workers Paid). The console-log sink covers the need at zero cost; re-enable the binding in `wrangler.jsonc` only if the account ever moves to Workers Paid.

---

> **This is the mechanical runbook, not the mandate.** If you're an agent picking this project up, read `BRIEF.md` first — it explains what the owner actually wants, what's questionable about this build, and what else could be built instead. Deploying is one legitimate path among several. Come back here once you've decided it's the right one.

This runbook takes the repo from `C:\dev\statcite` to a running product. Total time: **~60–90 minutes** of guided steps. It is written for Claude Code to execute with you (open Claude Code in this folder and say *"execute HANDOFF.md"*), or for you to follow manually.

**State of the build:** code complete and verified — 50 fixture-backed tests pass, a live smoke suite passed against the real World Bank / IMF-DBnomics / Frankfurter APIs from the build environment, and the site is ready. Nothing below writes code; it's accounts, wiring, and submissions.

**You already have:** GitHub (paid), Cloudflare, Apify accounts. ✔

---

## 1. Register the domain (~5 min, ~$10–12/yr)

The name **statcite.com** was collision-checked (RDAP: unregistered as of 2026-07-25; no company, npm, or MCP-name conflicts).

1. Cloudflare dashboard → **Domain Registration → Register domain** → `statcite.com` (at-cost pricing, auto-DNS setup). Optionally also grab `statcite.dev` (~$12) and set a redirect later.
2. If someone registered it in the meantime: fallbacks cleared by the same check were `statcite.dev`, `statcite.io`, `econcite.com`. If you switch names, do a global find/replace of `statcite.com` in the repo (`grep -ril statcite.com .`) and rename `server/wrangler.jsonc` → `"name"`.

## 2. Push the repo to GitHub (~5 min)

```bash
cd C:\dev\statcite
git init && git add -A && git commit -m "StatCite v1.0.0"
gh repo create statcite --public --source . --push
```

Then replace the `GITHUB_USERNAME` placeholder (2 files):
- `server/package.json` → `"mcpName": "io.github.<you>/statcite"`
- `distribution/server.json` → `"name"` and `"repository.url"`
Commit and push. Add repo topics per `distribution/submissions.md` §2.

## 3. Verify locally (~5 min)

```bash
cd server
npm install
npm test        # expect: 50 pass
npm run smoke   # expect: SMOKE: ALL PASS (live network calls)
npm run dev     # wrangler dev → open http://localhost:8787 (site) and check /health
```

First `npx wrangler` use will prompt to install wrangler — accept (or `npm i -D wrangler` to pin it).

## 4. Deploy to Cloudflare (~10 min)

```bash
cd server
npx wrangler login
npx wrangler deploy
```

This deploys the Worker **and** the static site (assets binding) to `statcite.<your-subdomain>.workers.dev`. Sanity check: open `https://statcite.<subdomain>.workers.dev/health`.

**Wire the custom domain:** uncomment the `routes` block in `server/wrangler.jsonc` (statcite.com + www), then `npx wrangler deploy` again. (Alternative: dashboard → Workers → statcite → Settings → Domains & Routes → Add custom domain.) DNS is automatic when the domain is on the same Cloudflare account.

**Optional but recommended (2 min each):**
- FRED key (unlocks US monthly series): create at https://fredaccount.stlouisfed.org/apikeys → `npx wrangler secret put FRED_API_KEY`
- Email: Cloudflare dashboard → Email → Email Routing → route `hello@statcite.com` → your Gmail.

## 5. Production smoke test (~3 min)

```bash
curl https://statcite.com/health
curl "https://statcite.com/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.1"
curl -X POST https://statcite.com/mcp -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
Expect: health ok · verdict "match" with citation · 10 tools.

Then the real test: **Claude → Settings → Connectors → Add custom connector → `https://statcite.com/mcp`** and ask Claude: *"Verify this claim and cite the source: Barbados inflation was about 1.4% in 2024."* It should call `verify_stat` and answer with the citation.

## 6. Distribution (the growth work)

Follow **`distribution/submissions.md`** top-to-bottom (registry → GitHub polish → Claude directory → Smithery/Glama → community lists → Apify). Launch posts and timing: **`docs/LAUNCH.md`**; prewritten copy: **`distribution/social-copy.md`**.

## 7. Apify actor (the paid channel) (~20 min)

```bash
npm i -g apify-cli
apify login
cd apify
npm install
node scripts/local-test.mjs   # expect: ACTOR CORE: PASS
apify push
```
Console: publish to Store (copy in `apify/README.md`), Monetization → Pay per event → event **`statcite-query`** (suggested $1.50/1,000 — see `docs/MONETIZATION.md`), set payout details.
Note: `apify/core.bundle.mjs` is committed and current; regenerate with `npm run build:core` whenever `server/src/core/*` changes.

## 8. The Claude skill (optional, 2 min)

`skill/statcite.skill` is a packaged skill teaching Claude the verify-then-cite workflow (works via REST even without the connector). Add it to your Claude account (upload in the app / save from the file card in our chat), and consider shipping it later inside a plugin (`distribution/submissions.md` §10).

## Maintenance contract (what keeps this alive)

- **Weekly 15 min:** Cloudflare analytics, GitHub issues, hello@ inbox.
- **Monthly 2–4 h:** `npm test && npm run smoke`, dependency bumps, one improvement; check that World Bank/DBnomics/Frankfurter shapes still pass smoke.
- **Watch (protocol):** MCP revision **2026-07-28** is a **release candidate**, not yet ratified — the current ratified revision remains **2025-11-25**. The RC removes initialize/sessions (fully stateless). Current code supports 2025-03-26/06-18/11-25 and all transport logic is isolated in `server/src/mcp.ts` — once 2026-07-28 (or whatever it's ratified as) actually lands and major clients adopt it, add support there (likely a ~30-line change). mcp-remote guidance in docs already pins ≥0.1.16 (CVE-2025-6514).
- **Cost watch:** free tier = 100k req/day. If sustained traffic approaches it, that's a success problem: enable Cloudflare rate rules for anonymous heavy hitters and open the paid tier (docs/MONETIZATION.md Stage 1).

## Troubleshooting

- `wrangler deploy` complains about `run_worker_first` or `not_found_handling` → update wrangler (`npm i -D wrangler@latest`); both are standard assets options.
- MCP client says "not connectable" → confirm POST https://statcite.com/mcp returns JSON for tools/list (above), and that you didn't paste the /v1 URL.
- World Bank 502s → transient; the code retries once and caches. Persistent failures: check https://api.worldbank.org/v2/country/USA/indicator/SP.POP.TOTL?format=json&mrv=1 directly.
- A data shape changed upstream → `npm run fixtures` refreshes recorded fixtures; run tests to see what moved.
