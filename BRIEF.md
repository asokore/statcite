# BRIEF — read this first

You are inheriting a project that was researched, designed, built, reviewed, and tested in a single Cowork session on 2026-07-25, then handed to you. This file exists to transfer *context and authority*, not instructions.

**Your mandate is the same as the one that produced this repo: solve the owner's actual problem, using your own judgment, with no obligation to preserve anything here.** If StatCite is the right answer, make it excellent and ship it. If it's the wrong answer, or a partial answer, say so with reasoning and build the better one. The code is an artifact of one session's thinking, not a spec you must obey. Treat every decision below as a rebuttable prior.

Two failure modes to avoid, in order of danger:
1. **Deferring.** Deploying this as-is without evaluating it, because it exists and looks finished. It was built fast. It has gaps (§6, §7).
2. **Churning.** Rewriting working, tested code to match your stylistic preferences, or restarting the strategy from zero. The research in `docs/RESEARCH.md` was real and current; don't redo it, extend it.

---

## 1. What the owner asked for — in his words

> "I want to create something that a lot of people use and that I can make money from, if not now, eventually. If not now, it has to be low-cost for me. I am thinking, but not limiting you to my thinking; you have full autonomy to think of something else if it's better. Those are the tools, plugins, connectors, and/or skills or things that agents need to use to operate that get me traffic from agents who are looking to accomplish tasks and have, if not now, but might even now, have money to use what I have. Whatever it is, do in-depth research on what possible things we can create and create them all on a website and wherever else they are needed so they can be used and paid for. Potentially, it might be one thing or multiple things. I don't want to limit you, but you get the general idea. This is cowork, so create as much as needed so I can hand over to Claude code whatever you can't do, or it can do better, and carry out the work. The name of anything and everything is totally up to you to optimise for the results."
>
> "C:\dev is where I save any new project, but as 1 folder per project, and all this is one project even if multiple things; you can have multiple subfolders inside for each or what you think is best. If you have questions, feel free to ask, but this is really about you thinking it through, solving it, and making the best decisions based on your thorough research and how you will implement it fully to completion and solve problems, etc."

And when handing over to you, he asked explicitly that you be given this brief **without limits** — free to "review what [was done] for improvements and advancements" and to "maybe find better options."

### What that means, decoded

- **Objective:** durable, compounding income or asset value from the AI-agent channel. "Eventually" is acceptable; zero-cost-now is required.
- **Constraint:** near-zero ongoing cost. He has GitHub (paid), Cloudflare, and Apify accounts. Domain money (~$12/yr) is fine. Monthly infra bills are not.
- **Latitude:** total. Naming, architecture, product count, and strategy are all yours. He explicitly invited being overruled — twice.
- **Standard:** "implement it fully to completion and solve problems." He does not want a prototype or a plan. He wants a working thing plus the reasoning behind it.
- **Layout:** one project folder, `C:\dev\statcite`, subfolders as you see fit. If you conclude the portfolio should be several distinct products, they can still live here as subfolders, or you can propose splitting — ask him.

### Who he is (this matters for what's defensible)

Professional economist, chief data analyst / chief data scientist, experienced BI analyst. Works on fiscal policy, economic analysis, formal writing, and public commentary. His stated preference: **accuracy and consistency over speed**; outputs feed reports, briefs, and public commentary.

His `C:\dev` already contains: `FiscalDashboard`, `barbados-property-dashboard`, `asokore-com`, `pifini`, `pokemon`. He has a local Power BI MCP connected. **Read those folders.** There is a strong Caribbean/Barbados fiscal thread in his work that this project currently under-exploits — see §6.3, which I think is the single biggest missed opportunity in what I built.

---

## 2. What exists right now (verified state, not aspiration)

`C:\dev\statcite` — **StatCite**: a free remote MCP server + REST API serving official economic statistics where every number ships with a full citation object, plus `verify_stat`, which checks a claimed figure against the official series and returns a verdict with diagnostics.

| Path | What it is | State |
|---|---|---|
| `server/` | Cloudflare Worker: stateless MCP (hand-rolled JSON-RPC, zero runtime deps) + REST mirror + 42-indicator registry + 4 data adapters | **50/50 tests pass; live smoke passes against real World Bank / DBnomics / Frankfurter APIs** |
| `site/` | statcite.com: landing, docs, llms.txt/llms-full.txt, openapi.json, privacy, terms, 404 | Renders; screenshot verified |
| `apify/` | Pay-per-event actor bundling the same core (`core.bundle.mjs`, committed) | Local core test passes; not pushed |
| `skill/` | Packaged Claude skill teaching verify-then-cite | Written; **never evaluated** (see §7) |
| `distribution/` | `server.json` registry manifest, `submissions.md` (exact steps per channel), `social-copy.md` (launch posts) | Written; unexecuted |
| `docs/` | `RESEARCH.md` (the evidence base), `STRATEGY.md`, `MONETIZATION.md`, `LAUNCH.md` | Current as of 2026-07-25 |
| `HANDOFF.md` | Deployment runbook | Unexecuted |
| `CLAUDE.md` | Working guide + invariants | — |

**Nothing is deployed. No domain is registered. No account has been touched.** The `GITHUB_USERNAME` placeholder is live in two files (`server/package.json`, `distribution/server.json`).

Verify the claims above before trusting them:
```bash
cd C:\dev\statcite\server && npm install && npm test && npm run smoke
```
If either fails, that's your first data point about what I got wrong.

---

## 3. Why these choices — with confidence levels

Full evidence in `docs/RESEARCH.md`. Compressed, with how much I'd stake on each:

| Finding | Confidence | Implication |
|---|---|---|
| Agent tool-call demand is huge and verified; agent *payments* are early and thin (x402: ~$24M/mo across 22k sellers, much of it wash) | **High** | Don't build a business that requires agents to pay per call in 2026 |
| Apify is the only marketplace verifiably paying solo devs at scale ($1.2–1.4M/mo to ~3k devs, 80% share) | **High** | The actor is the near-term revenue path |
| The successful "MCP businesses" are metered SaaS with a free MCP client (Exa, Tavily, Firecrawl) | **High** | Free MCP = distribution, not product |
| AI miscites statistics at measured, persistent rates (>60% CJR; 45% EBU/BBC; 10.7% deep-research hallucinated citations) | **High** | Real, quantified pain |
| No incumbent ships per-number citations or stat verification | **Medium-high** | The gap — but I searched, I didn't exhaust. **Re-check this.** Six months of ecosystem movement could close it |
| Official-registry publish cascades to most directories | **Medium-high** | Distribution is cheap if done properly |
| Expected value ≈ $300–900/mo at 12–24 months, modal outcome $0 | **Medium** | Honest framing; the asymmetry is the ~$12/yr cost |
| "Citation-first economic data" is the best available idea for *this owner* | **Medium** | This is the softest link in the chain. It's a judgment call about fit, not a research finding. Challenge it |

The name "StatCite" was collision-checked on 2026-07-25 (RDAP clear on .com/.dev/.io, no npm/GitHub/company conflict). That check is now stale — **re-verify before spending money.** Fallbacks that also cleared: `statcite.dev`, `statcite.io`, `econcite.com`.

---

## 4. What I would challenge if I were you

Written against my own work, deliberately:

1. **The demand evidence is about *citations in general*, not economic statistics specifically.** I inferred the economic-stats case. Nobody has measured how often AI gets GDP or inflation wrong. That's why `docs/STRATEGY.md` proposes building that benchmark — but note the logic: the marketing asset and the demand proof are the same artifact, which is convenient and therefore suspicious. If you build the benchmark early and error rates turn out *low*, the whole thesis weakens. **Consider running a quick version of that benchmark before investing more.** It's the cheapest possible falsification test, and I should probably have done it first.
2. **`verify_stat` may be a tool humans want and agents don't reach for.** An agent that already has StatCite installed will call `get_indicator` and get the right number — verification is only needed when a number came from elsewhere (memory, a document, a user). That's a real workflow, but narrower than the pitch implies. Watch the actual tool-call mix after launch; if `verify_stat` is under ~15% of calls, the positioning is wrong even if the product is useful.
3. **One product vs. a portfolio.** He asked for "possibly multiple things." I built one deep thing, betting that depth beats breadth for defensibility. The opposite bet — a portfolio of 5–10 small Apify actors — reaches revenue faster and tests more hypotheses per unit of effort, at the cost of brand and compounding. I think depth is right for *this owner* (his edge is domain judgment, not volume), but it's genuinely arguable.
4. **Free-forever may be leaving the easy money on the table.** The research says free-tier-plus-distribution beats paid-from-day-one for agent tools, but the Apify actor could be priced higher and marketed harder as the primary product, with the free tier as a demo.
5. **I optimized for MCP because MCP is where the measurable traffic is.** If your research shows the discovery layer has shifted (WebMCP origin trials, agent-side tool search, whatever landed after July 2026), the same core logic can be re-surfaced cheaply — everything real lives in `server/src/core/` and is transport-agnostic by design.

---

## 5. Deliberate design decisions (so you don't "fix" them by accident)

These look like omissions and aren't. Overrule them freely — just do it knowingly:

- **Zero runtime dependencies, hand-rolled MCP transport.** The Workers free plan gives 10ms CPU per invocation and the MCP spec is churning (the 2026-07-28 revision removes `initialize` and sessions entirely). A dependency-free, stateless implementation isolated in `server/src/mcp.ts` is cheap to run and cheap to migrate. Adding an SDK is a real option — just know what you're buying.
- **No database, no KV writes on request paths.** KV's free tier allows 1,000 writes/day; a request-path write exhausts it before lunch. Caching is memory + Cloudflare edge. This is why there's no usage analytics beyond Cloudflare's dashboard, which is a genuine gap (§7).
- **No auth.** Read-only public data; auth would kill install friction, which is the entire distribution strategy.
- **FRED is optional and secret-gated.** FRED's terms make the API key operator-specific and require a disclaimer. Everything works without it.
- **The citation object's field names are public API.** Renaming them breaks agents that were told (via `llms-full.txt` and the skill) to read them.
- **Attribution strings are licensing compliance,** not decoration. World Bank CC BY 4.0, IMF, ECB, FRED all require attribution; the citation object is how the project complies.
- **IMF WEO projections are labeled as projections** and `latest_only` prefers published outturns. An economist would notice immediately if this broke.

A pre-deploy review found 13 issues including a FRED-key-leak path in error responses. All were fixed with regression tests (`server/test/regressions.test.ts`). Assume more exist — the review was one pass.

---

## 6. Ideas considered and not built — ranked by what I'd do first

**These are the most valuable part of this file.** In rough order of expected payoff:

### 6.1 Revision-aware verification (vintage data) — the biggest product idea I didn't build
Right now `verify_stat` compares a claim against the *currently published* value. But macro data gets revised constantly, so a 2023 report citing 2022 GDP growth was often *correct when written* and looks wrong today. A verifier that distinguishes "this was never right" from "this was right at the time and has since been revised" would be genuinely novel — no one has it, and it's exactly the distinction a professional cares about. FRED's ALFRED provides real-time vintages; IMF WEO ships dated vintages (already visible in the DBnomics dataset codes this repo uses). This could be the real moat rather than a feature.

### 6.2 `verify_report` — verify a whole draft in one call
Accept a block of text, extract every economic claim (indicator + country + period + value), verify each, return an annotated result. This turns a per-number utility into a workflow, matches how people actually work, and is far more compelling in a demo. It's mostly orchestration over what already exists.

### 6.3 Caribbean / small-states depth — the owner-specific edge I under-used
World Bank coverage for small economies is thin and patchy; the owner works on Barbados fiscal data (`C:\dev\FiscalDashboard`, `barbados-property-dashboard`) and knows the national sources, definitions, and their quirks. A "Caribbean economic data" layer — CARICOM members, national statistical offices, central bank releases, correct treatment of pegged currencies — would be defensible in a way that "another World Bank wrapper" never is, because it encodes knowledge that isn't in any API. It's also directly reusable in his existing projects. **If I were choosing one thing to build next, it might be this rather than more breadth.** Ask him.

### 6.4 The AI Economic-Stats Accuracy Benchmark
Described in `docs/STRATEGY.md`. Run the major assistants against ~100 economic-stat questions, verify with StatCite, publish error rates by model, indicator, and country. It doesn't exist anywhere. It is simultaneously: the missing demand proof (§4.1), a press-worthy artifact, a quarterly-repeatable content engine, and a credibility asset for an economist. High leverage, moderate effort. Consider doing it *before* heavy distribution work.

### 6.5 MCP Apps / server-rendered UI
The 2026-07-28 spec formalizes MCP Apps (server-rendered UI in sandboxed iframes). A chart of a series rendered inline in Claude, with the citation attached, would be a visible differentiator in a directory listing full of text-only servers. Verify the current spec status first.

### 6.6 Generalize beyond economics
The citation-and-verification pattern isn't economics-specific — health (WHO), energy (IEA/EIA), climate, demographics all have official APIs and the same hallucination problem. The name and registry were built to allow this. Weigh focus against reach; premature generalization is the classic way to build something no one loves.

### 6.7 An actor portfolio on Apify
The fastest verified path to actual dollars is more actors, not a better single actor. If revenue speed matters more than brand, spin up several small, well-SEO'd data actors reusing this core. Lower ceiling, faster feedback.

### 6.8 Smaller, still worthwhile
Bulk/batch endpoints · CSV output for spreadsheet users · OECD and Eurostat as first-class curated sources (licenses already permit) · a Cowork/Claude Code plugin bundling connector + skill · x402 wiring for optionality · the Cloudflare Monetization Gateway waitlist (free, do it early — it may become the best rail).

---

## 7. Known weak spots and technical debt

- **No usage analytics beyond Cloudflare's dashboard.** You can't see which tools are called or which indicators matter. That's the feedback loop the whole strategy depends on. A cheap fix (Workers Analytics Engine is free-tier friendly; or aggregate counters) is probably worth doing before launch — but keep it privacy-clean, since `site/privacy.html` promises no profiling.
- **No rate limiting.** Fine at zero traffic; add Cloudflare rate rules (free) before any real volume.
- **The skill was never evaluated.** `skill/statcite/SKILL.md` was written but not tested with the skill-creator eval loop. Its description drives triggering; it's unproven.
- **Country resolver is English-only** and hand-maintained (~230 entries + aggregates). No fuzzy matching for typos.
- **`country_snapshot` fixes 11 indicators.** Not configurable.
- **Test fixtures are point-in-time recordings.** `npm run fixtures` re-records; if an upstream changes shape, tests may pass against stale reality. The live smoke script is the real canary — run it monthly.
- **DBnomics is a community aggregator** with no SLA, used for all IMF WEO data. Fallbacks exist but coverage would degrade if it disappeared.
- **Docs duplicate the registry.** The indicator table in `site/docs.html` and the list in `site/llms-full.txt` were generated from `server/src/core/indicators.ts` by hand at build time. Adding indicators means regenerating both. Worth automating into a script if you touch the registry.
- **The Apify actor has never run on the platform.** Only the bundled core was tested locally.

---

## 8. Questions only he can answer — ask before assuming

1. **Is his name going on this?** The strategy leans on economist credibility (`docs/STRATEGY.md` treats the builder as part of the product), but nothing is currently attributed to him and no personal domain/email is wired in. This changes the About page, the launch posts, and the LinkedIn strategy.
2. **Time budget per week.** The maintenance contract assumes ~2–4 hrs/month. Distribution and the benchmark need more, in bursts. If he has an hour a month, prioritize differently.
3. **Public commentary tie-in?** He writes public commentary. Does he want StatCite associated with it (strong distribution) or kept separate (neutral infrastructure)?
4. **Revenue urgency.** "Eventually" was his word — but if he wants dollars within 90 days, the portfolio-of-actors path (§6.7) beats the brand path.
5. **Caribbean focus (§6.3)** — is that the direction, or does he want this deliberately global?
6. **Does he want to keep `hello@statcite.com` as the contact,** or route to a personal address?

---

## 9. Legitimate paths forward — all of these are fine

- **Ship it.** Verify tests, register the domain, follow `HANDOFF.md`, execute `distribution/submissions.md`. Fastest path to real-world feedback, which beats more analysis. Add analytics (§7) first so the feedback is legible.
- **Sharpen, then ship.** Add one differentiator from §6 (I'd pick 6.2 or 6.1) so the launch lands harder. Costs days, may double the impact of the one launch you get.
- **Falsify, then decide.** Run a quick version of the benchmark (§6.4) against a handful of models. If AI is already accurate on economic stats, say so plainly and pivot — that's a *good* outcome, cheaply obtained.
- **Pivot.** If your own research (re-verify §3's medium-confidence rows) says the gap closed or the channel shifted, propose the better idea with evidence. The reusable assets are `server/src/core/` (clean, tested, transport-agnostic), the citation architecture, and the entire distribution kit — most of it is domain-agnostic.

Whatever you choose: **tell him what you chose and why, in plain language, before doing hours of work.** He asked for judgment, not obedience — but he also wants to know what's happening to his project.

---

## 10. Working agreements

- **Verification standard is high.** He is an economist; wrong numbers are the one unrecoverable failure. Keep `npm test` green, run `npm run smoke` after touching `core/` or adapters, and keep the smoke script honest (it hits real APIs deliberately).
- **If you change `server/src/core/`,** rebuild the actor bundle: `cd apify && npm run build:core`.
- **Don't silently break the invariants in `CLAUDE.md`** (citation on every numeric payload, attribution strings, projection labeling, stable registry keys). Break them deliberately, with a note.
- **Re-verify anything time-sensitive.** The research is dated 2026-07-25 and the MCP ecosystem moves weekly. Sources are linked in `docs/RESEARCH.md` — extend it rather than starting over, and update it when you learn something that contradicts it.
- **Cost discipline:** nothing that bills monthly without asking him first.
- **Write down what you learn.** `docs/RESEARCH.md` is the shared brain. Future sessions (his and yours) depend on it.

---

## 11. A reasonable first session

Not a prescription — a default if you want one:

1. Read `docs/RESEARCH.md`, then `CLAUDE.md`. Skim `server/src/core/verify.ts` and `server/src/tools.ts` — that's where the product's actual opinion lives.
2. Run `npm test` and `npm run smoke`. Confirm reality matches §2.
3. Look at `C:\dev\FiscalDashboard` and `C:\dev\barbados-property-dashboard` — understand what he actually works on. §6.3 may look different afterward.
4. Spot-check the two medium-confidence claims: is anyone shipping per-number citations or stat verification *now*? Has the MCP distribution landscape shifted?
5. Form your own view. Tell him: what you'd keep, what you'd change, what you'd add, what you'd kill — and what you recommend doing first.
6. Then build it.

The bar is not "did you follow the handoff." The bar is: **a year from now, is this thing being used, and is it worth more than it cost?** Everything in this repo is in service of that, and all of it is negotiable.
