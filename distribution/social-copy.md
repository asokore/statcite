# Launch copy — ready to adapt

Voice notes: you're a professional economist who built the tool you needed. Lead with the problem (unverifiable numbers in AI output), not the tech. Never overclaim; the evidence is the demo.

---

## Show HN (post when the server is live and the README has a demo GIF)

**Title:** Show HN: StatCite – economic statistics AI agents can actually cite

**Body:**

I'm an economist. Since AI started drafting half the reports I review, I keep finding the same failure: a plausible number with no defensible source — wrong year, wrong definition, or off by a decimal. Studies back this up (Tow Center found >60% of AI search answers had citation problems; a 2026 UPenn study measured 10.7% hallucinated citations for deep-research agents).

So I built StatCite: a free remote MCP server + REST API where every number ships with a license-grade citation — source, dataset, series ID, canonical URL, license, retrieval date — and, as far as I've found, the only `verify_stat` tool that checks a claimed figure against the official series and returns match / close / mismatch with diagnostics (wrong-year, percent-vs-decimal, millions-vs-billions).

Data: World Bank WDI, IMF WEO/Fiscal Monitor (current vintage, via the IMF's own DataMapper API), ECB reference rates. 36 active curated indicators, 200+ economies, inflation adjustment, historical FX (including ~90 currencies the ECB set doesn't cover — pegged Caribbean currencies convert exactly).

Try it without installing anything:
https://statcite.com/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.1

MCP endpoint (works in Claude/ChatGPT/Cursor/VS Code): https://statcite.com/mcp

It's free (runs on ~zero-cost infra); the stack is a single Cloudflare Worker, hand-rolled stateless MCP, no SDK deps. Curation choices are economist-opinionated — e.g., government debt defaults to the IMF's general-government gross debt series (current vintage) rather than the patchier WDI central-government series, and WEO/Fiscal Monitor projections are labeled as projections.

Happy to answer questions on the data, the licensing (everything is redistributable-with-attribution — the citation IS the attribution), or the MCP implementation.

---

## r/mcp

**Title:** StatCite — free remote MCP server: official economic stats with full citations + a stat-verification tool

**Body:**

Built by an economist tired of AI-drafted reports with unverifiable numbers.

- `verify_stat`: check any claimed macro figure against the official series → match/close/mismatch + diagnostics + the correct citable value
- `get_indicator`: 36 active curated indicators (inflation, GDP, debt/GDP, unemployment…), 200+ economies, World Bank → IMF DataMapper (current vintage) → IMF WEO (DBnomics) fallback chain
- `country_snapshot`, `inflation_adjust`, `fx_convert` (ECB daily + ~90 exotic currencies via official annual rates)
- Every response carries a citation object: source, dataset, series id, canonical URL, license, retrieval date, ready-to-paste citation sentence
- Free, no auth, stateless Streamable HTTP: `https://statcite.com/mcp`
- Implements ChatGPT's `search`/`fetch` pair too, so it works in deep-research connectors

Add to Claude: Settings → Connectors → Add custom connector → paste the URL.
Docs: https://statcite.com/docs.html — feedback very welcome.

---

## X/Twitter thread (3 posts)

1/ AI agents write reports full of economic numbers. Measured hallucination rate for citations in deep-research agents: ~10%. My fix: StatCite — every number ships with its official citation, and there's a verify_stat tool that checks claims against the source. Free MCP server: statcite.com

2/ The part I care about as an economist: verify_stat doesn't just say "wrong". It diagnoses HOW it's wrong — claim matches last year's value? percent-vs-decimal slip? millions vs billions? — and returns the correct figure with the citation attached.

3/ Under the hood: one Cloudflare Worker, zero-dependency stateless MCP, World Bank + IMF WEO/Fiscal Monitor + ECB data (redistributable per each source's terms — the citation carries the required attribution and license for every number). REST mirror + OpenAPI for non-MCP stacks. Free. statcite.com/docs.html

---

## LinkedIn (professional audience)

If your organization uses AI to draft reports, briefs, or commentary, ask one question: where did the numbers come from?

The evidence on AI-cited statistics is not reassuring — the Tow Center found citation problems in over 60% of AI search answers, and 2026 research measured ~10% fabricated citations from deep-research tools.

I built StatCite to close that gap for economic data. It's a free service that AI assistants (Claude, ChatGPT, Cursor) can query for official statistics — World Bank, IMF, ECB — where every number arrives with its full citation: source, dataset, series ID, URL, license, and retrieval date. Its verify_stat function checks any claimed figure against the official series and flags the classic errors: wrong year, percent-vs-decimal, unit confusion.

For analysts and economists: the indicator curation is opinionated in the ways you'd want (WEO general-government debt, ILO-modeled unemployment flagged as such, projections labeled as projections).

Free to use, no signup: statcite.com

---

## PulseMCP newsletter pitch (short email)

Subject: New server: economic stats with citations + claim verification (by an economist)

Hi — I just published StatCite, a free remote MCP server for official economic statistics where every response carries a full citation object, plus a verify_stat tool that checks claimed figures against official series (verdict + diagnostics like wrong-year and percent-vs-decimal). Built by a professional economist; data from World Bank/IMF/ECB with licensing handled via attribution. Might interest readers doing deep-research or report workflows: https://statcite.com — MCP: https://statcite.com/mcp. Happy to share anything else you need for a listing.
