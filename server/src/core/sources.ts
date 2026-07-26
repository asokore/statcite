// Static source metadata for the list_sources tool and /v1/sources.

export const SOURCES = [
  {
    id: "worldbank",
    name: "World Bank — World Development Indicators",
    coverage: "~1,400 annual indicators, 200+ economies, many from 1960",
    access: "No key; queried live from api.worldbank.org v2",
    license: "CC BY 4.0",
    attribution_required: "The World Bank: World Development Indicators: <series name>",
    url: "https://data.worldbank.org",
    terms_url: "https://data.worldbank.org/summary-terms-of-use",
  },
  {
    id: "imf_weo",
    name: "IMF — World Economic Outlook & Fiscal Monitor (via the IMF DataMapper API, with DBnomics as fallback)",
    coverage:
      "Growth, fiscal, external indicators for 190+ economies, incl. estimates/projections; twice-yearly vintages (April/October, plus interim Updates). The primary path is the IMF's own DataMapper API — the current edition, verbatim edition label passed through unrewritten. If that path is unavailable, StatCite falls back to the newest edition DBnomics has ingested, which can lag the IMF's release calendar; every response cites the resolved vintage, and a fallback that crosses editions is disclosed (verify_stat demotes such cases to cannot_verify rather than judging a claim against a superseded vintage). The actual/projection boundary is a heuristic derived from each response's own data horizon, not a per-country authoritative cutoff",
    access: "No key; queried live from www.imf.org/external/datamapper (primary) and api.db.nomics.world v22 (fallback)",
    license:
      "Use and redistribution are subject to the IMF's data-usage terms, including attribution and downstream-user conditions; commercial reuse may require IMF permission — consult the IMF terms directly",
    attribution_required: "Source: International Monetary Fund",
    url: "https://www.imf.org/en/Publications/WEO",
    terms_url: "https://www.imf.org/external/terms.htm",
  },
  {
    id: "ecb_fx",
    name: "European Central Bank — euro foreign exchange reference rates (via Frankfurter)",
    coverage: "~30 major currencies, daily since 1999",
    access: "No key; queried live from api.frankfurter.dev",
    license: "Published for information purposes; reuse with attribution; not transaction rates",
    attribution_required: "Source: European Central Bank euro foreign exchange reference rates",
    url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    terms_url: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
  },
  {
    id: "fred",
    name: "Federal Reserve Bank of St. Louis — FRED (optional)",
    coverage: "US and international series incl. monthly CPI, unemployment, rates (active only when the server operator configures a free FRED API key)",
    access: "Requires the operator's FRED API key",
    license:
      "FRED API Terms of Use — disabled by default on this server; an operator enabling it must review the current FRED terms first (they include restrictions relevant to caching, redistribution, and AI/software use) and note that some series are owned by third parties",
    attribution_required:
      "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.",
    url: "https://fred.stlouisfed.org",
    terms_url: "https://fred.stlouisfed.org/docs/api/terms_of_use.html",
  },
  {
    id: "dbnomics",
    name: "DBnomics (aggregator)",
    coverage: "Tens of millions of series from 90+ official providers (IMF, OECD, Eurostat, ECB, BIS, national statistical offices)",
    access: "No key; open aggregator — upstream provider licenses flow through",
    license: "Per underlying provider",
    attribution_required: "Cite the underlying provider (StatCite citations do this automatically)",
    url: "https://db.nomics.world",
    terms_url: "https://docs.db.nomics.world/",
  },
] as const;
