# StatCite — Strategy

## Positioning

**"Economic statistics your AI can actually cite."** StatCite is not a data wrapper; it is the *citation and verification layer* for economic statistics in AI workflows. Every incumbent serves numbers; StatCite serves numbers **with receipts** and can **check other people's numbers**. That framing must survive every piece of copy: the product is trust, the data is commodity.

The builder is part of the product: an economist curates the registry (WEO general-government debt over patchy WDI central-government; annual-average vs Dec/Dec inflation caveats; projections labeled). Say so everywhere — it is the credibility no hobby wrapper can copy.

## Moat (in order of realism)

1. **Distribution + default-status** — being the server registries list, tutorials mention, and agents already have installed. First-mover in "verify economic stats" with tool descriptions written for agent retrieval.
2. **Curation quality** — the indicator registry, fallback chains, diagnostics, and caveat notes are judgment, not code. Copyable in principle, rarely copied well.
3. **The verification benchmark** (see Growth) — owning the measurement of the problem.
4. Code is MIT and trivially forkable — accept this; the moat was never the code.

## Target users (concentric)

1. AI agents doing deep-research/report tasks (installed by their humans) — the traffic.
2. Economists, analysts, journalists, students who fact-check — the reputation carriers.
3. Teams/pipelines needing invoiced, metered data access — the Apify/Pro revenue.

## Competitive posture

- **vs Google Data Commons:** don't fight on breadth. Win on verification verdicts, IMF WEO vintages/projection labeling, FX for small economies, and being *neutral infrastructure* with explicit licenses. If Data Commons ships verification, pivot emphasis to fiscal/WEO depth and the benchmark.
- **vs Trading Economics/commercial:** they sell access; StatCite gives away access and sells convenience/volume. Never compete on series count.
- **vs platform-layer fixes (Citations API etc.):** platforms verify *retrieval*; StatCite verifies *against the official series*. Keep making that distinction.

## Growth playbook (sequenced)

1. **Weeks 1–2:** deploy → registry + directories (distribution/submissions.md) → Show HN + r/mcp launch (copy ready in social-copy.md).
2. **Month 1–2:** publish the **AI Economic-Stats Accuracy Benchmark** — run the major assistants on 100 econ-stat questions, verify with StatCite, publish error rates by model/indicator/country. No such benchmark exists (verified); it is press-worthy, repeatable quarterly, markets the tool by construction, and fits the builder's authority. Post to HN/r/economics/LinkedIn; pitch one data journalist.
3. **Ongoing:** answer every "how do I get economic data into Claude/ChatGPT" thread with a genuinely helpful reply; keep a changelog cadence (dead-server rot is the norm — visible maintenance is differentiation); watch Smithery uses + Cloudflare analytics weekly.
4. **Month 3+:** Cowork/Claude Code plugin bundling connector + skill; ChatGPT apps directory once polished; guest posts ("Why AI gets economic statistics wrong").

## KPIs

- Requests/day (Cloudflare analytics) and unique connecting clients
- Registry/ directory installs (Smithery uses count is the only public one — screenshot monthly)
- verify_stat share of calls (the differentiator being used = thesis confirmed)
- Apify: paid events/month, revenue
- Inbound: GitHub stars/issues, hello@ emails

## Risks & responses

| Risk | Response |
|---|---|
| Data Commons/Valyu ship verification | Accelerate benchmark + fiscal-data depth; consider OECD/Eurostat curated expansion |
| Traffic without revenue persists | Fine — cost ≈ $0; the asset is reputation + option value; revisit rails every quarter (MONETIZATION.md triggers) |
| Free-tier abuse | Cloudflare WAF rate rules (free), then keys for heavy users |
| Upstream API breakage | Fallback chains already in code; smoke script alerts; DBnomics as aggregator hedge |
| Maintainer time | Everything is boring TypeScript with tests; 2–4 hrs/month keeps it alive. If abandoning, archive publicly rather than rot silently |

## The honest frame

Expected value is a few hundred dollars a month within 1–2 years, a real chance of ~$0, and a small chance of meaningful income or an acquisition-shaped outcome. The asymmetry that justifies it: ~$12/year + maintenance hours against (a) a permanent, compounding distribution asset in the fastest-growing software channel, (b) direct professional utility every time its builder writes or reviews economic content, and (c) a strong first-mover claim on "verification of economic statistics for AI" — a category likely to matter more each year.
