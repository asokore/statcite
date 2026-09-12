// Registry indicators whose World Bank and IMF sources do not cover some ECCU
// members, but which the Eastern Caribbean Central Bank publishes on its own
// definition.
//
// Anguilla and Montserrat are not World Bank or IMF WEO reporting economies.
// Asked for govt_debt_gdp or inflation_cpi, the registry chain finds nothing
// and used to answer with concatenated upstream errors, including raw
// DBnomics JSON, while StatCite serves the ECCB's own figure one call away.
//
// These are POINTERS, never substitutes. The ECCB measures debt for central
// government or the total public sector rather than IMF general government,
// and reports inflation end of period rather than as an annual average. Quietly
// serving one in place of the other would answer a different question under
// the registry key's label.

/** ECCU geographies, plus the currency union aggregate. */
export const ECCU_ISO3 = new Set(["AIA", "ATG", "DMA", "GRD", "KNA", "LCA", "MSR", "VCT", "XCU"]);

export interface EccbRelated {
  series: Array<{ id: string; label: string }>;
  definition: string;
}

const RELATED: Record<string, (iso3: string) => EccbRelated> = {
  govt_debt_gdp: (iso3) => ({
    series: [
      { id: `caribstat/ECCB/debt-to-gdp/${iso3}.a#Total Public Sector Debt to GDP`, label: "Total public sector debt to GDP (ECCB)" },
      { id: `caribstat/ECCB/debt-to-gdp/${iso3}.a#Central Government Debt to GDP`, label: "Central government debt to GDP (ECCB)" },
    ],
    definition:
      "The ECCB reports central government and total public sector debt, not the IMF's general government gross debt, so the figures are related but not the same measure.",
  }),
  inflation_cpi: (iso3) => ({
    series: [
      { id: `caribstat/ECCB/consumer-price-index/${iso3}.a#Inflation Rate - end of period`, label: "Inflation, end of period (ECCB)" },
    ],
    definition:
      "The ECCB reports inflation end of period, the change to December, not the annual-average change the World Bank series measures.",
  }),
};

/** The ECCB series related to a registry key for an ECCU geography, if any. */
export function eccbRelated(key: string, iso3: string): EccbRelated | undefined {
  if (!ECCU_ISO3.has(iso3)) return undefined;
  const f = RELATED[key];
  return f ? f(iso3) : undefined;
}
