# The Agent-Economy Opportunity: Research Report

**Prepared:** July 25, 2026 · **Method:** five parallel deep-research passes (monetization rails, distribution channels, competitive landscape, demand evidence, technical architecture), ~300 web sources consulted, primary sources preferred. Claims that could not be verified are marked as such. This report is the evidence base behind StatCite's design decisions.

---

## 1. Executive summary

The research question was: *what can a solo builder create, at ~zero cost, that AI agents will use in volume and that can eventually make money?*

Findings, compressed:

1. **Agent traffic is enormous and verified; agent payments are early and thin.** Non-human traffic passed 50% of the internet (Cloudflare, July 2026); MCP is a mass-adopted standard (~9,400 deduplicated servers, official registry live, top utility servers see millions of npm downloads weekly). But the "agents paying per call" economy (x402 etc.) still moves only ~$24M/month across 22,000 sellers — real infrastructure, mostly artificial volume, negligible per-seller income today.
2. **Where indie money actually flows now:** (a) the **Apify marketplace** — $1.2–1.4M/month paid to ~3,000 community developers, 80% revenue share, pay-per-event billing, with every monetized actor automatically callable by AI agents via Apify's MCP server; (b) the **boring SaaS pattern** — free MCP server as a client for a metered API (Exa, Tavily, Firecrawl, Ref). Every other rail (x402, Stripe MPP, Cloudflare Monetization Gateway, ChatGPT apps monetization) is worth wiring for optionality, not counted on for revenue.
3. **The demand wedge with the strongest evidence:** AI systems miscite statistics at measured, persistent rates — >60% of AI search answers had citation problems (Tow Center/CJR, 2025); 45% of AI news answers had significant issues (EBU/BBC, 3,000 responses, 2025); deep-research agents hallucinate citations at 10.7% vs 4.8% for search-augmented LLMs (UPenn, 2026); ≥146,932 AI-hallucinated citations found in 2025's academic papers. Meanwhile documents/reports are ~15% of all Claude conversations (Anthropic Economic Index, June 2026) and 51–53% of surveyed data leaders demand verifiable outputs and audit trails.
4. **The competitive gap is narrower than first thought, but still real.** Re-research dated 2026-07-24 found that Google Data Commons MCP already ships per-datapoint `source_metadata` (source_id, import_name, provenance_url, unit, alternative_sources) and mandates attribution in its server instructions; Statista MCP and FXMacroData also attach provenance to every response. None of the three ships a license field, a required-attribution string, a retrieval date, projection labeling, or a verification tool. So the citation gap is now about **completeness**, not existence — confidence on that gap drops to medium-low. The **verify_stat gap fully holds**: nothing anywhere checks a claimed figure against the official series (confidence: high). Google's own DataGemma research models (RIG/RAG against Data Commons) prove the verification mechanic is buildable and already adjacent, which shortens the realistic window rather than closes it. Licensing supports StatCite's approach regardless: World Bank (CC BY 4.0), IMF, OECD, Eurostat, ECB, BLS all permit attributed commercial redistribution; FRED needs care (operator key, mandated disclaimer, third-party series).
5. **Honest revenue expectations:** the probability-weighted outcome for a well-distributed niche data tool is **~$300–900/month by months 12–24**, with a fat tail ($3–8k MRR) if it becomes the category's default and a modal outcome of $0 without distribution effort. The cost side is ~$12/year (domain), so this is a cheap option on the agent economy plus an immediately useful professional asset.

**Decision taken:** build **StatCite** — the citation-and-verification layer for economic statistics — as a free remote MCP server + REST API (traffic, distribution, reputation) with a **pay-per-event Apify actor twin** (the one rail paying indies today), and monetization hooks staged for when demand materializes.

---

## 2. Monetization rails (July 2026 status)

| Rail | Status | Evidence | Use for StatCite |
|---|---|---|---|
| **Apify Store pay-per-event** | Working now | "$1.2M paid out last month"; earlier "$1M in a single month, 5× in 12 months" (Apify); 80/20 split; rental model sunsetting Oct 2026 in favor of pay-per-usage | **Primary near-term revenue channel** — actor ships in this repo |
| **API keys + Stripe metered billing** | Working now | The pattern behind every commercially successful MCP-adjacent product: Exa, Tavily, Firecrawl, Ref ($9/1k credits), 21st.dev | **Stage 2**, when traffic justifies keys (see MONETIZATION.md) |
| **Stripe Machine Payments Protocol (MPP)** | GA since Mar 18, 2026 | Real users are funded startups (Browserbase "pay per session", Parallel "pay per API call") | Stage 3 add-on for agent-initiated fiat |
| **x402 (Coinbase/Linux Foundation)** | Pipes real, demand thin | 100M+ transactions but ~$0.32 avg and ~$24M/30d across 22k sellers; Chainalysis attributes surges to meme-coin activity; CoinDesk: "demand is just not there yet"; Foundation now includes Visa, Mastercard, Stripe, Google, AWS (July 15, 2026) | Wire later (an afternoon of work) + list on Bazaar; treat as free optionality |
| **Cloudflare Monetization Gateway / Pay Per Use** | Waitlist (announced ~July 1, 2026) | Charges for "web pages, APIs, datasets, and MCP tools" at the edge; no one outside beta is being paid yet | **Join the waitlist now** (HANDOFF step) — best future rail for zero-billing-code monetization |
| ChatGPT apps monetization | Not a rail | External checkout GA but digital-services selling disallowed at directory launch; payment sheet private-beta; no rev share | Distribution only |
| Anthropic connectors directory | Not a rail | No payments, no rev share | Distribution only |
| Google AP2/UCP, OpenAI/Stripe ACP, PayPal Agent Ready | Merchant checkout standards | No mechanism pays a solo tool dev | Ignore |
| RapidAPI | Alive but stagnant | Ecosystem articles treat it as the thing to migrate away from | Skip |

Key sources: [Apify creator economics](https://apify.com/partners/actor-developers), [Apify monetization docs](https://docs.apify.com/platform/actors/publishing/monetize), [Stripe MPP](https://stripe.com/blog/machine-payments-protocol), [Chainalysis on x402](https://www.chainalysis.com/blog/x402-agentic-payments-adoption/), [CoinDesk x402 reality-check](https://www.coindesk.com/markets/2026/03/11/coinbase-backed-ai-payments-protocol-wants-to-fix-micropayment-but-demand-is-just-not-there-yet), [Cloudflare Monetization Gateway](https://blog.cloudflare.com/monetization-gateway/), [x402 Foundation launch](https://www.coindesk.com/tech/2026/07/15/visa-mastercard-and-ripple-join-the-standard-letting-ai-agents-pay-in-stablecoins), [OpenAI Apps SDK monetization](https://developers.openai.com/apps-sdk/build/monetization).

---

## 3. Distribution channels (ordered by impact/effort)

1. **Official MCP Registry** — live in preview; publish via `mcp-publisher` CLI (GitHub-verified `io.github.<user>` namespace, no human review). One publish cascades to GitHub's MCP Registry (curated), VS Code's install UI, and the aggregators that poll the API hourly. ([registry docs](https://modelcontextprotocol.io/registry/about))
2. **GitHub/npm hygiene** — the aggregators (Glama ~20–37k listed, PulseMCP 22k+, mcp.so) crawl GitHub; the README is the de-facto listing. "<name> MCP" Google searches are the biggest organic channel (top-50 servers pull a combined 622k monthly searches — Ahrefs via MCPManager, Mar 2026).
3. **Anthropic Claude Connectors Directory** — individuals can submit; requires privacy policy, docs page, annotated read-only tools, review. Directory listing also makes the server discoverable by Claude itself mid-conversation (agent-initiated suggestions). ([submission](https://claude.com/docs/connectors/building/submission))
4. **Smithery** (self-serve, shows usage counts), **Docker MCP Catalog** (PR, enterprise trust), **PulseMCP newsletter**, **awesome-mcp-servers PR** (90.9k stars), mcp.so, mcpmarket.
5. **Launch posts** — Show HN has repeatedly produced step-function adoption for MCP tools (Browser MCP: 616 points → 100k Chrome-store users; Semble 445 pts; Ghidra MCP 298 pts). r/mcp is the de-facto launch subreddit.
6. **ChatGPT** — developer-mode custom connectors work today (paid plans); the public apps directory (~980 apps by June 2026) is a later, review-gated option. Implementing OpenAI's `search`/`fetch` connector pair (done in this build) is the cheap way to be deep-research-compatible now.
7. **llms.txt** — adoption grew 8.8× but 97% of files get zero AI-bot requests (Ahrefs/Originality.ai); shipped anyway because it costs nothing.

Usage reality check (what wins): engineering tools dominate (42 of top 50); official first-party servers capture 57% of downloads with 4.8% of tools (arXiv 2603.23802). Differentiation + niche authority beats me-too horizontal tools. Finance/econ tools are undersupplied *and* under-downloaded (18% of supply, 5% of downloads) — consistent with "early niche with weak competition", not guaranteed demand. Case studies: Context7 (universal dev pain, zero-friction install → 1.1M weekly downloads), Browser MCP (one great Show HN), Desktop Commander (be installable everywhere, ship continuously).

---

## 4. Competitive landscape for economic data + verification

*Audit re-dated 2026-07-24 (five parallel researchers, primary sources cited below); extends rather than replaces the July 2026 pass.*

**Crowded (access layer):** Google Data Commons MCP (free, hosted, Google-backed, [github.com/datacommonsorg/agent-toolkit](https://github.com/datacommonsorg/agent-toolkit), 137 stars — the biggest strategic threat), official World Bank Data360 MCP (Python, anti-hallucination framing, no citations), Trading Economics MCP (commercial, 300k series), Statista MCP ([statista.com/business/connect-mcp](https://www.statista.com/business/connect-mcp), enterprise-gated/paid, aggregated secondary stats not official series), FXMacroData ([fxmacrodata.com](https://www.fxmacrodata.com), paid macro MCP, free tier US-only), Alpha Vantage/EODHD (partial macro), OpenBB (self-host), Valyu, Wolfram, ~30 single-source wrappers (FRED×4, Eurostat×3, OECD, ECB, BLS…) and no official IMF server, mostly local-stdio, thin, and per one audit 52% of listed MCP servers are dead. Largest observed traction for an econ MCP: AusEcon at 12.5k Smithery uses — the niche is early. Adjacent-space validation that citation-grade data is fundable: Daloopa ($47M raised) ships per-datapoint citations for SEC filings — proof the pattern is not conceptually novel, just unbuilt in this niche.

**Narrowed, not open — citation existence (medium-low confidence gap):**
- Google Data Commons MCP's `get_observations` response already returns a `source_metadata` block per datapoint — `source_id`, `import_name`, `provenance_url`, `unit`, `alternative_sources` — and its server instructions explicitly mandate per-datapoint attribution in agent output.
- Statista MCP: "every response comes with source links" (vendor claim, enterprise/paid access).
- FXMacroData: an `mcp_metadata` block on responses carries `source_type`, `source_name`, `data_lag_days`.
- **What none of the three ships:** a license field, a required-attribution string, a retrieval date, projection/vintage labeling, or a canonical URL guaranteed resolvable — this is StatCite's actual remaining edge on citations: **completeness**, not existence.
- Corroborated unchanged from the July pass: World Bank Data360 MCP, Trading Economics MCP, Valyu, Wolfram, and DBnomics wrappers ship no citation object of any kind.

**Still fully open (high confidence gap):**
- **verify_stat** (claimed value vs official series → verdict + diagnostics): no incumbent has it, including Data Commons, Statista, and FXMacroData. Existing "fact check" tools are web-search-evidence or bibliographic checkers; none checks a claimed number against a statistical API.
- **Provenance-preserving transforms** (inflation adjustment, FX bridging with method disclosure): scattered, nowhere audit-grade.

**Threats:** (1) **DataGemma** (Google Research, `google/datagemma-rig-27b-it`; [arXiv:2409.13741](https://arxiv.org/abs/2409.13741)) is not a shipped product but is a working demonstration of exactly the verify-stat mechanic run against Data Commons — RIG lifts factuality from 5–17% to 58%, RAG to 98–99%. It proves Google has already built and validated the verification approach internally, which sharpens the "Data Commons adds verification" threat and shortens the realistic window rather than removing it. (2) a funded agent-data platform (Valyu already returns search-style citations) ships a verify endpoint; (3) the platform layer (Anthropic Citations API, retrieval-grounded modes) shrinks the problem. Realistic window as an independent layer: 18–36 months, likely toward the shorter end given DataGemma — speed of distribution matters more than feature completeness.

Sources for this audit: [Data Commons agent-toolkit](https://github.com/datacommonsorg/agent-toolkit), [Statista Connect MCP](https://www.statista.com/business/connect-mcp), [FXMacroData](https://www.fxmacrodata.com), [DataGemma model card](https://huggingface.co/google/datagemma-rig-27b-it), [DataGemma paper](https://arxiv.org/abs/2409.13741), [Daloopa](https://www.daloopa.com).

### 4a. StatGPT — the institutional retrieval play (added 2026-07-26, verified against primary sources)

The IMF Statistics Department published **"StatGPT: AI for Official Statistics"** ([Departmental Paper 2026/004](https://www.imf.org/en/publications/departmental-papers-policy-papers/issues/2026/03/10/statgpt-ai-for-official-statistics-573514), 10 March 2026; Tebrake, Boukherouaa, Danforth, Harikrishnan). The platform is built with EPAM's DIAL X division ([statgpt.dialx.ai](https://statgpt.dialx.ai/about-us); PoC 2023, alpha 2024) and works by having an LLM generate structured **SDMX** queries against official statistical agency APIs, returning the exact published figure rather than a generated one. The paper's own framing of the problem is StatCite's thesis verbatim: off-the-shelf GenAI applications "frequently provide dangerously 'reasonable' but incorrect figures" for official statistics. (Precision note: SDMX the *standard* is sponsored by BIS, ECB, Eurostat, IMF, OECD, UN, and the World Bank; StatGPT the *platform* is an IMF initiative with EPAM — do not overstate it as a seven-institution product.)

What this changes: **breadth-first retrieval of global official statistics is now an institutionally-backed position** and is not winnable for an independent layer. What it does not change — and partially validates: (1) **verification** — StatGPT answers "what is X?"; it does not audit "this document claims Y, is that right?" — `verify_stat`/`verify_claims` remain uncontested (§4 above); (2) **agent-native delivery** — StatGPT is a human-facing platform; whether it ships a competitive MCP surface is worth monitoring, not assuming; (3) **coverage where SDMX does not reach** — the mechanism *requires* an SDMX endpoint, and large parts of small-state/regional statistics (Eastern Caribbean, SIDS national sources) publish in PDFs and spreadsheets with no SDMX API. Positioning consequence: lead marketing with verification and audit, treat lookups as the funnel, and treat non-SDMX coverage as structural differentiation rather than a nice-to-have.

**Licensing (verified from primary sources; updated 2026-08-10):** World Bank CC BY 4.0 (attribution format specified); IMF — the current data terms (effective 2024-10-11) permit copy/redistribute/derivative use with attribution as "Source: International Monetary Fund, \<database\>, \<link\>", plus downstream-communication and (where data is sold standalone) free-of-charge-disclosure conditions — note the 2020 terms' "and sell" wording was dropped, so the earlier version of this paragraph overstated the sale permission; OECD open by default since July 2024; Eurostat CC BY 4.0 (non-EU-country data exceptions); ECB reference rates informational-with-attribution; BLS public domain with API ToS; FRED — PERMANENTLY DISABLED in StatCite: its Services ToU clauses (p)/(q) prohibit AI/ML use and caching/redistribution, which is architecturally incompatible (the earlier "optional and secret-gated" design described here was retired in 1.3.2). StatCite's citation strings are the required attributions, and the served licence ledger (/v1/sources) is the canonical record.

---

## 5. Demand evidence for "verified numbers with citations"

- Tow Center/CJR (Mar 2025): 8 AI search tools, 1,600 queries — >60% incorrect citations; >50% of Gemini/Grok-3 responses cited fabricated/broken URLs; premium tiers *more* confidently wrong.
- EBU/BBC (Oct 2025): 3,000 responses, 22 broadcasters, 14 languages — 45% with ≥1 significant issue, 31% sourcing problems.
- UPenn (arXiv 2604.03173, Apr 2026): deep-research agents hallucinate citations at 10.7% (Gemini DR worst at 13.3%); **agentic verification against ground truth cut bad links 6–79×** — the exact mechanic verify_stat implements, for numbers.
- FutureSearch on OpenAI Deep Research (Feb 2025): documented wrong numbers with real sources available (e.g., Cybench 17.5% vs actual 34.5%); Benedict Evans's demo-report Japan-smartphone-share reversal: "If there are mistakes in the table… I can't trust it."
- Scale of the surface: documents/reports ≈ 15% of Claude conversations; written deliverables ≈ 33% (Anthropic Economic Index, Jun 2026). Only 51% of data leaders trust AI-generated insights; top asks are audit trails (53%) and verifiable outputs (51%) (insightsoftware, Jun 2026, n=114).
- No study yet quantifies error rates for economic statistics specifically → publishing that benchmark is a free credibility/marketing asset for an economist (see STRATEGY.md).

---

## 6. Revenue scenarios (stated honestly)

Assumptions: good distribution executed (registry + directories + one successful launch post), maintenance continues, free tier stays. Benchmarks: dev-product freemium conversion ~5% of *account-holders* (anonymous API callers convert far below 1%); Apify "many developers earn over $3k/mo" is the fat tail of ~3,000 devs averaging ~$400–470; documented failures exist (a $0.07/call actor with zero paying users in two weeks; a skills marketplace with 200+ creators and 1 paying subscriber).

| Horizon | Pessimistic (~50–60%) | Base (~30–40%) | Optimistic (~5–10%) |
|---|---|---|---|
| 6 months | heavy anonymous traffic, $0–100/mo | 5–20k installs, first Apify revenue, $100–500/mo | viral launch, $1–3k/mo |
| 12 months | hobby mode, $0–100/mo | $500–2k/mo (Apify + early Pro/consulting spillover) | $3–8k/mo, category default |
| 24 months | abandoned or free-only | $1–3k/mo "passive income, not a SaaS" | $10k+/mo or acquisition/licensing interest |

Expected value ≈ **$300–900/mo at months 12–24**, against ~$12/year hard cost. The realistic upside case is as much *professional* as financial: the tool markets its builder (consulting, commissions, authority in "AI + economic data") while the option on the agent economy stays open.

Key risks: agents call but nobody pays (the mid-2026 asymmetry); death-by-success on free tiers (mitigated: Workers free tier 100k req/day + aggressive caching + Apify as the pressure valve); winner-take-most distribution (mitigated: niche authority + first-mover on verification); platform/spec churn (mitigated: zero-dependency transport isolated in one file; 2026-07-28 spec is *more* stateless, i.e., in this design's direction); maintenance is a real ongoing tax (~52% of MCP servers are already dead — showing up weekly is itself a moat).

---

## 7. Technical facts the build rests on (verified July 24–25, 2026)

- MCP current protocol revision **2025-11-25**; batching removed since 2025-06-18; stateless Streamable HTTP with plain `application/json` responses is fully compliant; session id optional; GET→405; notifications→202; `MCP-Protocol-Version` header validated only when present; lenient `Accept` handling required in practice. The upcoming **2026-07-28** revision removes initialize/sessions entirely — validating the stateless design; transport is isolated in `src/mcp.ts` for that migration.
- Claude accepts no-auth remote MCP URLs on **all plans** (Free: 1 connector); ChatGPT developer mode on paid plans (plus `search`/`fetch` for the connectors path — implemented); Cursor/VS Code: plain URL config; stdio-only clients via `mcp-remote` ≥0.1.16 (CVE-2025-6514 fixed).
- Cloudflare Workers free tier: 100k req/day, 10ms CPU/invocation, 50 subrequests/request, static assets free & unlimited, custom domains on free plan, new Workers Cache GA (July 2026). KV writes (1k/day) are the trap → avoided entirely; caching is edge+memory.
- Upstreams verified live: World Bank v2 (no key, JSON envelope quirks handled), DBnomics v22 (no key; IMF WEO incl. vintages), Frankfurter at `api.frankfurter.dev` (the `.app` host 301s; ~30 ECB currencies), FRED (optional operator key, ~120 req/min unofficial limit).

---

## 8. What was built (decision → artifact map)

| Research finding | Design decision |
|---|---|
| Citation/verification layer is the open gap | Product = citation-first data + `verify_stat`, not another wrapper |
| Apify is the only rail paying indies now | `apify/` actor twin, pay-per-event, bundles the same core |
| Registry publish cascades; README is the listing | `distribution/server.json`, `submissions.md`, README structured as a listing |
| Claude directory needs privacy policy/docs/annotations | `site/privacy.html`, `terms.html`, `docs.html`, read-only tool annotations |
| ChatGPT deep research/company knowledge use the search/fetch pair (no longer universally required for connected servers — see dated note below) | `search` + `fetch` tools with OpenAI-schema outputs |
| Free-tier economics: 10ms CPU, 50 subrequests, KV trap | Zero-dep code, batched WB multi-indicator calls, edge+memory cache, no KV |
| Spec churn (2026-07-28 stateless) | Hand-rolled transport isolated in `src/mcp.ts` |
| Licensing requires attribution | The citation object *is* the compliance mechanism |
| Solo-dev graveyard is real | Tests + live smoke + runbooks so maintenance stays cheap |

Full per-agent source lists are preserved in the research transcripts; the load-bearing links are inline above.

## Dated fact-check notes (v1.3.1 review response, 2026-07-26)

- **OpenAI MCP/ChatGPT connector state** (verified 2026-07-26 against the OpenAI Help Center article "Developer mode and MCP apps in ChatGPT", help.openai.com/en/articles/12584461, page last updated ~2026-07-15, read in a live browser session — the URL 403s automated fetchers): full MCP apps incl. write actions are in beta on **Business/Enterprise/Edu**; **Pro** can connect MCP servers with read/fetch permissions in developer mode; Free/Plus are not listed as having custom-connector access. The FAQ states verbatim that the `search`/`fetch` tool pair is **"No. They are no longer required."** for connected servers — with two carve-outs where the pair still matters: *company knowledge* only includes apps with search/fetch functionality, and *deep research* uses custom apps for read/fetch actions only. `site/docs.html` §1's ChatGPT bullet and `distribution/submissions.md` §8 are written against this state.
- **"146,000+ AI-hallucinated citations" landing-page stat** (verified 2026-07-26): primary source is arXiv 2605.07723 — "LLM hallucinations in the wild: Large-scale evidence from non-existent citations" (Zhao, Wang, Stuart, De Vaan, Ginsparg, Yin; May 2026). The abstract states a "conservative estimate of 146,932 hallucinated citations in 2025 alone" from an audit of 111M references across 2.5M papers. `site/index.html` links the arXiv abstract directly (previously linked secondary press coverage).

## Closed verdicts — 2026-08-07 growth research pass (do not re-research)

From the 12-agent growth research pass (see docs/GROWTH-PLAN-2026-08.md for
the resulting plan). Each verdict below was reached with the cited primary
source; re-open only if the source itself changes.

- **StatGPT** (statgpt.dialx.ai, IMF Departmental Paper 2026/004): live since
  June 2026; LLM→SDMX retrieval for official statistics backed by IMF/WB/OECD/
  Eurostat/BIS/ECB/UN. Breadth-first competition is dead; the verification/
  agent-native/SDMX-gap positions stand. STRATEGY.md now carries the row.
- **UN Comtrade: BLOCKED.** The re-dissemination policy's for-profit trigger is
  the *applicant's* character, not the endpoint tier — StatCite has paid
  surfaces (Apify), so even free-tier ingestion is not clean.
  https://uncomtrade.org/docs/policy-on-use-and-re-dissemination/
- **FRED: permanently dead** (unchanged; AI/ML-use and redistribution clauses
  at fred.stlouisfed.org/legal). Recorded here so no growth pass re-proposes it.
- **World Bank IDS debt series: CLEAN** — same api.worldbank.org endpoint
  (source=6), same CC BY 4.0 summary terms as WDI. Cheapest possible source add.
- **BIS statistics: CLEAN with a condition** — terms permit reproduction/
  redistribution with attribution; a "no charge specifically for the data"
  posture must be recorded in MONETIZATION.md before shipping (charge for the
  audit, never the BIS data). https://www.bis.org/terms_statistics.htm
- **ECB data: CLEAN** — reproduction permitted with attribution.
  https://www.ecb.europa.eu/services/disclaimer/html/index.en.html
- **WHO GHO: PER-INDICATOR check required** — data.who.int terms are CC BY
  with NC-SA exceptions on some datasets; never add WHO wholesale.
- **ILOSTAT: probe first** — licensing workable with attribution, but the SDMX
  API's Worker-compatibility needs a 10-minute probe before any code.
- **IDB Lab: CLOSED for this project** — current programs are loans (USD
  500k–2M) to companies with 3 years of audited financials, not grants to
  individuals. VENTURE-CONTEXT finding 4's IDB Lab line is superseded on this
  point. Re-check only on incorporation with revenue.
- **Cloudflare Project Galileo: SKIP** — eligibility fit is weak and the
  payoff on an already-free tier is null.
- **NLnet NGI Zero Commons: OPEN** — window 2026-09-03 → 2026-11-03, funds
  individuals, no EU-residency requirement. The one live grant path this
  quarter. https://nlnet.nl/propose/
- **OpenAI Researcher Access: DRAFTED** — quarterly review (next September),
  4-6 weeks to credit after decision; application draft exists in the bench
  run directory. Cannot unblock near-term costs.
- **llms.txt: STOP INVESTING** — production crawler data shows ~408 fetches
  across 500M+ AI-bot requests; keep the files (zero cost) but build nothing
  more on them. https://ariashaw.com/does-llms-txt-actually-work
- **Custom GPT (GPT Store): FAILS ZERO-COST** — publishing requires a paid
  ChatGPT plan.
- **Workers Analytics Engine: PAID-GATED** (API error 10089 on this account
  despite free-tier docs); binding stays commented out; the monthly
  bookkeeping sheet is the stand-in.
