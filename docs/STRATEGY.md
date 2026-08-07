# StatCite — Strategy

## Positioning

**"The only tool that checks a claimed figure against the official series."** StatCite is not a data wrapper; it is the *citation and verification layer* for economic statistics in AI workflows. Lead with **verify_stat** — nothing else in the space verifies a claimed number against an official statistical series — and back it with **license-grade citations**: license, required attribution string, retrieval date, canonical URL, projection labeling. A growing set of incumbents (Data Commons, Statista, FXMacroData) now attach *some* provenance to responses, so "we ship citations" is no longer the whole pitch; "our citations are complete enough to satisfy the license, and we verify" is. That framing must survive every piece of copy: the product is trust, the data is commodity.

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

- **vs StatGPT (IMF/StatCan/Eurostat-backed, launched June 2026):** an LLM-to-SDMX
  retrieval platform for official statistics, backed by IMF, World Bank, OECD,
  Eurostat, BIS, ECB and the UN statistical system (IMF Departmental Paper
  2026/004; statgpt.dialx.ai). It retrieves rather than generates — validating
  StatCite's thesis with institutional weight (the paper itself concedes
  generative models "perform poorly at delivering official statistics").
  Consequences, per docs/VENTURE-CONTEXT.md finding 1: breadth of global
  official statistics is now UNWINNABLE — never compete there. StatCite's
  three defensible positions against it: (a) **verification, not retrieval** —
  StatGPT answers "what is X?"; verify_stat answers "this document claims Y,
  is that right?" — different products, and auditing is the scarcer job;
  (b) **agent-native MCP delivery** — StatGPT is a platform for humans; whether
  it ships a good MCP surface is monitored, not assumed; (c) **coverage where
  SDMX does not reach** — its mechanism requires an SDMX endpoint, which most
  small-island and many developing economies do not publish. Every new piece of
  marketing copy must be written against this row, not the pre-StatGPT frame.
- **vs Google Data Commons:** it already attaches `source_metadata` (source_id, import_name, provenance_url) per datapoint and mandates attribution in its instructions — don't claim "no citations there." Win on completeness (license, required-attribution string, retrieval date, projection labeling — all absent from Data Commons) and on verify_stat, which Data Commons does not have. Don't fight on breadth. If Data Commons ships verification, pivot emphasis to fiscal/WEO depth and the benchmark — and note DataGemma (Google Research, arXiv:2409.13741) already proves the verify mechanic works against Data Commons, so this is a live risk, not a hypothetical.
- **vs Statista MCP:** enterprise-gated, paid, "every response comes with source links" — but aggregated secondary stats, not official series, and no license/attribution-string/retrieval-date completeness, no verification. StatCite is free and official-source.
- **vs FXMacroData:** paid, `mcp_metadata` provenance block (source_type/source_name/data_lag_days), free tier US-only — same completeness and verification gaps.
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
| DataGemma proves Google can ship verify-against-Data-Commons at product scale (RIG/RAG factuality 5–17% → 58–99%, arXiv:2409.13741 — research model, not shipped) | The benchmark becomes more urgent, not less: ship and distribute verify_stat fast, publish the accuracy benchmark early to own the "verification of economic stats" claim before a well-funded incumbent formalizes it |
| Traffic without revenue persists | Fine — cost ≈ $0; the asset is reputation + option value; revisit rails every quarter (MONETIZATION.md triggers) |
| Free-tier abuse | Cloudflare WAF rate rules (free), then keys for heavy users |
| Upstream API breakage | Fallback chains already in code; smoke script alerts; DBnomics as aggregator hedge |
| Maintainer time | Everything is boring TypeScript with tests; 2–4 hrs/month keeps it alive. If abandoning, archive publicly rather than rot silently |

## The honest frame

Expected value is a few hundred dollars a month within 1–2 years, a real chance of ~$0, and a small chance of meaningful income or an acquisition-shaped outcome. The asymmetry that justifies it: ~$12/year + maintenance hours against (a) a permanent, compounding distribution asset in the fastest-growing software channel, (b) direct professional utility every time its builder writes or reviews economic content, and (c) a strong first-mover claim on "verification of economic statistics for AI" — a category likely to matter more each year.
