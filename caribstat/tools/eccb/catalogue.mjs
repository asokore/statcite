// ECCB table catalogue — Phase 1 targets.
//
// Every entry here was ENUMERATED from the live site on 2026-08-10 by crawling
// the 19 statistics categories (85 tables found in total), never guessed from a
// table's title. Frequencies are the ones the site actually publishes links
// for; asking for a frequency a table does not have is a request error, not an
// absence of data, and the ingest must not record it as the latter.
//
// STRUCTURAL NOTE, found during enumeration: Consumer Price Index is NOT one
// table with a geography selector like the rest. ECCB publishes a SEPARATE
// TABLE PER COUNTRY (consumer-price-index-anguilla, -grenada, -montserrat, …).
// A catalogue that assumed the common shape would have silently fetched only
// the ECCU CPI and labelled it as every country's. That is why `perCountryUrl`
// exists as an explicit shape flag rather than a special case buried in code.

import { BASE, ECCB_GEOGRAPHIES } from "./fetch.mjs";

const url = (path) => `${BASE}/statistics-category/${path}`;

/** Slug fragments ECCB uses for each geography in its per-country table URLs.
 * Enumerated from the live CPI table list; note they do NOT match the
 * geography display names exactly (St Kitts is "st-kitts-and-nevis" in the URL
 * but "Saint Christopher (St Kitts) and Nevis" in the selector). */
export const COUNTRY_SLUGS = {
  AIA: "anguilla",
  ATG: "antigua-and-barbuda",
  DMA: "commonwealth-of-dominica",
  GRD: "grenada",
  MSR: "montserrat",
  KNA: "st-kitts-and-nevis",
  LCA: "saint-lucia",
  VCT: "saint-vincent-and-the-grenadines",
  XCU: "eccu",
};

/**
 * @typedef {object} TableDef
 * @property {string} id            stable id used in series ids and file paths
 * @property {string} title         human title
 * @property {string} [path]        category/table path (geography-selector shape)
 * @property {(iso3:string)=>string} [perCountryUrl] set instead of `path` when
 *   the source publishes one table per country
 * @property {string[]} frequencies frequencies the site actually links
 * @property {string[]} sentinelRows row labels that MUST be present — the shape
 *   sentinel. If these vanish the source changed and the run must fail loud.
 * @property {string[]} [withheld] geographies the bank renders as an empty
 *   table. They are not ingested, and the deep run fails loud the day one of
 *   them shows rows, so a new publication is never left uncollected.
 */

/** Grenada, St Kitts and Nevis and the ECCU aggregate rendered an empty table
 * on all three 2018 base-year national-accounts tables on 2026-11-03, for
 * every year asked (2015-2026). */
const NA_2018_WITHHELD = ["GRD", "KNA", "XCU"];

/** @type {TableDef[]} */
export const TABLES = [
  {
    id: "central-government-fiscal-accounts",
    title: "Central Government Fiscal Accounts",
    path: "central-government-fiscal-accounts-2/central-government-fiscal-accounts",
    frequencies: ["a", "q", "m"],
    sentinelRows: ["Total Revenue and Grants", "Current Revenue", "Tax Revenue"],
  },
  {
    id: "summarized-monetary-survey",
    title: "Summarized Monetary Survey",
    path: "monetary-and-financial-statistics/summarized-monetary-survey",
    frequencies: ["a", "q", "m"],
    sentinelRows: ["Net Foreign Assets"],
  },
  {
    id: "selected-tourism-statistics",
    title: "Selected Tourism Statistics",
    path: "external-sector/selected-tourism-statistics",
    frequencies: ["a", "q", "m"],
    // Enumerated from the live table 2026-08-10. My first guess ("Total
    // Visitors") was taken from the table TITLE and was wrong — the sentinel
    // correctly refused all 9 geographies rather than writing unverified data.
    sentinelRows: ["Total Visitor Arrivals", "Stay-Over Arrivals", "Cruise Ship Passengers"],
  },
  {
    id: "total-public-sector-debt",
    title: "Total Public Sector Debt",
    path: "public-sector-debt/total-public-sector-debt",
    frequencies: ["a", "q"],
    // Real label is "Public Sector Debt", not "Total Public Sector Debt".
    // Same guessed-from-title error, same correct refusal by the sentinel.
    sentinelRows: ["Public Sector Debt", "Central Government Debt"],
  },
  {
    id: "debt-to-gdp",
    title: "Debt to Gross Domestic Product",
    path: "public-sector-debt/debt-to-gross-domestic-product",
    frequencies: ["a"],
    sentinelRows: [],
  },
  {
    id: "interest-rates-deposits-loans",
    title: "Interest Rates on Deposits and Loans",
    path: "mfs-interest-rates/interest-rates-on-deposits-and-loans",
    frequencies: ["a", "q", "m"],
    sentinelRows: [],
  },
  // Phase 2, A-061 (2026-11-03): national accounts and the external sector,
  // enumerated from the live category pages that day. National accounts are
  // annual only. The 2018 base-year tables are taken, not the older base.
  // Sentinel rows were read from the captured annual tables (2015-2026) of
  // every geography that day, not from the titles.
  {
    id: "gva-constant-prices",
    title: "Gross Value Added by Economic Activity in Constant Prices (base year 2018)",
    path: "national-accounts/gross-value-added-by-economic-activity-in-constant-prices-base-year-2018",
    frequencies: ["a"],
    sentinelRows: ["Agriculture, forestry and fishing", "Gross Value Added (GVA) at Basic Prices", "Gross Domestic Product (GDP) at Market Prices"],
    withheld: NA_2018_WITHHELD,
  },
  {
    id: "gva-growth-constant-prices",
    title: "Growth Rate of Gross Value Added by Economic Activity in Constant Prices (base year 2018)",
    path: "national-accounts/growth-rate-of-gross-value-added-by-economic-activity-in-constant-prices-base-year-2018",
    frequencies: ["a"],
    sentinelRows: ["Agriculture, forestry and fishing", "Gross Value Added at Basic Prices", "Gross Domestic Product at Market Prices"],
    withheld: NA_2018_WITHHELD,
  },
  {
    id: "gva-current-prices",
    title: "Gross Value Added by Economic Activity in Current Prices (base year 2018)",
    path: "national-accounts/gross-value-added-by-economic-activity-in-current-prices-base-year-2018",
    frequencies: ["a"],
    sentinelRows: ["Agriculture, forestry and fishing", "Gross Value Added (GVA) at Basic Prices", "Gross Domestic Product (GDP) at Market Prices"],
    withheld: NA_2018_WITHHELD,
  },
  {
    id: "balance-of-payments",
    title: "Balance of Payments (Analytic Presentation)",
    path: "external-sector/balance-of-payments-analytic-presentation",
    frequencies: ["a"],
    // Each label is matched as a prefix, so each must match one row only:
    // a bare "Current Account" would also match the % of GDP row.
    sentinelRows: ["Current Account as % of GDP", "Balance on Goods and Services", "Capital Account - Credit", "Net errors and omissions"],
  },
  {
    id: "international-investment-position",
    title: "International Investment Position (Summary)",
    path: "external-sector/international-investment-position-summary",
    frequencies: ["a"],
    sentinelRows: ["Net International Investment Position", "Total Assets", "Total Liabilities"],
  },
  {
    id: "trade-in-services",
    title: "Trade in Services (TIS)",
    path: "external-sector/trade-in-services-tis",
    frequencies: ["a"],
    sentinelRows: ["Total EBOPS Services: Imports: TOTAL", "Total EBOPS Services: Exports: TOTAL", "4. Travel: Exports: TOTAL"],
    // Each year splits into imports and exports, then total, ECCU and other
    // CARICOM: 72 value cells under 12 years, so each source row publishes as
    // six series. See parseSplitTable.
    split: {
      columns: [
        "Imports: TOTAL",
        "Imports: Of Which: ECCU",
        "Imports: Of Which: Other CARICOM Countries",
        "Exports: TOTAL",
        "Exports: Of Which: ECCU",
        "Exports: Of Which: Other CARICOM Countries",
      ],
      parts: [
        { whole: "Imports: TOTAL", parts: ["Imports: Of Which: ECCU", "Imports: Of Which: Other CARICOM Countries"] },
        { whole: "Exports: TOTAL", parts: ["Exports: Of Which: ECCU", "Exports: Of Which: Other CARICOM Countries"] },
      ],
      headline: "Total EBOPS Services",
      components: /^\d+\. /,
      // The Balance of Payments prints the same totals, and comes first in this
      // list, so a normal run reads it before this table.
      sameTotals: {
        table: "balance-of-payments",
        credit: "Services Credit (Exports)",
        balance: "Balance on Services",
        exports: "Total EBOPS Services: Exports: TOTAL",
        imports: "Total EBOPS Services: Imports: TOTAL",
      },
      // The union aggregate has no trade with itself. Other partner columns have
      // no outside figure to agree with, so this is what tells ECCU from CARICOM.
      unionZero: {
        iso3: "XCU",
        rows: ["Total EBOPS Services: Imports: Of Which: ECCU", "Total EBOPS Services: Exports: Of Which: ECCU"],
      },
    },
  },
  {
    id: "trade-by-sitc",
    title: "Trade Statistics by SITC",
    path: "external-sector/trade-statistics-by-sitc",
    frequencies: ["a", "q", "m"],
    sentinelRows: ["Trade Balance", "Total Imports", "Total Exports"],
  },
  {
    id: "real-effective-exchange-rate",
    title: "Real Effective Exchange Rate Index",
    path: "external-sector/real-effective-exchange-rate-index",
    frequencies: ["a", "q", "m"],
    sentinelRows: ["REER", "NEER"],
  },
  {
    id: "consumer-price-index",
    title: "Consumer Price Index",
    // Per-country tables — see the structural note at the top of this file.
    perCountryUrl: (iso3) => url(`other-real-sector/consumer-price-index-${COUNTRY_SLUGS[iso3]}`),
    // Anguilla and ECCU publish [a,q] only; the rest publish [a,m,q]. The
    // ingest asks per country and records what it gets.
    frequencies: ["a", "q"],
    sentinelRows: [],
  },
];

export const tableById = new Map(TABLES.map((t) => [t.id, t]));

/** Resolve the fetch URL for a table + geography. */
export function tableUrl(def, iso3) {
  if (def.perCountryUrl) return def.perCountryUrl(iso3);
  return url(def.path);
}

/** True when a table needs one request per geography against distinct URLs
 * (so the CSRF session must be re-opened per country, not reused). */
export const isPerCountry = (def) => Boolean(def.perCountryUrl);

export { ECCB_GEOGRAPHIES };
