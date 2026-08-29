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
