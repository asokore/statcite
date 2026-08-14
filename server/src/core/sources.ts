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
      "The IMF's SPECIAL TERMS for published statistical data (effective 2024-10-11) expressly permit copying, redistribution, derivative works and use with attribution — a separate, more permissive regime than the general IMF Content terms, opening \"Notwithstanding the general prohibition on the commercial use of IMF Content...\". Named datasets include the WEO database, IFS, BOP, DOT, GFS, Primary Commodity Prices and data on the iData Portal. Conditions StatCite must meet: attribute in the IMF's format (database + link); never alter data in ways affecting accuracy, and declare material transformation; communicate these terms downstream to StatCite's own users (met via this ledger, /v1/sources and the licence field on every citation); and, where data is sold as a standalone product, tell purchasers it is free from the IMF (met in the Apify actor listing). Corrected 2026-08-10: the previous note claimed commercial reuse 'may require IMF permission', which conflated the Content regime with the Data regime and both understated the permission and overstated the restriction.",
    license_verified_on: "2026-08-10",
    attribution_required: "Source: International Monetary Fund, <database name>, <link to the dataset>",
    url: "https://www.imf.org/en/Publications/WEO",
    terms_url: "https://www.imf.org/en/About/copyright-and-terms",
  },
  {
    id: "imf_sdmx_vintage",
    name: "IMF — dated World Economic Outlook vintages (api.imf.org, SDMX 3.0)",
    coverage:
      "Frozen dated WEO editions published as first-party SDMX 3.0 dataflows. Used ONLY by the dated-vintage path (as_of verification and the revision probe), never by the live chain, and only for editions enumerated in IMF_VINTAGE_FLOWS from the live dataflow listing. The IMF exposes a small number of recent vintages, not an archive — DBnomics remains the deep historical fallback back to 2010-04, so this source narrows the newest-edition gap rather than replacing the aggregator",
    access: "No key and no account; api.imf.org serves this data anonymously (verified 2026-08-10). The sign-in wall on portal.api.imf.org guards the developer console, not the data. Rate limits are undocumented outside that console and no RateLimit/Retry-After headers are returned; a 31-request unpaced burst was accepted without throttling (2026-08-10), which establishes headroom rather than an absence of limits. StatCite issues one upstream call per as_of/revision-probe lookup, cached one hour",
    license: IMF_LICENSE,
    license_verdict: "served" as LicenseVerdict,
    license_note:
      "Governed by the same IMF special terms for statistical data as imf_weo — the WEO database is named in them explicitly, and the delivery endpoint does not change the licence on the data. The api.imf.org service itself imposes no additional terms on anonymous use: the API-management terms sit behind the portal sign-in and govern subscription keys, which StatCite does not hold and does not need. Verified by direct anonymous call, 2026-08-10.",
    license_verified_on: "2026-08-10",
    attribution_required: "Source: International Monetary Fund, <database name>, <link to the dataset>",
    url: "https://data.imf.org/",
    terms_url: "https://www.imf.org/en/About/copyright-and-terms",
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
      "Aggregator: each served series inherits its underlying provider's licence, and the citation object names that provider. The CURATED registry routes only IMF series through DBnomics. The raw get_series escape hatch (dbnomics/PROVIDER/... ids) passes any DBnomics-hosted provider through on flow-through terms: the citation names the provider and states that its terms apply, and StatCite has NOT individually verified every provider's licence — consumers of non-IMF dbnomics/ series must check the named provider's own terms before republishing. Corrected 2026-08-10: the previous note claimed only permitted providers were routed, which was true of the registry but overstated the raw-id path.",
    license_verified_on: "2026-07-25",
    attribution_required: "Cite the underlying provider (StatCite citations do this automatically)",
    url: "https://db.nomics.world",
    terms_url: "https://docs.db.nomics.world/",
  },
  {
    id: "bis",
    name: "Bank for International Settlements — central bank policy rates",
    coverage: "Policy rates for 49 economies (the rate that best captures each monetary authority's policy stance), monthly and daily, via the BIS SDMX API",
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
    coverage: "Not served. The FRED Services Terms of Use, clauses (p) and (q), reserve FRED content from use in connection with training or running AI/ML/LLM systems, and from storing, caching or archiving it.",
    access: "Disabled — the six US-only registry keys and the fred/ series id are recognized but always decline",
    license: "FRED Services Terms of Use, clauses (p) and (q) — see https://fred.stlouisfed.org/legal/",
    license_verdict: "refused" as LicenseVerdict,
    license_note:
      "Clauses (p) and (q) of the FRED Services Terms of Use reserve FRED content from AI/ML/LLM-connected use and from storing, caching or archiving it. StatCite does not offer FRED, with or without an operator key: the six US-only registry keys and the fred/ series id are recognised and always decline, naming the reason.",
    license_verified_on: "2026-07-26",
    attribution_required: "Not applicable — no FRED content is served.",
    url: "https://fred.stlouisfed.org",
    terms_url: "https://fred.stlouisfed.org/legal/",
  },
  {
    id: "un_comtrade",
    name: "UN Comtrade (trade statistics) — not served",
    coverage: "Not served. UN Comtrade's policy on use and re-dissemination requires an active premium subscription to re-disseminate its data, and licenses for-profit extraction or streaming applications for a fee.",
    access: "Not integrated; evaluated and declined",
    license: "UN Comtrade policy on use and re-dissemination",
    license_verdict: "refused" as LicenseVerdict,
    license_note:
      'The policy states "To re-disseminate UN Comtrade data, a user must be an active premium subscriber" and prices "for-profit data extraction and/or streaming application[s]" under a licensing fee. StatCite offers a metered surface on Apify, which places it within that fee-bearing category.',
    license_verified_on: "2026-08-08",
    attribution_required: "Not applicable — no UN Comtrade content is served.",
    url: "https://comtradeplus.un.org",
    terms_url: "https://uncomtrade.org/docs/policy-on-use-and-re-dissemination/",
  },
  {
    id: "eccb",
    name: "Eastern Caribbean Central Bank statistics — permission granted, not yet served",
    coverage: "Not yet served. ECCU monetary and financial statistics are published by the ECCB. Its published website terms grant use of the site for personal, non-commercial purposes and reserve redistribution unless permission is given, and the operator requested and obtained that permission. Serving is gated on recording the grant's scope here, so that every served value can name the permission it relies on.",
    access: "Built and tested; not switched on pending the recorded grant",
    license: "ECCB website terms of use",
    license_verdict: "refused" as LicenseVerdict,
    license_note:
      "The ECCB's website terms (linked from its site footer; deep URLs on the site change) reserve reproduction and redistribution of site content unless permission is given, and serving its statistics through a caching public API is redistribution. The operator requested and obtained that permission. This entry stays unserved only until the grant's own terms are recorded here verbatim — who granted it, when, and what it covers — because this ledger is the thing a user relies on to know what licenses each number, and a served value whose permission is not written down here cannot be checked by anyone but us.",
    license_verified_on: "2026-07-31",
    attribution_required: "To be set from the grant. The permission request offered to follow any attribution format the ECCB specified.",
    url: "https://www.eccb-centralbank.org",
    terms_url: "https://www.eccb-centralbank.org",
  },
  {
    id: "cbb",
    name: "Central Bank of Barbados statistics — permission granted, not yet served",
    coverage: "Not yet served. The Central Bank of Barbados publishes monetary and financial statistics. Its published website terms grant use of the site for personal, non-commercial purposes and reserve redistribution unless permission is given, and the operator requested and obtained that permission. Serving is gated on recording the grant's scope here, so that every served value can name the permission it relies on.",
    access: "Built and tested; not switched on pending the recorded grant",
    license: "Central Bank of Barbados website terms of use",
    license_verdict: "refused" as LicenseVerdict,
    license_note:
      "The Bank's website terms (linked from its site footer; deep URLs on the site change) reserve reproduction and redistribution of site content unless permission is given, and serving its statistics through a caching public API is redistribution. The operator requested and obtained that permission. This entry stays unserved only until the grant's own terms are recorded here verbatim — who granted it, when, and what it covers — because this ledger is the thing a user relies on to know what licenses each number, and a served value whose permission is not written down here cannot be checked by anyone but us.",
    license_verified_on: "2026-07-31",
    attribution_required: "To be set from the grant. The permission request offered to follow any attribution format the Bank specified.",
    url: "https://www.centralbank.org.bb",
    terms_url: "https://www.centralbank.org.bb",
  },
] as const;
