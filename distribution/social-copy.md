# Launch copy: ready to adapt

Voice notes: you're a professional economist who built the tool you needed. Lead with the problem (unverifiable numbers in AI output), not the tech. Never overclaim; the evidence is the demo.

**Before posting, re-check the claims.** Counts and coverage change. `python tools/audit-live.py` holds the site to the live service, but this file is not covered by it. The numbers used below, verified 2026-09-02:

- 48 curated indicators, **42 active** (six US-only keys are reserved for FRED and permanently decline). `GET /v1/indicators`
- **Eight** sources served: World Bank, IMF (WEO/Fiscal Monitor plus dated vintages), BIS, ECB (reference rates and Data Portal), the Eastern Caribbean Central Bank, and the Central Bank of Barbados. `GET /v1/sources`
- Anguilla and Montserrat: the World Bank/IMF chain returns no data (422); the ECCB series resolves. That is the coverage claim below, and it is checkable in two curl calls.
- Benchmark Run 1 figures must be quoted as a set of three. The publication covenant forbids quoting the accuracy rate without the confabulation and answer rates beside it, because a model can raise accuracy by declining to answer.
- **No Run 2 number may appear anywhere here** until the vendor courtesy-preview window has elapsed. See `bench/DEVIATIONS.md` item 9.

Use `/docs`, not `/docs.html`. Both resolve, but `/docs` is the canonical URL.

---

## Show HN

Gate cleared: the server is live and the README carries the demo GIF.

**Title:** Show HN: StatCite – economic statistics AI agents can actually cite

**Body:**

I'm an economist. Since AI started drafting half the reports I review, I keep finding the same failure: a plausible number with no defensible source. Wrong year, wrong definition, or off by a decimal.

Rather than assert that, I measured it. I ran a pre-registered benchmark of six models across three vendors on 100 real economic-statistics questions, answered from memory with no tools. The strongest model scored a Within-Tolerance Rate of 82.0%, a Confabulation Rate of 15.5% and an Answer Rate of 97.0%. I quote all three together because that is what my own publication covenant requires: accuracy alone is gameable by declining to answer. Roughly one confidently stated figure in six was outside tolerance, and nothing in the output marked which one. Method, pre-registration, NIST-beacon-seeded question draws, audited ground truth and the deviations log: https://statcite.com/bench

Independent work points the same way: the Tow Center found over 60% of responses failed its source-identification test across a 1,600-query audit of AI search engines (https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php), and a 2026 UPenn preprint measured a 10.7% citation hallucination rate for deep-research agents against 4.8% for search-augmented LLMs (https://arxiv.org/html/2604.03173v1).

So I built StatCite: a free remote MCP server and REST API where every number ships with a licence-grade citation. Source, dataset, series ID, canonical URL, licence, retrieval date, plus ready-to-paste BibTeX and APA derived from those same fields so the reference cannot drift from the prose. And, as far as I've found, the only `verify_stat` tool that checks a claimed figure against the official series and returns match / close / mismatch with diagnostics. It names the failure rather than just flagging it: claim 8.0% for US inflation in 2023 and it answers that the value matches the 2022 figure and the year is probably misattributed.

Data: World Bank WDI, IMF WEO/Fiscal Monitor (current vintage via the IMF's own DataMapper API), BIS policy rates, ECB reference rates, and two regional central banks. 42 active curated indicators, 200+ economies, inflation adjustment, historical FX.

The regional coverage is the part I'd defend hardest. Anguilla and Montserrat are not World Bank reporting economies, so the usual chain returns nothing for them. The Eastern Caribbean Central Bank publishes the series and StatCite serves it with the bank's own definitions and units. For several of these series there is no other citable machine-readable source.

Try it without installing anything:
https://statcite.com/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.1

MCP endpoint (Claude, ChatGPT, Cursor, VS Code, Gemini CLI): https://statcite.com/mcp
In Claude Code the plugin also installs a verify-then-cite skill, which is what makes the model reach for the check before publishing a number rather than merely having the tool available: `/plugin marketplace add asokore/statcite`

A guide to doing the check by hand, without any of this, is at https://statcite.com/guide

It's free (runs on ~zero-cost infra); the stack is a single Cloudflare Worker, hand-rolled stateless MCP, no SDK deps. Curation is economist-opinionated. Government debt defaults to the IMF's general-government gross debt series rather than the patchier WDI central-government series, projections are labelled as projections, and where no source publishes a figure the response says so instead of substituting a neighbour.

Happy to answer questions on the data, the licensing (the citation IS the attribution), the benchmark method, or the MCP implementation.

---

## r/mcp

**Title:** StatCite. Free remote MCP server: official economic stats with full citations + a stat-verification tool

**Body:**

Built by an economist tired of AI-drafted reports with unverifiable numbers.

- `verify_stat`: check any claimed macro figure against the official series → match/close/mismatch + diagnostics + the correct citable value. The diagnostics name the failure: wrong-year, percent-vs-decimal, millions-vs-billions, and a revision check that separates "wrong" from "was right when written, since revised"
- `verify_claims`: fact-check a whole draft in one call, up to 15 claims, one bad claim never sinks the batch
- `get_indicator`: 42 active curated indicators (inflation, GDP, debt/GDP, unemployment…), 200+ economies, World Bank → IMF DataMapper (current vintage) → IMF WEO (DBnomics) fallback chain
- `get_series`: also serves Eastern Caribbean Central Bank and Central Bank of Barbados tables, including Anguilla and Montserrat, which are not World Bank reporting economies
- `country_snapshot`, `inflation_adjust`, `compare_sources`, `fx_convert`
- Every response carries a citation object: source, dataset, series id, canonical URL, licence, retrieval date, a ready-to-paste citation sentence, and BibTeX/APA
- Three prompts appear as slash commands the moment you connect: `fact_check`, `country_brief`, `cite_this_stat`
- Free, no auth, stateless Streamable HTTP: `https://statcite.com/mcp`
- Implements ChatGPT's `search`/`fetch` pair too, so it works in deep-research connectors

Add to Claude: Settings → Connectors → Add custom connector → paste the URL.
Claude Code: `/plugin marketplace add asokore/statcite` then `/plugin install statcite@statcite` (also installs the verify-then-cite skill).
Docs: https://statcite.com/docs — feedback very welcome.

---

## X/Twitter thread (3 posts)

1/ I benchmarked six AI models on 100 real economic-statistics questions, answered from memory. The best scored 82.0% within tolerance, 15.5% confabulation, 97.0% answer rate. All three together, because accuracy alone is gameable by declining to answer. Roughly one confident figure in six was wrong, unmarked. statcite.com/bench

2/ So I built the fix. StatCite: every number ships with its official citation, and verify_stat checks claims against the source. It doesn't just say "wrong", it diagnoses how. Claim 8.0% for US inflation in 2023 and it tells you that's the 2022 figure. Free MCP server: statcite.com

3/ Under the hood: one Cloudflare Worker, zero-dependency stateless MCP. World Bank, IMF, BIS, ECB, plus two Caribbean central banks, so it covers Anguilla and Montserrat where the World Bank has no data at all. REST mirror + OpenAPI for non-MCP stacks. Free. statcite.com/docs

---

## LinkedIn (professional audience)

If your organisation uses AI to draft reports, briefs, or commentary, ask one question: where did the numbers come from?

I stopped guessing at the answer and measured it. In a pre-registered benchmark of six models across three vendors on 100 real economic-statistics questions, answered from memory, the strongest model returned a Within-Tolerance Rate of 82.0%, a Confabulation Rate of 15.5% and an Answer Rate of 97.0%. Those three belong together: accuracy on its own can be raised simply by declining to answer. The practical reading is that roughly one confidently stated figure in six was outside tolerance, with nothing in the output to say which.

Independent research points the same way. The Tow Center found over 60% of responses failed its source-identification test across a 1,600-query audit of AI search engines, and a 2026 UPenn preprint measured a 10.7% citation hallucination rate for deep-research agents.

I built StatCite to close that gap for economic data. It's a free service that AI assistants (Claude, ChatGPT, Cursor) can query for official statistics, where every number arrives with its full citation: source, dataset, series ID, URL, licence, and retrieval date, plus paste-ready BibTeX and APA. Its verify_stat function checks any claimed figure against the official series and flags the classic errors: wrong year, percent-vs-decimal, unit confusion, and figures that were correct before a revision.

Sources are the World Bank, the IMF, the BIS, the ECB, and, unusually, the Eastern Caribbean Central Bank and the Central Bank of Barbados. That last part matters for anyone working on small states: Anguilla and Montserrat are not World Bank reporting economies, so the standard sources return nothing for them.

For analysts: the curation is opinionated in the ways you'd want. WEO general-government debt, ILO-modelled unemployment flagged as such, projections labelled as projections, and an explicit "no published data" rather than a quiet gap.

If you'd rather do the check by hand, the method is written up here: statcite.com/guide

Free to use, no signup: statcite.com

---

## PulseMCP newsletter pitch (short email)

Subject: New server: economic stats with citations + claim verification (by an economist)

Hi. I just published StatCite, a free remote MCP server for official economic statistics where every response carries a full citation object, plus a verify_stat tool that checks claimed figures against official series and returns a verdict with diagnostics (wrong-year, percent-vs-decimal, and a revision check that separates "wrong" from "since revised").

Two things that might make it worth a mention beyond the usual data-server listing. First, I ran a pre-registered benchmark to establish the problem rather than asserting it: six models, three vendors, 100 real economic-statistics questions from memory, with the strongest scoring 82.0% within tolerance alongside a 15.5% confabulation rate and a 97.0% answer rate (the three are quoted together by design). Method and raw outputs are public at https://statcite.com/bench. Second, it serves Eastern Caribbean Central Bank and Central Bank of Barbados data, which covers economies like Anguilla and Montserrat that the World Bank does not report at all.

Built by a professional economist; data from the World Bank, IMF, BIS, ECB and two regional central banks, with licensing handled per source and the attribution carried in every response. Free, no auth: https://statcite.com, MCP: https://statcite.com/mcp. Happy to share anything else you need for a listing.
