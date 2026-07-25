# StatCite — Monetization Roadmap

Principle: monetize convenience and volume, never the citation. The free tier is the marketing and the moat; every paid rail below is additive.

## Stage 0 — Live now at deploy

1. **Apify actor (pay-per-event)** — the only rail verifiably paying solo developers today ($1.2–1.4M/month to ~3,000 devs, 80% share).
   - Push `apify/` per distribution/submissions.md §9.
   - Console → Monetization → **Pay per event** → event `statcite-query`.
   - Suggested launch price: **$1.50 per 1,000 queries** (≈ $0.0015/query; compare Ref's $9/1k *searches* — data lookups are cheaper). Revisit after 30 days of usage data.
   - Batch mode charges only successful items — keep that promise; it's in the store copy.
2. **Cloudflare Monetization Gateway waitlist** — sign up (https://blog.cloudflare.com/monetization-gateway/); when admitted, x402-gated paid tiers can be enforced at the edge with zero billing code.
3. **hello@statcite.com** (Cloudflare Email Routing, free) — every serious inquiry is a pricing signal. Reply fast.

## Stage 1 — At traction (any of: >5k req/day sustained · >500 GitHub stars · >3 volume inquiries)

**Supporter/Pro keys via Stripe.**
- Add `Authorization: Bearer` handling (the code path is trivial: check a key table in Workers KV/D1 — at key volumes, KV's 1k writes/day is fine because keys are written once).
- Sell via **Stripe Payment Links** first (no code): e.g., $9/mo Supporter (priority + goodwill), $29/mo Pro (bulk endpoints, higher limits, CSV export).
- Free tier stays; add soft per-IP throttling for anonymous heavy users (Cloudflare rate-limiting rules, free tier) so paying is the path to volume, not the path to access.

## Stage 2 — When agent-native payments show real volume

- **x402**: add HTTP 402 on a `/v1/bulk` or high-volume path via Coinbase middleware or Cloudflare's gateway; list on x402 Bazaar. (~an afternoon; monitor ecosystem volume quarterly — as of July 2026 it's ~$24M/month economy-wide and not worth prioritizing.)
- **Stripe MPP**: accept machine payments on metered endpoints when a real counterparty asks.

## Stage 3 — Products on top (only with demonstrated pull)

- **The benchmark as a product**: quarterly "AI Economic-Stats Accuracy Report" — free summary, paid detailed dataset for AI labs/enterises.
- **Custom verification pipelines** (consulting): newsroom/research-shop integrations of verify_stat into editorial workflow — day-rate work the tool generates naturally.
- **Curated premium packs**: OECD/Eurostat/regional deep sets as Pro-only indicator groups (licensing already permits with attribution).

## Pricing philosophy

- Data is free upstream; charge for *reliability, volume, integration, and answers-shaped-for-agents*.
- Never paywall verify_stat's basic use — it is the reputation engine.
- Keep the ~$0 cost structure sacred: no paid infra until revenue covers it 10×.

## Bookkeeping

- Apify pays out via their partner flow (set up payout details in Console).
- Stripe: standard account; usage-based billing docs: https://docs.stripe.com/billing/subscriptions/usage-based
- Track monthly in a simple sheet: requests/day, Apify events, revenue by rail, hours spent. Kill or double-down decisions quarterly, on data.
