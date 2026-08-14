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
 */

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
