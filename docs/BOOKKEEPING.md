# Monthly bookkeeping

The Workers Analytics Engine binding is paid-gated on this account (API error
10089), so the automated KPI loop in `LAUNCH.md` cannot run. This 15-minute
monthly pass is the stand-in, and it is the **only thing watching the
monetization triggers in `MONETIZATION.md`**. Without it, nobody notices when
Stage 1 becomes worth doing.

Do it on the first working day of each month.

## The five commands

```bash
# 1. Traffic sample (run for a few minutes during a busy hour; Workers
#    observability retains only a few days, so this is a sample, not a total)
cd server && npx wrangler tail --format pretty --search STATCITE_USAGE
#    (captured nothing in 150s on 2026-09-05; prefer: node tools/analytics.mjs --days 7,
#     which now prints the outcome mix per caller class)

# 2. Is the service actually healthy right now
curl -s https://statcite.com/v1/status | head -20

# 3. GitHub interest
gh repo view asokore/statcite --json stargazerCount,openIssues

# 4. Apify revenue + events: Console → Actors → statcite → Insights
#    (no CLI surface for earnings; screenshot the month)

# 5. Smithery installs (the only public install counter we have)
#    https://smithery.ai/server/asokore-beckles/statcite
```

## The table to keep

Append one row per month. A spreadsheet is fine; so is this file.

| Month | Req/day (sampled) | verify_stat share | GitHub stars | Apify events | Apify revenue | Hours spent | Notes |
|---|---|---|---|---|---|---|---|
| 2026-08 | | | | | | | v1.5.0–v1.7.0 shipped; growth plan Phase 1 executed |

**`verify_stat` share is the thesis metric.** The strategy claims verification
is the differentiator, not lookup. If verify calls stay a trivial fraction of
traffic for several months, the positioning is wrong and `STRATEGY.md` should
change, that is a finding, not a failure.

## Triggers to check each month

From `MONETIZATION.md` Stage 1, any ONE of these firing means it is time to
consider paid keys:

- [ ] Run the data-integrity check: `python tools/verify-against-source.py --full`.
      This is the only thing that verifies the NUMBERS rather than the service
      surface. Every unit test runs against recorded fixtures, so nothing else
      would catch a value served from the wrong series, a stale one, or one
      attributed to a publisher that does not carry it. It re-fetches each
      series from the World Bank and IMF directly, resolving the upstream code
      from StatCite's OWN citation, so it tests the real claim: that the number
      is what the cited series actually contains. Expect ~85% coverage and 0
      mismatches; investigate any mismatch before anything else on this list,
      and treat a sudden drop in COVERAGE as a finding too, since a check that
      silently stops comparing looks identical to one that passes.
      First full run 2026-09-02: 215 verified, 0 mismatches.
- [ ] **OWNER ACTION, Smithery.** smithery.ai/servers/asokore-beckles/statcite is
      serving a scan from early August: the old "World Bank, IMF WEO, ECB"
      description, 10 of the 12 tools, and a get_series blurb that still
      advertises the FRED path. The live tools/list is correct (12 tools, FRED
      described as permanently disabled), so this is their cache. Sign in to
      the Smithery dashboard and trigger a re-scan of the repo. Found
      2026-09-05; the Chrome extension was down so it could not be done then.
      The listings inventory URL is also stale: their path moved from
      /server/ to /servers/ (the old one 308-redirects).
- [ ] Measurement note, 2026-09-05: the documented traffic-sample command
      `npx wrangler tail --format pretty --search STATCITE_USAGE` connected
      and captured ZERO lines in 150 seconds at ~2 requests a minute, twice.
      The GraphQL path in `tools/analytics.mjs` works and now prints the
      outcome mix (2xx/4xx/5xx per caller class), so use that for the monthly
      pass and treat the tail as unreliable until someone works out why it is
      silent.
- [ ] **OWNER ACTION, Cloudflare dashboard.** Cloudflare returns 403 ("error
      code: 1010", Browser Integrity Check) to any client whose user-agent
      matches `Python-urllib/*` or `libwww-perl/*`, on EVERY path including
      `/`, `/robots.txt`, `/v1/*` and both GET and POST `/mcp`. Python's
      standard library sends that UA by default, so a hand-written stdlib
      script or an LLM-generated `urllib.request.urlopen` snippet gets a hard
      403 from a service whose whole pitch is that machines should call it.
      The block is a pure user-agent string match with no security value:
      python-requests, httpx, aiohttp, wget, Go, Java, okhttp and an EMPTY
      user-agent all return 200. It is generated at the edge before the Worker
      runs, so NO change in this repo can clear it.
      Fix: Cloudflare dashboard > Security > WAF > Custom rules > Create rule,
      action **Skip**, skip Browser Integrity Check, matching the machine
      paths (`/`, `/v1/*`, `/mcp*`, `/llms.txt`, `/llms-full.txt`,
      `/openapi.json`, `/robots.txt`, `/sitemap.xml`, `/.well-known/*`).
      Alternatively disable Browser Integrity Check for the zone.
      `tools/audit-live.py` fails on this today (check
      `machine/the Python stdlib HTTP client is not blocked`) and is the way to
      confirm the fix landed. Found 2026-08-31; the wrangler OAuth token has
      zone READ only, so it cannot be done from the CLI.
- [ ] After the sweep of 2026-08-31, confirm Google picks up the new signals:
      `lastmod` now present on all nine sitemap URLs, structured data on all
      six pages (was homepage only), and /sources server-rendering its ledger
      so a non-JS crawler can read it. Check the Data sets report still shows
      the six datasets valid, and whether /docs and /bench start appearing as
      separate impressions rather than the homepage alone.
- [x] Search Console follow-ups (added 2026-08-29, **all three closed
      2026-09-02**). Data sets: Invalid 0, "Missing field 'description'" shows
      Validation **Passed**, and URL inspection reports **6 valid items
      detected**. Sitemap: **Success**, last read 1 Sept, 9 pages discovered.
      Performance: 9 impressions, 0 clicks, avg position 7.1, and the only
      attributed query is `statcite` itself. Also confirmed: the page **is
      indexed** per URL inspection, even though the aggregate Pages report
      still reads "Indexed 0" with a 27 Aug stamp - that report lags, so use
      URL inspection for the current answer, never the summary tile.
- [ ] Sustained >5,000 requests/day
- [ ] >500 GitHub stars
- [ ] ≥3 inbound volume enquiries at hello@statcite.com

Also check:

- [x] Apify pricing revisit — done 2026-08-29 with real usage data. The actor has 1 total user (the setup account) and 0 monthly users, so pricing is not the constraint and repricing changes nothing: demand is. Prices stand ($0.0015/lookup, $0.015/verify, both charged only on success). Revisit only when monthly users > 0; until then the Apify listing is a distribution surface, not a revenue line.
- [x] Listing staleness after 1.11.x (checked 2026-08-29): registry serves 1.11.3 with the Caribbean-inclusive description; Glama maintenance is now grade A (the releases cleared the 'no stable releases' cap); all three directory PRs are MERGEABLE, the awesome-mcp-servers one rebased out of conflict with refreshed facts; LobeHub still serves its 25 July snapshot (email is the remaining lever)
- [ ] (checked 2026-08-29: still paused past their stated mid-August date, registry prerequisite satisfied at 1.11.3) PulseMCP ingestion check: pulsemcp.com auto-ingests from the official
      registry weekly, yet a 2026-08-10 audit found StatCite absent despite 9
      registry versions. If still absent after the 1.9.1 publish has had two
      weekly cycles (check from 2026-08-24), contact PulseMCP directly rather
      than waiting further
- [ ] (checked 2026-08-29: all eleven entries 15-35 days old, none due before late January 2027) Licence re-verification: any source whose `license_verified_on` is over a
      year old (see `/v1/sources`)
- [ ] Upstream breakage: does `/v1/status` show any source degraded?

## Quarterly, not monthly

- Re-run the benchmark (`bench/`) and publish the next run
- Re-read the kill-or-double-down question in `STRATEGY.md` honestly: is this
  still worth the hours it takes?
