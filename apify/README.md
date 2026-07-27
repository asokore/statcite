# StatCite — Economic Data & Stat Verification (with citations)

**Official economic statistics where every number ships with its citation — plus a verifier that checks any claimed figure against the official series.** Built and curated by a professional economist.

AI agents and analysts constantly need macro numbers they can defend: GDP growth, inflation, unemployment, government debt, exchange rates. This actor returns the official value **and the receipt** — source, dataset, series ID, canonical URL, license, retrieval date, and a ready-to-paste citation sentence.

## What it does

| Operation | What you get |
|---|---|
| `indicator` | Values for any of **36 active curated indicators** (inflation, GDP growth, debt/GDP, current account, FDI, …) for **200+ economies**, with citation |
| `verify` | **Check a claimed figure** against the official series → `match / close / mismatch / cannot_verify`, with diagnostics (wrong year? percent-vs-decimal? millions-vs-billions?) and the correct citable value |
| `snapshot` | 11 headline indicators for one country, each with its own citation — instant country brief |
| `inflation` | "What is \$100 (1995) worth in 2025 money?" — CPI-ratio method, formula disclosed, any country |
| `fx` | Currency conversion: ECB daily reference rates (~30 majors since 1999) + official annual rates for ~90 more currencies (BBD, XCD, JMD, KES…) |
| `series` | Raw access: `worldbank/CODE`, `dbnomics/IMF/WEO:latest/...` |
| `search` / `registry` | Discover indicators and datasets |

## Sources

World Bank World Development Indicators (CC BY 4.0) · IMF World Economic Outlook & Fiscal Monitor via the IMF's own DataMapper API (current vintage, DBnomics as fallback) · ECB euro reference rates. Data is fetched live from official APIs — this actor adds no numbers of its own, and labels IMF projections as projections.

## Example: verify a stat before publishing

Input:

```json
{ "operation": "verify", "indicator": "inflation_cpi", "country": "USA", "period": "2023", "claimed_value": 4.1 }
```

Output (dataset item):

```json
{
  "ok": true,
  "result": {
    "verdict": "match",
    "official_value": 4.116338,
    "explanation": "Claimed 4.1 vs official 4.1163 % for 2023 — consistent (within normal rounding).",
    "citation": {
      "source": "World Bank",
      "series_id": "FP.CPI.TOTL.ZG",
      "source_url": "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=USA",
      "license": "CC BY 4.0",
      "citation_text": "World Bank, World Development Indicators, series FP.CPI.TOTL.ZG (Inflation, consumer prices, annual %) …"
    }
  }
}
```

## Batch mode

Pass `items` (array of parameter objects, each may set its own `operation`) to run many queries in one call — one pay-per-event charge per **successful** item; failures are free and reported per item.

```json
{
  "operation": "indicator",
  "items": [
    { "operation": "verify", "indicator": "gdp_growth", "country": "Guyana", "period": "2022", "claimed_value": 62.3 },
    { "operation": "indicator", "indicator": "govt_debt_gdp", "country": "Japan", "latest_only": true },
    { "operation": "fx", "amount": 1000, "from": "USD", "to": "JMD", "date": "2023" }
  ]
}
```

## Pricing

Pay per successful query event — failures are never charged. Two event tiers:

| Event | Operations | Why |
|---|---|---|
| `statcite-lookup` | `indicator`, `series`, `snapshot`, `inflation`, `fx`, `search`, `registry` | A cited value lookup — cheap, high-volume |
| `statcite-verify` | `verify` | Checks a claimed figure against the official series with diagnostics — the differentiated capability, priced higher |

A generous free web tier of the same engine exists at [statcite.com](https://statcite.com) (MCP + REST); this actor is for pipelines that want Apify-managed runs, storage, scheduling, and invoicing.

## Use from AI agents (MCP)

Via the [Apify MCP server](https://mcp.apify.com), agents can discover and call this actor directly. There is also a free hosted MCP endpoint at `https://statcite.com/mcp`.

## Support

hello@statcite.com · [statcite.com/docs.html](https://statcite.com/docs.html)
