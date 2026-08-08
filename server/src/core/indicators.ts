// Curated indicator registry — the economist-maintained heart of StatCite.
// Each entry maps a friendly key to authoritative series, with fallbacks:
//   wb         World Bank WDI code (primary for cross-country annual data)
//   dbnomics   [provider, dataset, seriesTemplate] — {ISO3} substituted (IMF WEO etc.)
//   datamapper [code, "WEO"|"FM"] — IMF DataMapper primary (current vintage)
//   fred       INERT — FRED is permanently disabled (ToU, v1.3.2); these six
//              US-only keys stay recognized but always decline with an explanation
//   modeled    the source publishes this series as a modeled estimate (drives
//              observation_status "modeled_estimate" in verify results)

import type { IndicatorDef } from "./types.ts";

export const INDICATORS: IndicatorDef[] = [
  {
    key: "gdp_growth",
    label: "GDP growth (annual %)",
    unit: "% (annual, real)",
    kind: "percent",
    wb: "NY.GDP.MKTP.KD.ZG",
    datamapper: ["NGDP_RPCH", "WEO"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.NGDP_RPCH.pcent_change"],
    synonyms: ["real gdp growth", "economic growth", "growth rate", "gdp growth rate"],
  },
  {
    key: "gdp_current_usd",
    label: "GDP (current US$)",
    unit: "current US$",
    kind: "level",
    wb: "NY.GDP.MKTP.CD",
    synonyms: ["gdp", "nominal gdp", "gross domestic product", "size of economy", "gdp in dollars"],
  },
  {
    key: "gdp_per_capita_usd",
    label: "GDP per capita (current US$)",
    unit: "current US$",
    kind: "level",
    wb: "NY.GDP.PCAP.CD",
    synonyms: ["gdp per capita", "income per person", "gdp per head"],
  },
  {
    key: "gdp_per_capita_ppp",
    label: "GDP per capita, PPP (current international $)",
    unit: "current international $ (PPP)",
    kind: "level",
    wb: "NY.GDP.PCAP.PP.CD",
    synonyms: ["gdp per capita ppp", "ppp per capita", "purchasing power parity per capita"],
  },
  {
    key: "gni_per_capita_atlas",
    label: "GNI per capita, Atlas method (current US$)",
    unit: "current US$",
    kind: "level",
    wb: "NY.GNP.PCAP.CD",
    synonyms: ["gni per capita", "atlas method", "income classification"],
    notes: "The World Bank uses this series for its income-group classifications.",
  },
  {
    key: "inflation_cpi",
    label: "Inflation, consumer prices (annual %)",
    unit: "% (annual average)",
    kind: "percent",
    wb: "FP.CPI.TOTL.ZG",
    fred: "CPIAUCSL",
    synonyms: ["inflation", "inflation rate", "cpi inflation", "consumer price inflation", "price growth"],
    notes:
      "Annual-average CPI inflation. Note: year-end (Dec/Dec) inflation, used by some governments, can differ noticeably.",
  },
  {
    key: "cpi_index",
    label: "Consumer price index (2010 = 100)",
    unit: "index, 2010 = 100",
    kind: "index",
    wb: "FP.CPI.TOTL",
    fred: "CPIAUCSL",
    synonyms: ["cpi", "consumer price index", "price level", "price index"],
  },
  {
    key: "gdp_deflator_growth",
    label: "Inflation, GDP deflator (annual %)",
    unit: "%",
    kind: "percent",
    wb: "NY.GDP.DEFL.KD.ZG",
    synonyms: ["gdp deflator", "deflator inflation"],
  },
  {
    key: "unemployment_rate",
    label: "Unemployment, total (% of labor force, modeled ILO estimate)",
    unit: "% of labor force",
    kind: "percent",
    wb: "SL.UEM.TOTL.ZS",
    fred: "UNRATE",
    modeled: true,
    synonyms: ["unemployment", "unemployment rate", "jobless rate", "joblessness"],
    notes: "ILO modeled estimates; national definitions may differ from officially published national rates.",
  },
  {
    key: "labor_force_participation",
    label: "Labor force participation rate (% of population 15+, modeled ILO)",
    unit: "% of population ages 15+",
    kind: "percent",
    wb: "SL.TLF.CACT.ZS",
    modeled: true,
    synonyms: ["labor force participation", "participation rate", "lfpr"],
  },
  {
    key: "population",
    label: "Population, total",
    unit: "people",
    kind: "level",
    wb: "SP.POP.TOTL",
    synonyms: ["population", "number of people", "inhabitants", "how many people"],
  },
  {
    key: "population_growth",
    label: "Population growth (annual %)",
    unit: "%",
    kind: "percent",
    wb: "SP.POP.GROW",
    synonyms: ["population growth", "population growth rate"],
  },
  {
    key: "current_account_gdp",
    label: "Current account balance (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "BN.CAB.XOKA.GD.ZS",
    datamapper: ["BCA_NGDPD", "WEO"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.BCA_NGDPD.pcent_gdp"],
    synonyms: ["current account", "current account balance", "external balance", "bop current account"],
  },
  {
    key: "govt_debt_gdp",
    label: "General government gross debt (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    datamapper: ["GGXWDG_NGDP", "WEO"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.GGXWDG_NGDP.pcent_gdp"],
    wb: "GC.DOD.TOTL.GD.ZS",
    synonyms: ["government debt", "public debt", "debt to gdp", "national debt", "sovereign debt", "debt ratio"],
    notes:
      "Primary source is the IMF WEO general government gross debt series; the World Bank WDI series covers central government only and is patchier.",
  },
  {
    key: "fiscal_balance_gdp",
    label: "General government net lending/borrowing (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    datamapper: ["GGXCNL_NGDP", "WEO"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.GGXCNL_NGDP.pcent_gdp"],
    synonyms: ["fiscal balance", "budget balance", "fiscal deficit", "budget deficit", "government balance", "net lending"],
    notes: "Negative values indicate a fiscal deficit.",
  },
  {
    key: "govt_revenue_gdp",
    label: "General government revenue (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    datamapper: ["GGR_G01_GDP_PT", "FM"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.GGR_NGDP.pcent_gdp"],
    synonyms: ["government revenue", "revenue to gdp", "fiscal revenue"],
  },
  {
    key: "govt_expenditure_gdp",
    label: "General government total expenditure (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    datamapper: ["G_X_G01_GDP_PT", "FM"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.GGX_NGDP.pcent_gdp"],
    synonyms: ["government spending", "government expenditure", "public spending"],
  },
  {
    key: "tax_revenue_gdp",
    label: "Tax revenue (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "GC.TAX.TOTL.GD.ZS",
    synonyms: ["tax revenue", "tax to gdp", "tax burden"],
  },
  {
    key: "trade_gdp",
    label: "Trade (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NE.TRD.GNFS.ZS",
    synonyms: ["trade openness", "trade to gdp", "openness"],
    notes: "Sum of exports and imports of goods and services over GDP.",
  },
  {
    key: "exports_gdp",
    label: "Exports of goods and services (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NE.EXP.GNFS.ZS",
    synonyms: ["exports", "export share"],
  },
  {
    key: "imports_gdp",
    label: "Imports of goods and services (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NE.IMP.GNFS.ZS",
    synonyms: ["imports", "import share"],
  },
  {
    key: "fdi_inflows_gdp",
    label: "Foreign direct investment, net inflows (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "BX.KLT.DINV.WD.GD.ZS",
    synonyms: ["fdi", "foreign direct investment", "fdi inflows"],
  },
  // SDMX sources (BIS, ECB). Policy rates fill the hole left by FRED's
  // permanent disablement — BIS WS_CBPOL covers ~38 central banks in one
  // flow, licence-clean, no key. Licence ledger entries live in core/sources.ts.
  {
    key: "policy_rate",
    label: "Central bank policy rate",
    unit: "% per annum",
    kind: "percent",
    sdmx: {
      provider: "BIS",
      flow: "WS_CBPOL",
      key: "M.{ISO2}",
      sourceUrl: "https://data.bis.org/topics/CBPOL",
    },
    synonyms: ["policy rate", "interest rate", "central bank rate", "base rate", "fed funds", "bank rate", "monetary policy rate"],
    notes: "BIS central bank policy rates — the rate that best captures each monetary authority's policy stance. Monthly. Coverage is the 49 economies the BIS compiles (enumerated from the dataflow itself, including the euro area); economies outside that set return an honest no-published-data response rather than a substitute.",
  },
  {
    key: "euro_area_hicp",
    label: "Euro area HICP inflation (annual rate)",
    unit: "%",
    kind: "percent",
    sdmx: {
      provider: "ECB",
      flow: "HICP",
      key: "M.U2.N.000000.4D0.ANR",
      sourceUrl: "https://data.ecb.europa.eu/data/datasets/ICP",
    },
    synonyms: ["hicp", "euro area inflation", "eurozone inflation", "harmonised inflation"],
    notes: "Monthly euro-area harmonised inflation from the ECB's current HICP dataflow. Euro-area aggregate only (request with country=\"euro area\"); for national annual CPI use inflation_cpi.",
  },
  {
    key: "tourism_receipts_exports",
    label: "International tourism, receipts (% of total exports)",
    unit: "% of total exports",
    kind: "percent",
    wb: "ST.INT.RCPT.XP.ZS",
    synonyms: ["tourism receipts", "tourism exports", "tourism share of exports", "tourism dependence"],
    notes: "A headline exposure measure for tourism-dependent economies (most small island developing states).",
  },
  // External debt (World Bank International Debt Statistics — same
  // api.worldbank.org v2 endpoint and CC BY 4.0 summary terms as WDI; licence
  // ledger verdict recorded in docs/RESEARCH.md closed verdicts, 2026-08-07).
  // IDS covers low- and middle-income economies; high-income economies return
  // an honest no-published-data response rather than a guess.
  {
    key: "external_debt_stock_usd",
    label: "External debt stocks, total (DOD, current US$)",
    unit: "current US$",
    kind: "level",
    wb: "DT.DOD.DECT.CD",
    synonyms: ["external debt", "external debt stock", "total external debt", "foreign debt"],
    notes: "World Bank International Debt Statistics; reported for low- and middle-income economies (high-income economies are not covered by IDS).",
  },
  {
    key: "external_debt_service_usd",
    label: "Total debt service on external debt (TDS, current US$)",
    unit: "current US$",
    kind: "level",
    wb: "DT.TDS.DECT.CD",
    synonyms: ["debt service", "external debt service", "debt repayments"],
    notes: "World Bank International Debt Statistics; low- and middle-income economies only.",
  },
  {
    key: "debt_service_exports_pct",
    label: "Total debt service (% of exports of goods, services and primary income)",
    unit: "% of exports",
    kind: "percent",
    wb: "DT.TDS.DECT.EX.ZS",
    synonyms: ["debt service ratio", "debt service to exports", "debt burden"],
    notes: "World Bank International Debt Statistics; the classic debt-burden ratio for low- and middle-income economies.",
  },
  {
    key: "remittances_gdp",
    label: "Personal remittances, received (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "BX.TRF.PWKR.DT.GD.ZS",
    synonyms: ["remittances", "remittance inflows"],
  },
  {
    key: "gross_capital_formation_gdp",
    label: "Gross capital formation (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NE.GDI.TOTL.ZS",
    synonyms: ["investment rate", "capital formation", "gross investment"],
  },
  {
    key: "gross_savings_gdp",
    label: "Gross savings (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NY.GNS.ICTR.ZS",
    synonyms: ["savings rate", "gross savings", "national savings"],
  },
  {
    key: "official_fx_rate",
    label: "Official exchange rate (LCU per US$, period average)",
    unit: "LCU per US$",
    kind: "rate",
    wb: "PA.NUS.FCRF",
    synonyms: ["exchange rate", "official exchange rate", "currency rate", "lcu per usd"],
  },
  {
    key: "reserves_months_imports",
    label: "Total reserves in months of imports",
    unit: "months of imports",
    kind: "level",
    wb: "FI.RES.TOTL.MO",
    synonyms: ["reserves", "import cover", "foreign reserves months"],
  },
  {
    key: "reserves_total_usd",
    label: "Total reserves (includes gold, current US$)",
    unit: "current US$",
    kind: "level",
    wb: "FI.RES.TOTL.CD",
    synonyms: ["total reserves", "foreign exchange reserves", "fx reserves"],
  },
  {
    key: "lending_rate",
    label: "Lending interest rate (%)",
    unit: "%",
    kind: "percent",
    wb: "FR.INR.LEND",
    synonyms: ["lending rate", "loan rate", "bank lending rate"],
  },
  {
    key: "deposit_rate",
    label: "Deposit interest rate (%)",
    unit: "%",
    kind: "percent",
    wb: "FR.INR.DPST",
    synonyms: ["deposit rate", "savings rate interest"],
  },
  {
    key: "real_interest_rate",
    label: "Real interest rate (%)",
    unit: "%",
    kind: "percent",
    wb: "FR.INR.RINR",
    synonyms: ["real interest rate"],
  },
  {
    key: "broad_money_gdp",
    label: "Broad money (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "FM.LBL.BMNY.GD.ZS",
    synonyms: ["broad money", "m2 to gdp", "money supply"],
  },
  {
    key: "gini",
    label: "Gini index",
    unit: "index (0–100)",
    kind: "index",
    wb: "SI.POV.GINI",
    synonyms: ["gini", "gini coefficient", "inequality", "income inequality"],
    notes: "Survey-based; available only for survey years, often with multi-year gaps.",
  },
  {
    key: "poverty_headcount_intl",
    label: "Poverty headcount ratio at $2.15/day, 2017 PPP (% of population)",
    unit: "% of population",
    kind: "percent",
    wb: "SI.POV.DDAY",
    synonyms: ["poverty rate", "extreme poverty", "poverty headcount"],
    notes: "Survey-based international poverty line; sparse for many countries.",
  },
  {
    key: "life_expectancy",
    label: "Life expectancy at birth, total (years)",
    unit: "years",
    kind: "years",
    wb: "SP.DYN.LE00.IN",
    synonyms: ["life expectancy", "longevity"],
  },
  {
    key: "urban_population_share",
    label: "Urban population (% of total population)",
    unit: "% of population",
    kind: "percent",
    wb: "SP.URB.TOTL.IN.ZS",
    synonyms: ["urbanization", "urban population", "urban share"],
  },
  // ——— US higher-frequency series (FRED; require FRED_API_KEY) ———
  {
    key: "us_fed_funds_rate",
    label: "US federal funds effective rate (monthly, %)",
    unit: "%",
    kind: "percent",
    fred: "FEDFUNDS",
    synonyms: ["fed funds", "federal funds rate", "us policy rate", "fed rate"],
  },
  {
    key: "us_10y_treasury",
    label: "US 10-year Treasury constant maturity yield (daily, %)",
    unit: "%",
    kind: "percent",
    fred: "DGS10",
    synonyms: ["10 year treasury", "10y yield", "treasury yield"],
  },
  {
    key: "us_cpi_monthly",
    label: "US CPI for all urban consumers (monthly index, 1982–84 = 100)",
    unit: "index, 1982–84 = 100",
    kind: "index",
    fred: "CPIAUCSL",
    synonyms: ["us cpi monthly", "cpiaucsl"],
  },
  {
    key: "us_unemployment_monthly",
    label: "US unemployment rate (monthly, %)",
    unit: "%",
    kind: "percent",
    fred: "UNRATE",
    synonyms: ["us unemployment monthly", "unrate"],
  },
  {
    key: "us_nonfarm_payrolls",
    label: "US total nonfarm payrolls (monthly, thousands of persons)",
    unit: "thousands of persons",
    kind: "level",
    fred: "PAYEMS",
    synonyms: ["nonfarm payrolls", "payrolls", "payems", "jobs report"],
  },
  {
    key: "us_real_gdp",
    label: "US real GDP (quarterly, chained 2017 dollars, SAAR)",
    unit: "billions of chained 2017 US$",
    kind: "level",
    fred: "GDPC1",
    synonyms: ["us real gdp quarterly", "gdpc1"],
  },
];

const byKey = new Map(INDICATORS.map((d) => [d.key, d]));

export function getIndicatorDef(key: string): IndicatorDef | undefined {
  return byKey.get(key.toLowerCase().trim());
}

export interface IndicatorMatch {
  def: IndicatorDef;
  score: number;
}

/** Rank indicators by token overlap against a free-text query. */
export function searchIndicatorDefs(query: string, limit = 8): IndicatorMatch[] {
  const q = query.toLowerCase().replace(/[^a-z0-9% ]+/g, " ").trim();
  if (!q) return [];
  const qTokens = q.split(/\s+/).filter((t) => t.length > 1);
  const results: IndicatorMatch[] = [];
  for (const def of INDICATORS) {
    let score = 0;
    const hay = [def.key.replace(/_/g, " "), def.label.toLowerCase(), ...def.synonyms].join(" | ");
    if (def.key === q.replace(/\s+/g, "_")) score += 100;
    for (const syn of def.synonyms) if (syn === q) score += 60;
    if (hay.includes(q)) score += 25;
    for (const t of qTokens) if (hay.includes(t)) score += 8;
    if (score > 0) results.push({ def, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
