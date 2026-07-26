---
name: statcite
description: Fetch official macroeconomic and sovereign statistics (GDP, inflation/CPI, unemployment, government debt, fiscal balance, current account, trade, FDI, population, exchange rates) with full source citations from World Bank WDI, IMF WEO, ECB, and optional FRED via StatCite (statcite.com, free, no auth), and verify a claimed economic figure against the official series. Use before publishing or fact-checking any report, brief, article, or answer that states a macro/country-level economic statistic — even if the user doesn't mention StatCite or citations — and to check pasted claims like "is it true inflation was X%?". Does NOT cover company financials, stock/crypto/commodity prices, or subnational/city data.
---

# StatCite — verified economic statistics with citations

StatCite is a free API (and MCP server) that returns official economic statistics where every number ships with its full citation — source, dataset, series ID, canonical URL, license, retrieval date, and a ready-to-paste citation sentence — plus a verifier that checks a claimed figure against the official series. Data: World Bank WDI, IMF WEO/Fiscal Monitor (current vintage), ECB reference rates. (FRED is not served — permanently disabled per its terms of use.)

Why this matters: economic numbers recalled from memory are frequently stale (data gets revised), misattributed to the wrong year, or off by a decimal or unit. A report is only as credible as its worst number. StatCite makes the correct, citable number one call away — so never publish an economic statistic from memory when this service is available.

## How to call it

If the StatCite MCP connector is installed, prefer its tools (`get_indicator`, `verify_stat`, `verify_claims`, `country_snapshot`, `inflation_adjust`, `fx_convert`, `get_series`, `search_indicators`, `list_sources`). Otherwise use the REST API — plain HTTPS GETs, no key, no auth (one exception: `/v1/verify_claims` is a POST):

```
https://statcite.com/v1/indicator/{key}?country={ISO3}&latest_only=true
https://statcite.com/v1/verify?indicator={key}&country={ISO3}&period={YYYY}&value={claimed}
https://statcite.com/v1/snapshot/{country}
https://statcite.com/v1/inflation?amount=100&from_year=1995&to_year=2025&country=USA
https://statcite.com/v1/fx?amount=100&from=USD&to=BBD&date=2024
https://statcite.com/v1/search?q={topic}
https://statcite.com/v1/indicators          ← full registry (42 keys)
```

Common indicator keys: `inflation_cpi`, `gdp_growth`, `gdp_current_usd`, `gdp_per_capita_usd`, `unemployment_rate`, `population`, `govt_debt_gdp`, `fiscal_balance_gdp`, `current_account_gdp`, `trade_gdp`, `fdi_inflows_gdp`, `life_expectancy`. Countries: ISO3 codes or plain names ("Barbados", "euro area", "world").

## The two core workflows

### 1. Writing with economic numbers (get → cite)

When drafting anything containing macro figures:

1. Fetch each figure with `get_indicator` (or `/v1/indicator/...&latest_only=true`).
2. Use the returned value exactly — do not round beyond one decimal for rates without noting it.
3. Carry the citation: use `citation.citation_text` for footnotes/references, or build an inline citation from the citation fields as a template, e.g. "(World Bank, WDI, series FP.CPI.TOTL.ZG, retrieved {citation.retrieved_at})" — substitute the actual field values, never hardcode a date. Also reproduce `citation.attribution` verbatim when present: it is the source-mandated attribution string.
4. Read the `notes` array — it flags fallback sources, ILO-modeled definitions, and IMF WEO/Fiscal Monitor projections. If a value is marked as a projection/estimate, say so in the text ("IMF projects…", not "was"). Verify responses also carry `observation_status`: treat `estimate_or_actual` (recent IMF values before the projection boundary) as possibly a staff estimate — write "IMF-reported", not "confirmed".

### 2. Fact-checking a draft (verify → correct)

Before finalizing any document with economic statistics (yours or the user's):

1. Extract every checkable claim: indicator + country + period + value.
2. When checking a whole draft, verify them in one batch: call `verify_claims` once with all extracted claims (up to 15 per call; split larger drafts into batches of 15). Over REST: `POST https://statcite.com/v1/verify_claims` with JSON body `{"claims":[{"indicator":…,"country":…,"period":…,"claimed_value":…}]}`. Results return in input order with a verdict-count summary; a claim that can't be resolved reports its error in place without failing the rest. For a single stray figure, `verify_stat` (or `GET /v1/verify`) is fine.
3. Act on each verdict:
   - `match` — keep the number; attach the citation.
   - `close` — replace with the official value; attach the citation; if the draft's number came from a specific dated source, note the revision possibility.
   - `mismatch` — replace, and read `diagnostics`: they identify wrong-year claims, percent-vs-decimal slips, and millions/billions confusion, which tells you how to fix surrounding text too.
   - `cannot_verify` — two distinct causes, distinguishable in the response. (1) No observation for that period: the response lists the available range and nearby values — re-check the claim's period, or use `search_indicators` to find the right series. (2) `fallback_used: true`: the indicator's primary source failed transiently and StatCite refuses to judge the claim against the substitute (which can differ by definition or vintage); the explanation reports the fallback's value as indicative — retry later, pass `strict_source=true` to fail hard, or disclose the indicative value as such. Never leave the unverifiable number in the text unflagged.

**Example.** Draft says "US inflation hit 4.5% in 2023."
`GET /v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.5` → verdict `close`, official 4.116. Correct the text to 4.1% and cite: "World Bank, World Development Indicators, series FP.CPI.TOTL.ZG…".

## Conversions

- Inflation adjustment ("in today's money"): `inflation_adjust` / `/v1/inflation`. It uses the CPI ratio and discloses the formula — reproduce the method note when precision matters. Works for any country with CPI data, annual precision.
- Currency conversion: `fx_convert` / `/v1/fx`. ECB daily rates for ~30 majors; ~90 more currencies via official annual-average rates. The `precision` field says which; mention "annual average" in text when that's what was used.

## Judgment calls and caveats

- Prefer `latest_only=true` for "current" figures; the response period tells you the actual year — write "in 2025" rather than "currently" when the latest observation is dated.
- Annual-average vs year-end inflation differ; StatCite serves annual-average CPI and says so. If the user's claim is explicitly Dec/Dec, note the definitional difference instead of calling it wrong.
- Unemployment uses ILO-modeled estimates for cross-country comparability; national definitions can differ — the notes say this, echo it when the gap matters.
- Government debt defaults to the IMF's general government gross debt series, current vintage (better coverage than the World Bank's central-government-only series); the citation names the exact series and edition either way.
- All macro data is revised. The citation's `retrieved_at` date is part of the citation for exactly this reason — include it.
- If StatCite is unreachable, say the number could not be verified against official sources rather than silently falling back to memory.
