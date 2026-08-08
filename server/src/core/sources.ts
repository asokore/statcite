// Static source metadata for the list_sources tool and /v1/sources.
//
// LICENCE LEDGER (GROWTH-PLAN Phase 1): every source carries an explicit
// licence verdict, the basis for it, and the date it was last verified against
// the source's own terms page. REFUSED sources are listed too — declining a
// source for licensing reasons is product information, not an internal detail,
// and it pre-answers the diligence questions grant/DPG reviewers ask. House
// rule this file encodes: a source enters the registry ONLY after its ledger
// entry exists with a "served" verdict.

import { IMF_LICENSE } from "./citations.ts";

/**
 * served      — StatCite serves this source's data under the stated licence.
 * flow_through— aggregator; the underlying provider's licence governs each series.
 * refused     — evaluated and deliberately NOT served; license_note says why.
 */
export type LicenseVerdict = "served" | "flow_through" | "refused";

export const SOURCES = [
  {
    id: "worldbank",
    name: "World Bank — World Development Indicators",
    coverage: "~1,400 annual indicators, 200+ economies, many from 1960",
    access: "No key; queried live from api.worldbank.org v2",
    license: "CC BY 4.0",
    license_verdict: "served" as LicenseVerdict,
    license_note:
      "Summary Terms of Use license datasets under CC BY 4.0: free to copy, distribute, adapt and build upon, including commercially, with attribution.",
    license_verified_on: "2026-08-07",
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
    license: IMF_LICENSE,
    license_verdict: "served" as LicenseVerdict,
    license_note:
      "IMF site content may be quoted/reproduced with attribution for non-commercial-scale use; commercial-scale downstream reuse of IMF data may require IMF permission — StatCite discloses this caveat on every IMF citation rather than claiming blanket free reuse.",
    license_verified_on: "2026-07-26",
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
    license_verdict: "served" as LicenseVerdict,
    license_note:
      "ECB disclaimer permits reproduction with source attribution; the reference rates are explicitly informational, and StatCite labels them as reference (not transaction) rates.",
    license_verified_on: "2026-07-25",
    attribution_required: "Source: European Central Bank euro foreign exchange reference rates",
    url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    terms_url: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
  },
  {
    id: "dbnomics",
    name: "DBnomics (aggregator)",
    coverage: "Tens of millions of series from 90+ official providers (IMF, OECD, Eurostat, ECB, BIS, national statistical offices)",
    access: "No key; open aggregator — upstream provider licenses flow through",
    license: "Per underlying provider",
    license_verdict: "flow_through" as LicenseVerdict,
    license_note:
      "Aggregator: each served series inherits its underlying provider's licence, and the citation object names that provider. StatCite only routes providers through DBnomics whose own terms permit it (currently IMF).",
    license_verified_on: "2026-07-25",
    attribution_required: "Cite the underlying provider (StatCite citations do this automatically)",
    url: "https://db.nomics.world",
    terms_url: "https://docs.db.nomics.world/",
  },
  {
    id: "bis",
    name: "Bank for International Settlements — central bank policy rates",
    coverage: "Policy rates for ~38 central banks (the rate that best captures each monetary authority's policy stance), monthly and daily, via the BIS SDMX API",
    access: "No key; queried live from stats.bis.org/api/v2 (SDMX-JSON via Accept header)",
    license: "BIS statistics may be reproduced and redistributed with attribution; see the BIS terms and conditions for statistics",
    license_verdict: "served" as LicenseVerdict,
    license_note:
      "The BIS terms for statistics permit reproduction and redistribution with attribution to the BIS. StatCite charges for the audit/convenience layer, never for BIS data standalone, and attributes the BIS on every response.",
    license_verified_on: "2026-08-08",
    attribution_required: "Source: Bank for International Settlements",
    url: "https://data.bis.org/topics/CBPOL",
    terms_url: "https://www.bis.org/terms_statistics.htm",
  },
  {
    id: "ecb_data",
    name: "European Central Bank — Data Portal (euro-area monetary statistics)",
    coverage: "Euro-area harmonised inflation (HICP) and related monetary series via the ECB Data Portal SDMX API",
    access: "No key; queried live from data-api.ecb.europa.eu (SDMX-JSON)",
    license: "ECB content may be reproduced with attribution; see the ECB disclaimer and copyright notice",
    license_verdict: "served" as LicenseVerdict,
    license_note:
      "The ECB's copyright notice permits reproduction of its published content with attribution to the ECB as source. Distinct from the ecb_fx entry, which covers the euro reference exchange rates served via Frankfurter.",
    license_verified_on: "2026-08-08",
    attribution_required: "Source: European Central Bank",
    url: "https://data.ecb.europa.eu",
    terms_url: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
  },
  // ------------------------------------------------------------------
  // REFUSED sources — evaluated, declined, and disclosed. These entries
  // exist so the refusal reasoning is public and machine-readable, and so
  // no future session re-litigates them without new terms to point at.
  // ------------------------------------------------------------------
  {
    id: "fred",
    name: "Federal Reserve Bank of St. Louis — FRED (permanently disabled)",
    coverage: "Not served. The FRED Services Terms of Use, clauses (p) and (q), prohibit use in connection with training or running AI/ML/LLM systems and prohibit storing, caching or archiving FRED content, which conflicts with how this service serves data — there is no compliant way to offer it here.",
    access: "Disabled — the six US-only registry keys and the fred/ series id are recognized but always decline",
    license: "FRED Services Terms of Use, clauses (p) and (q) — see https://fred.stlouisfed.org/legal/",
    license_verdict: "refused" as LicenseVerdict,
    license_note:
      "Clauses (p)/(q) prohibit AI/ML/LLM-connected use and prohibit storing/caching/archiving content. StatCite is an AI-agent-facing service that edge-caches responses, so serving FRED is not compliant even with an operator key.",
    license_verified_on: "2026-07-26",
    attribution_required: "Not applicable — no FRED content is served.",
    url: "https://fred.stlouisfed.org",
    terms_url: "https://fred.stlouisfed.org/legal/",
  },
  {
    id: "un_comtrade",
    name: "UN Comtrade (trade statistics) — not served",
    coverage: "Not served. Detailed bilateral trade statistics exist here, but re-dissemination is licence-gated in a way StatCite cannot satisfy at zero cost.",
    access: "Not integrated; evaluated and declined",
    license: "UN Comtrade policy on use and re-dissemination",
    license_verdict: "refused" as LicenseVerdict,
    license_note:
      'The policy states "To re-disseminate UN Comtrade data, a user must be an active premium subscriber" and prices "for-profit data extraction and/or streaming application[s]" under a licensing fee. StatCite has paid surfaces (the Apify actor), so even free-tier ingestion would sit on the for-profit side of that line.',
    license_verified_on: "2026-08-08",
    attribution_required: "Not applicable — no UN Comtrade content is served.",
    url: "https://comtradeplus.un.org",
    terms_url: "https://uncomtrade.org/docs/policy-on-use-and-re-dissemination/",
  },
  {
    id: "eccb",
    name: "Eastern Caribbean Central Bank statistics — not served",
    coverage: "Not served. ECCU monetary and financial statistics are published by the ECCB, but its website terms do not permit the redistribution this service would perform.",
    access: "Not integrated; evaluated and declined",
    license: "ECCB website terms of use",
    license_verdict: "refused" as LicenseVerdict,
    license_note:
      "The ECCB's website terms (linked from its site footer; deep URLs on the site change) restrict reproduction/redistribution of site content without permission; serving its statistics through a caching public API is redistribution. Declined unless and until written permission exists.",
    license_verified_on: "2026-07-31",
    attribution_required: "Not applicable — no ECCB content is served.",
    url: "https://www.eccb-centralbank.org",
    terms_url: "https://www.eccb-centralbank.org",
  },
  {
    id: "cbb",
    name: "Central Bank of Barbados statistics — not served",
    coverage: "Not served. The Central Bank of Barbados publishes monetary and financial statistics, but its website terms do not permit the redistribution this service would perform.",
    access: "Not integrated; evaluated and declined",
    license: "Central Bank of Barbados website terms of use",
    license_verdict: "refused" as LicenseVerdict,
    license_note:
      "The Bank's website terms (linked from its site footer; deep URLs on the site change) restrict reproduction/redistribution of site content without permission; serving its statistics through a caching public API is redistribution. Declined unless and until written permission exists.",
    license_verified_on: "2026-07-31",
    attribution_required: "Not applicable — no Central Bank of Barbados content is served.",
    url: "https://www.centralbank.org.bb",
    terms_url: "https://www.centralbank.org.bb",
  },
] as const;
