// ../server/src/core/types.ts
var ToolError = class extends Error {
  details;
  constructor(message, details) {
    super(message);
    this.name = "ToolError";
    this.details = details;
  }
};
function nowIso(ctx) {
  return (ctx.now ? ctx.now() : /* @__PURE__ */ new Date()).toISOString();
}
function today(ctx) {
  return nowIso(ctx).slice(0, 10);
}

// ../server/src/core/countries.ts
var ROWS = [
  ["AFG", "AF", "Afghanistan"],
  ["ALB", "AL", "Albania"],
  ["DZA", "DZ", "Algeria"],
  ["AND", "AD", "Andorra"],
  ["AGO", "AO", "Angola"],
  ["ATG", "AG", "Antigua and Barbuda", "antigua"],
  ["ARG", "AR", "Argentina"],
  ["ARM", "AM", "Armenia"],
  ["ABW", "AW", "Aruba"],
  ["AUS", "AU", "Australia"],
  ["AUT", "AT", "Austria"],
  ["AZE", "AZ", "Azerbaijan"],
  ["BHS", "BS", "Bahamas", "the bahamas"],
  ["BHR", "BH", "Bahrain"],
  ["BGD", "BD", "Bangladesh"],
  ["BRB", "BB", "Barbados"],
  ["BLR", "BY", "Belarus"],
  ["BEL", "BE", "Belgium"],
  ["BLZ", "BZ", "Belize"],
  ["BEN", "BJ", "Benin"],
  ["BMU", "BM", "Bermuda"],
  ["BTN", "BT", "Bhutan"],
  ["BOL", "BO", "Bolivia"],
  ["BIH", "BA", "Bosnia and Herzegovina", "bosnia"],
  ["BWA", "BW", "Botswana"],
  ["BRA", "BR", "Brazil"],
  ["BRN", "BN", "Brunei Darussalam", "brunei"],
  ["BGR", "BG", "Bulgaria"],
  ["BFA", "BF", "Burkina Faso"],
  ["BDI", "BI", "Burundi"],
  ["CPV", "CV", "Cabo Verde", "cape verde"],
  ["KHM", "KH", "Cambodia"],
  ["CMR", "CM", "Cameroon"],
  ["CAN", "CA", "Canada"],
  ["CYM", "KY", "Cayman Islands"],
  ["CAF", "CF", "Central African Republic"],
  ["TCD", "TD", "Chad"],
  ["CHL", "CL", "Chile"],
  ["CHN", "CN", "China", "prc", "people's republic of china"],
  ["COL", "CO", "Colombia"],
  ["COM", "KM", "Comoros"],
  ["COD", "CD", "Congo, Dem. Rep.", "democratic republic of the congo", "dr congo", "drc", "congo-kinshasa"],
  ["COG", "CG", "Congo, Rep.", "republic of the congo", "congo-brazzaville", "congo"],
  ["CRI", "CR", "Costa Rica"],
  ["CIV", "CI", "Cote d'Ivoire", "ivory coast", "c\xF4te d'ivoire"],
  ["HRV", "HR", "Croatia"],
  ["CUB", "CU", "Cuba"],
  ["CUW", "CW", "Curacao", "cura\xE7ao"],
  ["CYP", "CY", "Cyprus"],
  ["CZE", "CZ", "Czechia", "czech republic"],
  ["DNK", "DK", "Denmark"],
  ["DJI", "DJ", "Djibouti"],
  ["DMA", "DM", "Dominica"],
  ["DOM", "DO", "Dominican Republic"],
  ["ECU", "EC", "Ecuador"],
  ["EGY", "EG", "Egypt", "arab republic of egypt"],
  ["SLV", "SV", "El Salvador"],
  ["GNQ", "GQ", "Equatorial Guinea"],
  ["ERI", "ER", "Eritrea"],
  ["EST", "EE", "Estonia"],
  ["SWZ", "SZ", "Eswatini", "swaziland"],
  ["ETH", "ET", "Ethiopia"],
  ["FJI", "FJ", "Fiji"],
  ["FIN", "FI", "Finland"],
  ["FRA", "FR", "France"],
  ["PYF", "PF", "French Polynesia"],
  ["GAB", "GA", "Gabon"],
  ["GMB", "GM", "Gambia", "the gambia"],
  ["GEO", "GE", "Georgia"],
  ["DEU", "DE", "Germany"],
  ["GHA", "GH", "Ghana"],
  ["GRC", "GR", "Greece"],
  ["GRD", "GD", "Grenada"],
  ["GTM", "GT", "Guatemala"],
  ["GIN", "GN", "Guinea"],
  ["GNB", "GW", "Guinea-Bissau"],
  ["GUY", "GY", "Guyana"],
  ["HTI", "HT", "Haiti"],
  ["HND", "HN", "Honduras"],
  ["HKG", "HK", "Hong Kong SAR, China", "hong kong"],
  ["HUN", "HU", "Hungary"],
  ["ISL", "IS", "Iceland"],
  ["IND", "IN", "India"],
  ["IDN", "ID", "Indonesia"],
  ["IRN", "IR", "Iran, Islamic Rep.", "iran"],
  ["IRQ", "IQ", "Iraq"],
  ["IRL", "IE", "Ireland"],
  ["ISR", "IL", "Israel"],
  ["ITA", "IT", "Italy"],
  ["JAM", "JM", "Jamaica"],
  ["JPN", "JP", "Japan"],
  ["JOR", "JO", "Jordan"],
  ["KAZ", "KZ", "Kazakhstan"],
  ["KEN", "KE", "Kenya"],
  ["KIR", "KI", "Kiribati"],
  ["PRK", "KP", "Korea, Dem. People's Rep.", "north korea"],
  ["KOR", "KR", "Korea, Rep.", "south korea", "korea", "republic of korea"],
  ["XKX", "XK", "Kosovo"],
  ["KWT", "KW", "Kuwait"],
  ["KGZ", "KG", "Kyrgyz Republic", "kyrgyzstan"],
  ["LAO", "LA", "Lao PDR", "laos"],
  ["LVA", "LV", "Latvia"],
  ["LBN", "LB", "Lebanon"],
  ["LSO", "LS", "Lesotho"],
  ["LBR", "LR", "Liberia"],
  ["LBY", "LY", "Libya"],
  ["LIE", "LI", "Liechtenstein"],
  ["LTU", "LT", "Lithuania"],
  ["LUX", "LU", "Luxembourg"],
  ["MAC", "MO", "Macao SAR, China", "macau", "macao"],
  ["MDG", "MG", "Madagascar"],
  ["MWI", "MW", "Malawi"],
  ["MYS", "MY", "Malaysia"],
  ["MDV", "MV", "Maldives"],
  ["MLI", "ML", "Mali"],
  ["MLT", "MT", "Malta"],
  ["MHL", "MH", "Marshall Islands"],
  ["MRT", "MR", "Mauritania"],
  ["MUS", "MU", "Mauritius"],
  ["MEX", "MX", "Mexico"],
  ["FSM", "FM", "Micronesia, Fed. Sts.", "micronesia"],
  ["MDA", "MD", "Moldova"],
  ["MCO", "MC", "Monaco"],
  ["MNG", "MN", "Mongolia"],
  ["MNE", "ME", "Montenegro"],
  ["MAR", "MA", "Morocco"],
  ["MOZ", "MZ", "Mozambique"],
  ["MMR", "MM", "Myanmar", "burma"],
  ["NAM", "NA", "Namibia"],
  ["NRU", "NR", "Nauru"],
  ["NPL", "NP", "Nepal"],
  ["NLD", "NL", "Netherlands", "the netherlands", "holland"],
  ["NCL", "NC", "New Caledonia"],
  ["NZL", "NZ", "New Zealand"],
  ["NIC", "NI", "Nicaragua"],
  ["NER", "NE", "Niger"],
  ["NGA", "NG", "Nigeria"],
  ["MKD", "MK", "North Macedonia", "macedonia"],
  ["NOR", "NO", "Norway"],
  ["OMN", "OM", "Oman"],
  ["PAK", "PK", "Pakistan"],
  ["PLW", "PW", "Palau"],
  ["PAN", "PA", "Panama"],
  ["PNG", "PG", "Papua New Guinea"],
  ["PRY", "PY", "Paraguay"],
  ["PER", "PE", "Peru"],
  ["PHL", "PH", "Philippines", "the philippines"],
  ["POL", "PL", "Poland"],
  ["PRT", "PT", "Portugal"],
  ["PRI", "PR", "Puerto Rico"],
  ["QAT", "QA", "Qatar"],
  ["ROU", "RO", "Romania"],
  ["RUS", "RU", "Russian Federation", "russia"],
  ["RWA", "RW", "Rwanda"],
  ["WSM", "WS", "Samoa"],
  ["SMR", "SM", "San Marino"],
  ["STP", "ST", "Sao Tome and Principe", "s\xE3o tom\xE9 and pr\xEDncipe"],
  ["SAU", "SA", "Saudi Arabia"],
  ["SEN", "SN", "Senegal"],
  ["SRB", "RS", "Serbia"],
  ["SYC", "SC", "Seychelles"],
  ["SLE", "SL", "Sierra Leone"],
  ["SGP", "SG", "Singapore"],
  ["SXM", "SX", "Sint Maarten (Dutch part)", "sint maarten"],
  ["SVK", "SK", "Slovak Republic", "slovakia"],
  ["SVN", "SI", "Slovenia"],
  ["SLB", "SB", "Solomon Islands"],
  ["SOM", "SO", "Somalia"],
  ["ZAF", "ZA", "South Africa"],
  ["SSD", "SS", "South Sudan"],
  ["ESP", "ES", "Spain"],
  ["LKA", "LK", "Sri Lanka"],
  ["KNA", "KN", "St. Kitts and Nevis", "saint kitts and nevis", "st kitts"],
  ["LCA", "LC", "St. Lucia", "saint lucia"],
  ["VCT", "VC", "St. Vincent and the Grenadines", "saint vincent and the grenadines", "st vincent"],
  ["SDN", "SD", "Sudan"],
  ["SUR", "SR", "Suriname"],
  ["SWE", "SE", "Sweden"],
  ["CHE", "CH", "Switzerland"],
  ["SYR", "SY", "Syrian Arab Republic", "syria"],
  ["TJK", "TJ", "Tajikistan"],
  ["TZA", "TZ", "Tanzania"],
  ["THA", "TH", "Thailand"],
  ["TLS", "TL", "Timor-Leste", "east timor"],
  ["TGO", "TG", "Togo"],
  ["TON", "TO", "Tonga"],
  ["TTO", "TT", "Trinidad and Tobago", "trinidad"],
  ["TUN", "TN", "Tunisia"],
  ["TUR", "TR", "Turkiye", "turkey", "t\xFCrkiye"],
  ["TKM", "TM", "Turkmenistan"],
  ["TCA", "TC", "Turks and Caicos Islands", "turks and caicos"],
  ["TUV", "TV", "Tuvalu"],
  ["UGA", "UG", "Uganda"],
  ["UKR", "UA", "Ukraine"],
  ["ARE", "AE", "United Arab Emirates", "uae", "emirates"],
  ["GBR", "GB", "United Kingdom", "uk", "great britain", "britain", "england"],
  ["USA", "US", "United States", "usa", "america", "united states of america", "u.s.", "u.s.a."],
  ["URY", "UY", "Uruguay"],
  ["UZB", "UZ", "Uzbekistan"],
  ["VUT", "VU", "Vanuatu"],
  ["VEN", "VE", "Venezuela, RB", "venezuela"],
  ["VNM", "VN", "Viet Nam", "vietnam"],
  ["PSE", "PS", "West Bank and Gaza", "palestine", "palestinian territories"],
  ["YEM", "YE", "Yemen, Rep.", "yemen"],
  ["ZMB", "ZM", "Zambia"],
  ["ZWE", "ZW", "Zimbabwe"]
];
var AGGREGATES = [
  ["WLD", "1W", "World", "global", "worldwide"],
  ["EUU", "EU", "European Union", "eu"],
  ["EMU", "XC", "Euro area", "eurozone", "euro zone"],
  ["OED", "OE", "OECD members", "oecd"],
  ["HIC", "XD", "High income countries", "high income"],
  ["LIC", "XM", "Low income countries", "low income"],
  ["LMC", "XN", "Lower middle income countries", "lower middle income"],
  ["UMC", "XT", "Upper middle income countries", "upper middle income"],
  ["LCN", "ZJ", "Latin America & Caribbean", "latin america", "lac"],
  ["SSF", "ZG", "Sub-Saharan Africa"],
  ["EAS", "Z4", "East Asia & Pacific"],
  ["ECS", "Z7", "Europe & Central Asia"],
  ["MEA", "ZQ", "Middle East & North Africa", "mena"],
  ["NAC", "XU", "North America"],
  ["SAS", "8S", "South Asia"]
];
var COUNTRIES = [
  ...ROWS.map(([iso3, iso2, name]) => ({ iso3, iso2, name })),
  ...AGGREGATES.map(([iso3, iso2, name]) => ({ iso3, iso2, name, aggregate: true }))
];
var norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
var byCode = /* @__PURE__ */ new Map();
var byName = /* @__PURE__ */ new Map();
for (const rows of [ROWS, AGGREGATES]) {
  const aggregate = rows === AGGREGATES;
  for (const [iso3, iso2, name, ...aliases] of rows) {
    const c = aggregate ? { iso3, iso2, name, aggregate: true } : { iso3, iso2, name };
    byCode.set(iso3, c);
    byCode.set(iso2, c);
    byName.set(norm(name), c);
    const short = norm(name.split(",")[0].split("(")[0]);
    if (short && !byName.has(short)) byName.set(short, c);
    for (const a of aliases) byName.set(norm(a), c);
  }
}
var NORM_NAMES = COUNTRIES.map((c) => ({ c, n: norm(c.name) }));
function resolveCountry(input, opts = {}) {
  const raw = input.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const codeAllowed = !opts.strict || raw === upper;
  if (codeAllowed && /^[A-Z0-9]{2,3}$/.test(upper) && byCode.has(upper)) return byCode.get(upper);
  const n = norm(raw);
  if (byName.has(n)) return byName.get(n);
  if (n.length >= 4) {
    const hits = NORM_NAMES.filter(({ n: cn }) => cn.includes(n) || n.includes(cn));
    if (hits.length === 1) return hits[0].c;
  }
  if (!opts.strict && /^[A-Z]{3}$/.test(upper)) return { iso3: upper, iso2: upper.slice(0, 2), name: upper };
  return null;
}
function suggestCountries(input, limit = 5) {
  const n = norm(input);
  if (!n) return [];
  const scored = NORM_NAMES.map(({ c, n: cn }) => {
    let score = 0;
    if (cn.startsWith(n) || n.startsWith(cn)) score = 3;
    else if (cn.includes(n) || n.includes(cn)) score = 2;
    else {
      const tokens = n.split(" ");
      score = tokens.some((t) => t.length > 2 && cn.includes(t)) ? 1 : 0;
    }
    return { c, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  return scored.map((x) => `${x.c.name} (${x.c.iso3})`);
}

// ../server/src/core/indicators.ts
var INDICATORS = [
  {
    key: "gdp_growth",
    label: "GDP growth (annual %)",
    unit: "% (annual, real)",
    kind: "percent",
    wb: "NY.GDP.MKTP.KD.ZG",
    datamapper: ["NGDP_RPCH", "WEO"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.NGDP_RPCH.pcent_change"],
    synonyms: ["real gdp growth", "economic growth", "growth rate", "gdp growth rate"]
  },
  {
    key: "gdp_current_usd",
    label: "GDP (current US$)",
    unit: "current US$",
    kind: "level",
    wb: "NY.GDP.MKTP.CD",
    synonyms: ["gdp", "nominal gdp", "gross domestic product", "size of economy", "gdp in dollars"]
  },
  {
    key: "gdp_per_capita_usd",
    label: "GDP per capita (current US$)",
    unit: "current US$",
    kind: "level",
    wb: "NY.GDP.PCAP.CD",
    synonyms: ["gdp per capita", "income per person", "gdp per head"]
  },
  {
    key: "gdp_per_capita_ppp",
    label: "GDP per capita, PPP (current international $)",
    unit: "current international $ (PPP)",
    kind: "level",
    wb: "NY.GDP.PCAP.PP.CD",
    synonyms: ["gdp per capita ppp", "ppp per capita", "purchasing power parity per capita"]
  },
  {
    key: "gni_per_capita_atlas",
    label: "GNI per capita, Atlas method (current US$)",
    unit: "current US$",
    kind: "level",
    wb: "NY.GNP.PCAP.CD",
    synonyms: ["gni per capita", "atlas method", "income classification"],
    notes: "The World Bank uses this series for its income-group classifications."
  },
  {
    key: "inflation_cpi",
    label: "Inflation, consumer prices (annual %)",
    unit: "% (annual average)",
    kind: "percent",
    wb: "FP.CPI.TOTL.ZG",
    fred: "CPIAUCSL",
    synonyms: ["inflation", "inflation rate", "cpi inflation", "consumer price inflation", "price growth"],
    notes: "Annual-average CPI inflation. Note: year-end (Dec/Dec) inflation, used by some governments, can differ noticeably."
  },
  {
    key: "cpi_index",
    label: "Consumer price index (2010 = 100)",
    unit: "index, 2010 = 100",
    kind: "index",
    wb: "FP.CPI.TOTL",
    fred: "CPIAUCSL",
    synonyms: ["cpi", "consumer price index", "price level", "price index"]
  },
  {
    key: "gdp_deflator_growth",
    label: "Inflation, GDP deflator (annual %)",
    unit: "%",
    kind: "percent",
    wb: "NY.GDP.DEFL.KD.ZG",
    synonyms: ["gdp deflator", "deflator inflation"]
  },
  {
    key: "unemployment_rate",
    label: "Unemployment, total (% of labor force, modeled ILO estimate)",
    unit: "% of labor force",
    kind: "percent",
    wb: "SL.UEM.TOTL.ZS",
    fred: "UNRATE",
    synonyms: ["unemployment", "unemployment rate", "jobless rate", "joblessness"],
    notes: "ILO modeled estimates; national definitions may differ from officially published national rates."
  },
  {
    key: "labor_force_participation",
    label: "Labor force participation rate (% of population 15+, modeled ILO)",
    unit: "% of population ages 15+",
    kind: "percent",
    wb: "SL.TLF.CACT.ZS",
    synonyms: ["labor force participation", "participation rate", "lfpr"]
  },
  {
    key: "population",
    label: "Population, total",
    unit: "people",
    kind: "level",
    wb: "SP.POP.TOTL",
    synonyms: ["population", "number of people", "inhabitants", "how many people"]
  },
  {
    key: "population_growth",
    label: "Population growth (annual %)",
    unit: "%",
    kind: "percent",
    wb: "SP.POP.GROW",
    synonyms: ["population growth", "population growth rate"]
  },
  {
    key: "current_account_gdp",
    label: "Current account balance (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "BN.CAB.XOKA.GD.ZS",
    datamapper: ["BCA_NGDPD", "WEO"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.BCA_NGDPD.pcent_gdp"],
    synonyms: ["current account", "current account balance", "external balance", "bop current account"]
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
    notes: "Primary source is the IMF WEO general government gross debt series; the World Bank WDI series covers central government only and is patchier."
  },
  {
    key: "fiscal_balance_gdp",
    label: "General government net lending/borrowing (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    datamapper: ["GGXCNL_NGDP", "WEO"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.GGXCNL_NGDP.pcent_gdp"],
    synonyms: ["fiscal balance", "budget balance", "fiscal deficit", "budget deficit", "government balance", "net lending"],
    notes: "Negative values indicate a fiscal deficit."
  },
  {
    key: "govt_revenue_gdp",
    label: "General government revenue (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    datamapper: ["GGR_G01_GDP_PT", "FM"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.GGR_NGDP.pcent_gdp"],
    synonyms: ["government revenue", "revenue to gdp", "fiscal revenue"]
  },
  {
    key: "govt_expenditure_gdp",
    label: "General government total expenditure (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    datamapper: ["G_X_G01_GDP_PT", "FM"],
    dbnomics: ["IMF", "WEO:latest", "{ISO3}.GGX_NGDP.pcent_gdp"],
    synonyms: ["government spending", "government expenditure", "public spending"]
  },
  {
    key: "tax_revenue_gdp",
    label: "Tax revenue (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "GC.TAX.TOTL.GD.ZS",
    synonyms: ["tax revenue", "tax to gdp", "tax burden"]
  },
  {
    key: "trade_gdp",
    label: "Trade (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NE.TRD.GNFS.ZS",
    synonyms: ["trade openness", "trade to gdp", "openness"],
    notes: "Sum of exports and imports of goods and services over GDP."
  },
  {
    key: "exports_gdp",
    label: "Exports of goods and services (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NE.EXP.GNFS.ZS",
    synonyms: ["exports", "export share"]
  },
  {
    key: "imports_gdp",
    label: "Imports of goods and services (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NE.IMP.GNFS.ZS",
    synonyms: ["imports", "import share"]
  },
  {
    key: "fdi_inflows_gdp",
    label: "Foreign direct investment, net inflows (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "BX.KLT.DINV.WD.GD.ZS",
    synonyms: ["fdi", "foreign direct investment", "fdi inflows"]
  },
  {
    key: "remittances_gdp",
    label: "Personal remittances, received (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "BX.TRF.PWKR.DT.GD.ZS",
    synonyms: ["remittances", "remittance inflows"]
  },
  {
    key: "gross_capital_formation_gdp",
    label: "Gross capital formation (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NE.GDI.TOTL.ZS",
    synonyms: ["investment rate", "capital formation", "gross investment"]
  },
  {
    key: "gross_savings_gdp",
    label: "Gross savings (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "NY.GNS.ICTR.ZS",
    synonyms: ["savings rate", "gross savings", "national savings"]
  },
  {
    key: "official_fx_rate",
    label: "Official exchange rate (LCU per US$, period average)",
    unit: "LCU per US$",
    kind: "rate",
    wb: "PA.NUS.FCRF",
    synonyms: ["exchange rate", "official exchange rate", "currency rate", "lcu per usd"]
  },
  {
    key: "reserves_months_imports",
    label: "Total reserves in months of imports",
    unit: "months of imports",
    kind: "level",
    wb: "FI.RES.TOTL.MO",
    synonyms: ["reserves", "import cover", "foreign reserves months"]
  },
  {
    key: "reserves_total_usd",
    label: "Total reserves (includes gold, current US$)",
    unit: "current US$",
    kind: "level",
    wb: "FI.RES.TOTL.CD",
    synonyms: ["total reserves", "foreign exchange reserves", "fx reserves"]
  },
  {
    key: "lending_rate",
    label: "Lending interest rate (%)",
    unit: "%",
    kind: "percent",
    wb: "FR.INR.LEND",
    synonyms: ["lending rate", "loan rate", "bank lending rate"]
  },
  {
    key: "deposit_rate",
    label: "Deposit interest rate (%)",
    unit: "%",
    kind: "percent",
    wb: "FR.INR.DPST",
    synonyms: ["deposit rate", "savings rate interest"]
  },
  {
    key: "real_interest_rate",
    label: "Real interest rate (%)",
    unit: "%",
    kind: "percent",
    wb: "FR.INR.RINR",
    synonyms: ["real interest rate"]
  },
  {
    key: "broad_money_gdp",
    label: "Broad money (% of GDP)",
    unit: "% of GDP",
    kind: "percent",
    wb: "FM.LBL.BMNY.GD.ZS",
    synonyms: ["broad money", "m2 to gdp", "money supply"]
  },
  {
    key: "gini",
    label: "Gini index",
    unit: "index (0\u2013100)",
    kind: "index",
    wb: "SI.POV.GINI",
    synonyms: ["gini", "gini coefficient", "inequality", "income inequality"],
    notes: "Survey-based; available only for survey years, often with multi-year gaps."
  },
  {
    key: "poverty_headcount_intl",
    label: "Poverty headcount ratio at $2.15/day, 2017 PPP (% of population)",
    unit: "% of population",
    kind: "percent",
    wb: "SI.POV.DDAY",
    synonyms: ["poverty rate", "extreme poverty", "poverty headcount"],
    notes: "Survey-based international poverty line; sparse for many countries."
  },
  {
    key: "life_expectancy",
    label: "Life expectancy at birth, total (years)",
    unit: "years",
    kind: "years",
    wb: "SP.DYN.LE00.IN",
    synonyms: ["life expectancy", "longevity"]
  },
  {
    key: "urban_population_share",
    label: "Urban population (% of total population)",
    unit: "% of population",
    kind: "percent",
    wb: "SP.URB.TOTL.IN.ZS",
    synonyms: ["urbanization", "urban population", "urban share"]
  },
  // ——— US higher-frequency series (FRED; require FRED_API_KEY) ———
  {
    key: "us_fed_funds_rate",
    label: "US federal funds effective rate (monthly, %)",
    unit: "%",
    kind: "percent",
    fred: "FEDFUNDS",
    synonyms: ["fed funds", "federal funds rate", "us policy rate", "fed rate"]
  },
  {
    key: "us_10y_treasury",
    label: "US 10-year Treasury constant maturity yield (daily, %)",
    unit: "%",
    kind: "percent",
    fred: "DGS10",
    synonyms: ["10 year treasury", "10y yield", "treasury yield"]
  },
  {
    key: "us_cpi_monthly",
    label: "US CPI for all urban consumers (monthly index, 1982\u201384 = 100)",
    unit: "index, 1982\u201384 = 100",
    kind: "index",
    fred: "CPIAUCSL",
    synonyms: ["us cpi monthly", "cpiaucsl"]
  },
  {
    key: "us_unemployment_monthly",
    label: "US unemployment rate (monthly, %)",
    unit: "%",
    kind: "percent",
    fred: "UNRATE",
    synonyms: ["us unemployment monthly", "unrate"]
  },
  {
    key: "us_nonfarm_payrolls",
    label: "US total nonfarm payrolls (monthly, thousands of persons)",
    unit: "thousands of persons",
    kind: "level",
    fred: "PAYEMS",
    synonyms: ["nonfarm payrolls", "payrolls", "payems", "jobs report"]
  },
  {
    key: "us_real_gdp",
    label: "US real GDP (quarterly, chained 2017 dollars, SAAR)",
    unit: "billions of chained 2017 US$",
    kind: "level",
    fred: "GDPC1",
    synonyms: ["us real gdp quarterly", "gdpc1"]
  }
];
var byKey = new Map(INDICATORS.map((d) => [d.key, d]));
function getIndicatorDef(key) {
  return byKey.get(key.toLowerCase().trim());
}
function searchIndicatorDefs(query, limit = 8) {
  const q = query.toLowerCase().replace(/[^a-z0-9% ]+/g, " ").trim();
  if (!q) return [];
  const qTokens = q.split(/\s+/).filter((t) => t.length > 1);
  const results = [];
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

// ../server/src/core/transforms.ts
function yoyLag(frequency) {
  switch ((frequency || "annual").toLowerCase()) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "daily":
      return 0;
    // not meaningful — treated as unsupported
    default:
      return 1;
  }
}
function parsePeriodParts(period) {
  let m = /^(\d{4})$/.exec(period);
  if (m) return { year: parseInt(m[1], 10) };
  m = /^(\d{4})-?[Qq]([1-4])$/.exec(period);
  if (m) return { year: parseInt(m[1], 10), quarter: parseInt(m[2], 10) };
  m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
  return null;
}
function periodKey(p) {
  return `${p.year}:${p.quarter ?? ""}:${p.month ?? ""}`;
}
function yearEarlier(p) {
  return { ...p, year: p.year - 1 };
}
function periodEarlier(p) {
  if (p.quarter != null) return p.quarter > 1 ? { year: p.year, quarter: p.quarter - 1 } : { year: p.year - 1, quarter: 4 };
  if (p.month != null) return p.month > 1 ? { year: p.year, month: p.month - 1 } : { year: p.year - 1, month: 12 };
  return { year: p.year - 1 };
}
function applyTransform(observations, transform, opts = {}) {
  if (transform === "none") return { observations };
  const obs = observations;
  if (transform === "yoy" || transform === "pct_change") {
    const lag = transform === "yoy" ? yoyLag(opts.frequency) : 1;
    if (lag === 0) throw new ToolError("year-over-year transform is not supported for daily series");
    const byPeriod = /* @__PURE__ */ new Map();
    for (const o of obs) {
      const p = parsePeriodParts(o.period);
      if (p) byPeriod.set(periodKey(p), o);
    }
    const out = [];
    for (let i = 0; i < obs.length; i++) {
      const p = parsePeriodParts(obs[i].period);
      const prevObs = p ? byPeriod.get(periodKey(transform === "yoy" ? yearEarlier(p) : periodEarlier(p))) : i >= lag ? obs[i - lag] : void 0;
      if (!prevObs) continue;
      const cur = obs[i].value;
      const prev = prevObs.value;
      out.push({
        ...obs[i],
        value: cur == null || prev == null || prev === 0 ? null : (cur - prev) / Math.abs(prev) * 100
      });
    }
    return {
      observations: out,
      note: transform === "yoy" ? `Computed by StatCite: year-over-year % change (lag ${lag} period${lag > 1 ? "s" : ""}).` : "Computed by StatCite: period-over-period % change."
    };
  }
  let base = obs.find((o) => o.period === opts.indexBasePeriod);
  if (!base) base = obs.find((o) => o.value != null);
  if (!base || base.value == null || base.value === 0) {
    throw new ToolError("cannot rebase to an index: no usable base observation", {
      requested_base: opts.indexBasePeriod ?? null
    });
  }
  const b = base.value;
  return {
    observations: obs.map((o) => ({ ...o, value: o.value == null ? null : o.value / b * 100 })),
    note: `Computed by StatCite: rebased to index, ${base.period} = 100.`
  };
}
function filterPeriodRange(observations, start, end) {
  if (!start && !end) return observations;
  const startY = start ? parseInt(start, 10) : -Infinity;
  const endY = end ? parseInt(end, 10) : Infinity;
  return observations.filter((o) => {
    const y = parseInt(o.period.slice(0, 4), 10);
    return !Number.isNaN(y) && y >= startY && y <= endY;
  });
}
function latestNonNull(observations) {
  for (let i = observations.length - 1; i >= 0; i--) {
    if (observations[i].value != null) return observations[i];
  }
  return void 0;
}

// ../server/src/core/upstream.ts
var USER_AGENT = "StatCite/1.0 (+https://statcite.com; data API for AI agents)";
var mem = /* @__PURE__ */ new Map();
var MEM_MAX = 400;
function redactUrl(url) {
  return url.replace(/api_key=[^&]+/gi, "api_key=REDACTED");
}
var UpstreamError = class extends Error {
  status;
  url;
  constructor(message, url, status) {
    super(redactUrl(message));
    this.name = "UpstreamError";
    this.url = redactUrl(url);
    this.status = status;
  }
};
async function doFetch(url, timeoutMs, ttlSeconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      redirect: "follow",
      signal: controller.signal,
      // Cloudflare edge cache for upstream GETs (effective on custom domains; ignored elsewhere).
      cf: { cacheTtl: ttlSeconds, cacheEverything: true }
    });
  } finally {
    clearTimeout(timer);
  }
}
var RETRY_DELAYS_MS = [300, 900];
var ShapeError = class extends Error {
  url;
  constructor(message, url) {
    super(redactUrl(message));
    this.name = "ShapeError";
    this.url = redactUrl(url);
  }
};
async function fetchJson(url, {
  ttlSeconds = 21600,
  timeoutMs = 8e3,
  validate
} = {}) {
  const hit = mem.get(url);
  const now = Date.now();
  if (hit && hit.exp > now) return hit.data;
  let lastErr;
  const maxAttempts = RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1;
    try {
      const res = await doFetch(url, timeoutMs, ttlSeconds);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(`Upstream returned HTTP ${res.status}`, url, res.status);
        await res.body?.cancel();
        if (!isLastAttempt) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new UpstreamError(`Upstream returned HTTP ${res.status}: ${body}`, url, res.status);
      }
      const data = await res.json();
      if (validate && !validate(data)) {
        lastErr = new ShapeError("Upstream returned a response that failed shape validation", url);
        if (!isLastAttempt) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw lastErr;
      }
      if (mem.size >= MEM_MAX) {
        const first = mem.keys().next().value;
        if (first !== void 0) mem.delete(first);
      }
      mem.set(url, { exp: now + ttlSeconds * 1e3, data });
      return data;
    } catch (e) {
      lastErr = e;
      if (e instanceof UpstreamError && e.status && e.status < 500 && e.status !== 429) throw e;
      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
    }
  }
  if (lastErr instanceof ShapeError) throw lastErr;
  if (lastErr instanceof Error) {
    throw lastErr instanceof UpstreamError ? lastErr : new UpstreamError(`Failed to reach upstream: ${lastErr.message}`, url);
  }
  throw new UpstreamError("Failed to reach upstream", url);
}
function memoFetchJson(memo2, url, opts) {
  let p = memo2.get(url);
  if (!p) {
    p = fetchJson(url, opts);
    memo2.set(url, p);
  }
  return p;
}
function isTransientUpstreamError(e) {
  if (e instanceof ToolError) return false;
  if (e instanceof UpstreamError) {
    if (e.status === 429 || e.status && e.status >= 500) return true;
    if (e.status === void 0) return true;
    return false;
  }
  return true;
}

// ../server/src/adapters/worldbank.ts
var BASE = "https://api.worldbank.org/v2";
function parseEnvelope(data, apiUrl) {
  if (!Array.isArray(data)) throw new ToolError("World Bank API returned an unexpected payload", { api_url: apiUrl });
  const first = data[0];
  if (first && Array.isArray(first.message)) {
    const msgs = first.message;
    const text = msgs.map((m) => `${m.key ?? ""}: ${m.value ?? ""}`).join("; ");
    throw new ToolError(`World Bank API error \u2014 ${text}`, { api_url: apiUrl });
  }
  const rows = data[1] ?? [];
  return { meta: first ?? {}, rows: Array.isArray(rows) ? rows : [] };
}
async function fetchWbSeries(countryCode, indicatorId, opts = {}) {
  const params = new URLSearchParams({ format: "json", per_page: String(opts.perPage ?? 1e3) });
  if (opts.mrv) params.set("mrv", String(opts.mrv));
  const apiUrl = `${BASE}/country/${encodeURIComponent(countryCode)}/indicator/${encodeURIComponent(indicatorId)}?${params}`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 21600 });
  const { meta, rows } = parseEnvelope(data, apiUrl);
  if (rows.length === 0) {
    throw new ToolError(
      `No World Bank data found for indicator ${indicatorId}, country ${countryCode}. The indicator code or country may be wrong, or the series may not be reported for this economy.`,
      { indicator: indicatorId, country: countryCode }
    );
  }
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return {
    indicatorId: sorted[0].indicator.id,
    indicatorName: sorted[0].indicator.value,
    countryIso3: sorted[0].countryiso3code || countryCode.toUpperCase(),
    countryName: sorted[0].country.value,
    observations: sorted.map((r) => ({ period: r.date, value: r.value })),
    lastUpdated: typeof meta.lastupdated === "string" ? meta.lastupdated : void 0,
    apiUrl
  };
}
async function fetchWbMulti(countryCode, indicatorIds, opts = {}) {
  const params = new URLSearchParams({ format: "json", source: "2", per_page: "2000" });
  if (opts.mrv) params.set("mrv", String(opts.mrv));
  const joined = indicatorIds.map(encodeURIComponent).join(";");
  const apiUrl = `${BASE}/country/${encodeURIComponent(countryCode)}/indicator/${joined}?${params}`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 21600 });
  const { meta, rows } = parseEnvelope(data, apiUrl);
  const out = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const id = r.indicator.id;
    let s = out.get(id);
    if (!s) {
      s = {
        indicatorId: id,
        indicatorName: r.indicator.value,
        countryIso3: r.countryiso3code || countryCode.toUpperCase(),
        countryName: r.country.value,
        observations: [],
        lastUpdated: typeof meta.lastupdated === "string" ? meta.lastupdated : void 0,
        apiUrl
      };
      out.set(id, s);
    }
    s.observations.push({ period: r.date, value: r.value });
  }
  for (const s of out.values()) s.observations.sort((a, b) => a.period.localeCompare(b.period));
  return out;
}

// ../server/src/adapters/dbnomics.ts
var BASE2 = "https://api.db.nomics.world/v22";
async function fetchDbnomicsSeries(providerCode, datasetCode, seriesCode) {
  const apiUrl = `${BASE2}/series/${encodeURIComponent(providerCode)}/${encodeURIComponent(datasetCode)}/${encodeURIComponent(seriesCode)}?observations=1`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 21600 });
  const docs = data.series?.docs ?? [];
  if (docs.length === 0) {
    throw new ToolError(
      `No DBnomics series found for ${providerCode}/${datasetCode}/${seriesCode}. Check the series code (browse at https://db.nomics.world/${providerCode}).`,
      { provider: providerCode, dataset: datasetCode, series: seriesCode }
    );
  }
  const exact = docs.find((d) => d.series_code === seriesCode);
  const doc = exact ?? [...docs].sort((a, b) => a.series_code.length - b.series_code.length).find((d) => d.series_code.startsWith(seriesCode)) ?? docs[0];
  const observations = doc.period.map((p, i) => {
    const raw = doc.value[i];
    const v = typeof raw === "number" ? raw : raw == null || raw === "NA" || typeof raw === "string" && raw.trim() === "" ? null : Number(raw);
    return { period: p, value: v == null || Number.isNaN(v) ? null : v };
  });
  return {
    providerCode: doc.provider_code,
    providerName: data.provider?.name ?? doc.provider_code,
    datasetCode: data.dataset?.code ?? doc.dataset_code,
    datasetName: data.dataset?.name ?? doc.dataset_name,
    seriesCode: doc.series_code,
    seriesName: doc.series_name,
    frequency: doc["@frequency"],
    observations,
    apiUrl
  };
}
async function searchDbnomicsDatasets(query, limit = 5) {
  const apiUrl = `${BASE2}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 86400 });
  return (data.results?.docs ?? []).map((d) => ({
    providerCode: d.provider_code,
    providerName: d.provider_name,
    datasetCode: d.code,
    datasetName: d.name,
    nbSeries: d.nb_series,
    url: `https://db.nomics.world/${d.provider_code}/${encodeURIComponent(d.code)}`
  }));
}

// ../server/src/adapters/fred.ts
var BASE3 = "https://api.stlouisfed.org/fred";
function fredAvailable(ctx) {
  return Boolean(ctx.fredApiKey);
}
function requireKey(ctx) {
  if (!ctx.fredApiKey) {
    throw new ToolError(
      "FRED series require this server to be configured with a FRED_API_KEY (free from https://fredaccount.stlouisfed.org/apikeys). Cross-country equivalents are available without FRED: try the `worldbank/...` series or a registry indicator key instead."
    );
  }
  return ctx.fredApiKey;
}
async function fetchFredSeries(ctx, seriesId, opts = {}) {
  const key = requireKey(ctx);
  const id = seriesId.toUpperCase();
  const metaUrl = `${BASE3}/series?series_id=${encodeURIComponent(id)}&api_key=${key}&file_type=json`;
  const meta = await fetchJson(metaUrl, { ttlSeconds: 86400 });
  const info = meta.seriess?.[0];
  if (!info) {
    throw new ToolError(`FRED series '${id}' not found${meta.error_message ? ` (${meta.error_message})` : ""}.`, {
      series: id
    });
  }
  const params = new URLSearchParams({ series_id: id, api_key: key, file_type: "json" });
  if (opts.start) params.set("observation_start", opts.start.length === 4 ? `${opts.start}-01-01` : opts.start);
  if (opts.end) params.set("observation_end", opts.end.length === 4 ? `${opts.end}-12-31` : opts.end);
  const obsUrl = `${BASE3}/series/observations?${params}`;
  const data = await fetchJson(obsUrl, { ttlSeconds: 21600 });
  const observations = (data.observations ?? []).map((o) => ({
    period: o.date,
    value: o.value === "." ? null : Number(o.value)
  }));
  return {
    seriesId: info.id,
    seriesName: info.title,
    units: info.units,
    frequency: info.frequency,
    observations,
    apiUrl: obsUrl
  };
}

// ../server/src/core/weo-calendar.ts
function expectedWeoEdition(now = /* @__PURE__ */ new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (m >= 11) return `${y}-10`;
  if (m >= 5) return `${y}-04`;
  return `${y - 1}-10`;
}

// ../server/src/adapters/datamapper.ts
var BASE4 = "https://www.imf.org/external/datamapper/api/v1";
var METADATA_URL = `${BASE4}/indicators`;
var VALUES_TTL_SECONDS = 3600;
var RELEASE_WINDOW_TTL_SECONDS = 300;
var METADATA_TTL_SECONDS = 3600;
var MIN_COUNTRY_KEYS = 150;
var COUNTRY_ALIASES = {
  PSE: "WBG",
  // West Bank and Gaza
  XKX: "UVK"
  // Kosovo
};
var MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};
function isWithinReleaseWindow(now) {
  const year = now.getUTCFullYear();
  const windowMs = 10 * 24 * 3600 * 1e3;
  for (const month of [4, 10]) {
    for (const y of [year, year - 1, year + 1]) {
      if (Math.abs(now.getTime() - Date.UTC(y, month - 1, 1)) <= windowMs) return true;
    }
  }
  return false;
}
function isValuesEnvelope(data, code) {
  if (!data || typeof data !== "object") return false;
  const values = data.values;
  if (!values || typeof values !== "object") return false;
  const inner = values[code];
  if (!inner || typeof inner !== "object") return false;
  const countryKeys = Object.keys(inner).filter(Boolean);
  return countryKeys.length >= MIN_COUNTRY_KEYS;
}
function isIndicatorsEnvelope(data) {
  if (!data || typeof data !== "object") return false;
  const indicators = data.indicators;
  return Boolean(indicators && typeof indicators === "object" && Object.keys(indicators).length > 50);
}
function parseEditionLabel(label) {
  if (!label) return void 0;
  const m = label.match(/\(([A-Za-z]+)\s+(\d{4})\)\s*$/);
  if (!m) return void 0;
  const month = MONTHS[m[1].toLowerCase()];
  const year = parseInt(m[2], 10);
  if (!month || !Number.isFinite(year)) return void 0;
  return { year, month };
}
function computeBoundaryYear(horizonYear, now = /* @__PURE__ */ new Date()) {
  const naive = horizonYear - 5;
  const calendarYear = parseInt(expectedWeoEdition(now).slice(0, 4), 10);
  if (Math.abs(naive - calendarYear) > 1) return { boundaryYear: calendarYear, clamped: true };
  return { boundaryYear: naive, clamped: false };
}
function memo(ctx) {
  if (!ctx._dmMemo) ctx._dmMemo = /* @__PURE__ */ new Map();
  return ctx._dmMemo;
}
async function fetchDataMapperMetadata(ctx) {
  try {
    const data = await memoFetchJson(memo(ctx), METADATA_URL, {
      ttlSeconds: METADATA_TTL_SECONDS,
      validate: isIndicatorsEnvelope
    });
    return data.indicators;
  } catch {
    return void 0;
  }
}
async function fetchDataMapperSeries(ctx, code, dataset, countryIso3, now = /* @__PURE__ */ new Date()) {
  const url = `${BASE4}/${encodeURIComponent(code)}`;
  const ttl = isWithinReleaseWindow(now) ? RELEASE_WINDOW_TTL_SECONDS : VALUES_TTL_SECONDS;
  let data;
  try {
    data = await memoFetchJson(memo(ctx), url, { ttlSeconds: ttl, validate: (d) => isValuesEnvelope(d, code) });
  } catch (e) {
    if (e instanceof ShapeError) {
      const meta = await fetchDataMapperMetadata(ctx);
      if (meta && !meta[code]) {
        throw new ToolError(
          `IMF DataMapper has no series for code '${code}' (confirmed absent from the live /indicators registry).`,
          { code }
        );
      }
      throw new UpstreamError(`IMF DataMapper returned no usable data for series '${code}' (decoy/empty envelope)`, url);
    }
    throw e;
  }
  const values = data.values[code];
  let horizonYear = 0;
  for (const iso of Object.keys(values)) {
    if (!iso) continue;
    for (const y of Object.keys(values[iso])) {
      const n = parseInt(y, 10);
      if (Number.isFinite(n) && n > horizonYear) horizonYear = n;
    }
  }
  const dmCountry = COUNTRY_ALIASES[countryIso3] ?? countryIso3;
  const countrySeries = values[dmCountry];
  if (!countrySeries) {
    throw new ToolError(
      `Country '${countryIso3}' is not present in the IMF DataMapper ${dataset} payload for series '${code}'.`,
      { code, country: countryIso3 }
    );
  }
  const observations = Object.entries(countrySeries).map(([period, value]) => ({ period, value: typeof value === "number" ? value : null })).sort((a, b) => a.period.localeCompare(b.period));
  const metaTable = await fetchDataMapperMetadata(ctx);
  const entry = metaTable?.[code];
  let edition;
  if (entry) {
    const parsed = parseEditionLabel(entry.source);
    edition = { label: entry.source, year: parsed?.year, month: parsed?.month, lastModified: entry["last-modified"] };
  }
  return {
    code,
    dataset,
    countryIso3,
    observations,
    edition,
    horizonYear,
    valuesApiUrl: url,
    metaApiUrl: METADATA_URL,
    humanUrl: `https://www.imf.org/external/datamapper/${encodeURIComponent(code)}@${dataset}/${encodeURIComponent(dmCountry)}`
  };
}

// ../server/src/core/citations.ts
var FRED_NOTICE = "This product uses the FRED\xAE API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";
var IMF_LICENSE = "Use and redistribution are subject to the IMF's data-usage terms, including attribution and downstream-user conditions; commercial reuse may require IMF permission \u2014 consult the IMF terms directly";
function worldBankCitation(ctx, opts) {
  const loc = opts.iso3 ? `?locations=${opts.iso3}` : "";
  const sourceUrl = `https://data.worldbank.org/indicator/${opts.indicatorId}${loc}`;
  const date = today(ctx);
  return {
    source: "World Bank",
    dataset: "World Development Indicators",
    series_id: opts.indicatorId,
    series_name: opts.indicatorName,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: "CC BY 4.0",
    attribution: `The World Bank: World Development Indicators: ${opts.indicatorName}`,
    retrieved_at: date,
    citation_text: `World Bank, World Development Indicators, series ${opts.indicatorId} (${opts.indicatorName})${opts.lastUpdated ? `, data last updated ${opts.lastUpdated}` : ""}. Retrieved ${date} via StatCite. ${sourceUrl}`
  };
}
function dbnomicsCitation(ctx, opts) {
  const sourceUrl = `https://db.nomics.world/${opts.providerCode}/${encodeURIComponent(opts.datasetCode)}/${encodeURIComponent(opts.seriesCode)}`;
  const date = today(ctx);
  const isImf = opts.providerCode === "IMF";
  return {
    source: opts.providerName,
    dataset: opts.datasetName,
    series_id: `${opts.providerCode}/${opts.datasetCode}/${opts.seriesCode}`,
    series_name: opts.seriesName,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: isImf ? IMF_LICENSE : `${opts.providerName} terms apply; retrieved via DBnomics (open aggregator)`,
    attribution: isImf ? "Source: International Monetary Fund" : `Source: ${opts.providerName} (via DBnomics)`,
    retrieved_at: date,
    citation_text: `${opts.providerName}, ${opts.datasetName}, series ${opts.seriesCode} (${opts.seriesName}). Retrieved ${date} via DBnomics/StatCite. ${sourceUrl}`
  };
}
function imfDataMapperCitation(ctx, opts) {
  const date = today(ctx);
  const datasetName = opts.dataset === "FM" ? "IMF Fiscal Monitor" : "IMF World Economic Outlook";
  const alreadyNamed = /world economic outlook|fiscal monitor/i.test(opts.editionLabel);
  const datasetSuffix = alreadyNamed ? "" : ` (${datasetName})`;
  return {
    source: "International Monetary Fund",
    dataset: opts.editionLabel,
    series_id: `imf/${opts.code}`,
    series_name: opts.seriesName,
    source_url: opts.sourceUrl,
    api_url: opts.apiUrl,
    license: IMF_LICENSE,
    attribution: "Source: International Monetary Fund",
    retrieved_at: date,
    citation_text: `International Monetary Fund, ${opts.editionLabel}${datasetSuffix}, ${opts.seriesName}, series ${opts.code}. Retrieved ${date} via the IMF DataMapper API/StatCite. ${opts.sourceUrl}`,
    ...opts.lastModified ? { notices: [`IMF data load timestamp: ${opts.lastModified} UTC.`] } : {}
  };
}
function fredCitation(ctx, opts) {
  const sourceUrl = `https://fred.stlouisfed.org/series/${opts.seriesId}`;
  const date = today(ctx);
  return {
    source: "Federal Reserve Bank of St. Louis (FRED)",
    dataset: "FRED, Federal Reserve Economic Data",
    series_id: opts.seriesId,
    series_name: opts.seriesName,
    source_url: sourceUrl,
    api_url: opts.apiUrl ? opts.apiUrl.replace(/api_key=[^&]+/, "api_key=REDACTED") : void 0,
    license: "FRED\xAE API Terms of Use; check series page for third-party data owners",
    attribution: `Federal Reserve Bank of St. Louis, FRED series ${opts.seriesId}`,
    retrieved_at: date,
    citation_text: `Federal Reserve Bank of St. Louis, FRED, series ${opts.seriesId} (${opts.seriesName}). Retrieved ${date} via StatCite. ${sourceUrl}`,
    notices: [FRED_NOTICE]
  };
}
function ecbFxCitation(ctx, opts) {
  const date = today(ctx);
  const sourceUrl = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
  return {
    source: "European Central Bank",
    dataset: "Euro foreign exchange reference rates (via Frankfurter)",
    series_id: `ECB/${opts.base}${opts.quote}`,
    series_name: `${opts.base}/${opts.quote} reference exchange rate`,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: "ECB reference rates are published for information purposes; reuse with attribution",
    attribution: "Source: European Central Bank euro foreign exchange reference rates",
    retrieved_at: date,
    citation_text: `European Central Bank, euro foreign exchange reference rates, ${opts.base}/${opts.quote} as of ${opts.rateDate} (via Frankfurter). Retrieved ${date} via StatCite. ${sourceUrl}`,
    notices: [
      "ECB reference rates are indicative and 'for information purposes'; they are not transaction rates."
    ]
  };
}

// ../server/src/core/series.ts
function requireCountry(input) {
  const c = resolveCountry(input);
  if (!c) {
    const suggestions = suggestCountries(input);
    throw new ToolError(
      `Could not resolve country '${input}'. Use an ISO3 code (e.g. USA, BRB, DEU) or a standard English name.` + (suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""),
      { input, suggestions }
    );
  }
  return c;
}
function finishSeries(result, opts) {
  let obs = filterPeriodRange(result.observations, opts.start, opts.end);
  const transform = opts.transform ?? "none";
  const hadValuesBeforeTransform = obs.some((o) => o.value != null);
  if (transform !== "none") {
    const t = applyTransform(obs, transform, { frequency: result.frequency });
    obs = t.observations;
    if (t.note) result.notes.push(t.note);
  }
  let a = 0;
  let b = obs.length;
  while (a < b && obs[a].value == null) a++;
  while (b > a && obs[b - 1].value == null) b--;
  obs = obs.slice(a, b);
  if (opts.limit === 1) {
    const nonNull = obs.filter((o) => o.value != null);
    const outturns = nonNull.filter((o) => !/projection/i.test(o.note ?? ""));
    if (outturns.length && nonNull.length > outturns.length) {
      result.notes.push("Latest value not marked as a projection shown; later IMF estimate/projection periods exist for this series.");
    }
    obs = (outturns.length ? outturns : nonNull).slice(-1);
  } else if (opts.limit && opts.limit > 0 && obs.length > opts.limit) {
    obs = obs.slice(-opts.limit);
  }
  if (obs.length === 0) {
    if (transform !== "none" && hadValuesBeforeTransform) {
      throw new ToolError(
        `The '${transform}' transform produced no observations for ${result.series_id}${result.country ? ` (${result.country.name})` : ""}: the series has data in the requested window, but not enough prior-period observations to compute changes. Try widening start_year to include earlier periods, or drop the transform.`,
        { series_id: result.series_id, transform }
      );
    }
    throw new ToolError(
      `No observations available for ${result.series_id}${result.country ? ` (${result.country.name})` : ""} in the requested window` + (opts.start || opts.end ? ` ${opts.start ?? "\u2026"}\u2013${opts.end ?? "\u2026"}` : "") + ". Try widening the period.",
      { series_id: result.series_id }
    );
  }
  result.observations = obs;
  return result;
}
function weoProjectionNote(vintageTag, observations) {
  const m = vintageTag.match(/^(WEO|FM):(\d{4})/);
  if (!m) return void 0;
  const kind = m[1] === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";
  const vintage = parseInt(m[2], 10);
  const hasFuture = observations.some((o) => parseInt(o.period.slice(0, 4), 10) >= vintage);
  return hasFuture ? `Values for ${vintage} onward are ${kind} estimates/projections from the ${vintageTag.replace(/^(WEO|FM):/, "")} vintage, not final outturns. This boundary is a vintage-year heuristic: the IMF's "latest actual" year varies by country and series, so some observations before ${vintage} may also be IMF staff estimates rather than final outturns.` : void 0;
}
function weoVintageStaleNote(datasetCode, now = /* @__PURE__ */ new Date(), channel = "dbnomics") {
  const m = datasetCode.match(/(WEO|FM):(\d{4}-\d{2})/);
  if (!m) return void 0;
  const kind = m[1] === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";
  const resolved = m[2];
  const expected = expectedWeoEdition(now);
  if (resolved >= expected) return void 0;
  if (channel === "datamapper") {
    return `${kind} vintage ${resolved} is the edition currently served via the IMF DataMapper API; the IMF has likely published a newer release (expected ${expected}) that the DataMapper API has not yet loaded. Values, estimates, and projections reflect the ${resolved} vintage, not necessarily the IMF's current release.`;
  }
  return `IMF WEO vintage ${resolved} is the newest edition available via DBnomics (this server's IMF data path); the IMF has likely published a newer WEO release (expected ${expected}) that DBnomics has not yet ingested. Values, estimates, and projections reflect the ${resolved} vintage, not necessarily the IMF's current release.`;
}
function markWeoProjections(vintageTag, observations) {
  const m = vintageTag.match(/^(WEO|FM):(\d{4})/);
  if (!m) return;
  const kind = m[1] === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";
  const vintage = parseInt(m[2], 10);
  for (const o of observations) {
    if (parseInt(o.period.slice(0, 4), 10) >= vintage) o.note = `${kind} estimate/projection`;
  }
}
async function indicatorFromWb(ctx, def, country, opts) {
  const wb = await fetchWbSeries(country.iso3, def.wb);
  const citation = worldBankCitation(ctx, {
    indicatorId: wb.indicatorId,
    indicatorName: wb.indicatorName,
    iso3: wb.countryIso3,
    apiUrl: wb.apiUrl,
    lastUpdated: wb.lastUpdated
  });
  const result = {
    series_id: `worldbank/${wb.indicatorId}`,
    name: wb.indicatorName,
    country: { iso3: wb.countryIso3, name: wb.countryName },
    unit: def.unit,
    frequency: "annual",
    observations: wb.observations,
    citation,
    notes: def.notes ? [def.notes] : []
  };
  return finishSeries(result, opts);
}
async function indicatorFromDbnomics(ctx, def, country, opts) {
  const [provider, dataset, template] = def.dbnomics;
  const code = template.replace("{ISO3}", country.iso3);
  const s = await fetchDbnomicsSeries(provider, dataset, code);
  const citation = dbnomicsCitation(ctx, {
    providerName: s.providerName,
    providerCode: s.providerCode,
    datasetCode: s.datasetCode,
    datasetName: s.datasetName,
    seriesCode: s.seriesCode,
    seriesName: s.seriesName,
    apiUrl: s.apiUrl
  });
  const notes = def.notes ? [def.notes] : [];
  const projNote = weoProjectionNote(s.datasetCode, s.observations);
  if (projNote) notes.push(projNote);
  const staleNote = weoVintageStaleNote(s.datasetCode);
  if (staleNote) notes.push(staleNote);
  markWeoProjections(s.datasetCode, s.observations);
  const result = {
    series_id: `dbnomics/${s.providerCode}/${s.datasetCode}/${s.seriesCode}`,
    name: s.seriesName,
    country: { iso3: country.iso3, name: country.name },
    unit: def.unit,
    frequency: s.frequency ?? "annual",
    observations: s.observations,
    citation,
    notes
  };
  return finishSeries(result, opts);
}
var REF_WEO_CODE = "NGDP_RPCH";
var REF_FM_CODE = "GGR_G01_GDP_PT";
function crossEditionMismatchNote(metaTable, dataset, thisEdition) {
  if (!metaTable || !thisEdition?.year || !thisEdition?.month) return void 0;
  const refCode = dataset === "FM" ? REF_WEO_CODE : REF_FM_CODE;
  const refKind = dataset === "FM" ? "WEO" : "Fiscal Monitor";
  const other = metaTable[refCode];
  if (!other) return void 0;
  const otherEd = parseEditionLabel(other.source);
  if (!otherEd || otherEd.year === thisEdition.year && otherEd.month === thisEdition.month) return void 0;
  return `The IMF's ${refKind} database is currently at a different edition (${other.source}) than this series' edition (${thisEdition.label}) \u2014 fiscal indicators drawn from the two databases (e.g. revenue/expenditure vs. debt/balance) may temporarily reflect different releases.`;
}
async function indicatorFromDataMapper(ctx, def, country, opts) {
  const [code, dataset] = def.datamapper;
  const now = ctx.now ? ctx.now() : /* @__PURE__ */ new Date();
  const s = await fetchDataMapperSeries(ctx, code, dataset, country.iso3, now);
  const { boundaryYear, clamped } = computeBoundaryYear(s.horizonYear, now);
  const kind = dataset === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";
  const notes = def.notes ? [def.notes] : [];
  let editionLabel;
  if (s.edition?.year && s.edition?.month) {
    editionLabel = s.edition.label;
  } else {
    editionLabel = `${boundaryYear} vintage (April or October edition \u2014 edition metadata unavailable; a newer edition may exist)`;
    notes.push(
      "The IMF DataMapper edition-metadata endpoint was unavailable, or does not list this series; only the vintage year could be inferred from the data's own projection horizon, not the edition month."
    );
  }
  if (s.edition?.year && s.edition?.month) {
    const editionTag = `${dataset}:${s.edition.year}-${String(s.edition.month).padStart(2, "0")}`;
    const staleNote = weoVintageStaleNote(editionTag, now, "datamapper");
    if (staleNote) notes.push(staleNote);
    const gap = s.horizonYear - s.edition.year;
    if (gap !== 5) {
      notes.push(
        `This series' data horizon (through ${s.horizonYear}) is ${Math.abs(gap - 5)} year(s) off the usual edition-year-plus-5 pattern for the ${editionLabel} edition \u2014 the values and edition-label fetches may reflect slightly different load moments. The projection boundary used here (${boundaryYear}) is derived from the data's own horizon, not the label, so this does not affect which values are flagged as projections.`
      );
    }
    if (s.edition.lastModified) {
      const lm = /* @__PURE__ */ new Date(s.edition.lastModified.replace(" ", "T") + "Z");
      const editionLoadMs = Date.UTC(s.edition.year, s.edition.month - 1, 1);
      if (!Number.isNaN(lm.getTime())) {
        const daysSince = (lm.getTime() - editionLoadMs) / (24 * 3600 * 1e3);
        if (daysSince > 40) {
          notes.push(
            `The IMF reloaded this series' data on ${s.edition.lastModified.slice(0, 10)}, ${Math.round(daysSince)} day(s) after the ${editionLabel} release \u2014 values may include a post-release revision (e.g. a WEO Update) not contained in the originally-published ${editionLabel} database.`
          );
        }
      }
    }
  }
  if (clamped) {
    notes.push(
      `The data horizon implied a projection-boundary year that looked implausible against the IMF's release calendar, so the calendar year (${boundaryYear}) was used instead \u2014 possible if this payload is truncated or mid-load.`
    );
  }
  if (DB_PRIMARY.has(def.key)) {
    const metaTable = await fetchDataMapperMetadata(ctx);
    const mismatch = crossEditionMismatchNote(metaTable, dataset, s.edition);
    if (mismatch) notes.push(mismatch);
  }
  if (dataset === "WEO") {
    notes.push(
      "IMF DataMapper serves WEO-database values rounded to one decimal place (Fiscal Monitor-sourced fiscal series are full precision); derived transforms (e.g. year-over-year change) computed from these values can carry up to \xB10.1 of additional rounding error."
    );
  }
  const countryMaxYear = s.observations.reduce(
    (m, o) => o.value != null ? Math.max(m, parseInt(o.period, 10) || 0) : m,
    0
  );
  const base = `Values for ${boundaryYear} onward are ${kind} estimates/projections, not final outturns. This boundary is a vintage-year heuristic derived from the data's own projection horizon: the IMF's "latest actual" year varies by country and series, so some observations before ${boundaryYear} may also be IMF staff estimates rather than final outturns.`;
  notes.push(
    countryMaxYear > 0 && countryMaxYear < boundaryYear ? `${base} The IMF publishes no current-edition projections for ${country.name} on this series; it ends at ${countryMaxYear} \u2014 treat recent values as unconfirmed estimates, not the IMF's current assessment.` : base
  );
  const observations = s.observations.map((o) => ({ ...o }));
  for (const o of observations) {
    const y = parseInt(o.period.slice(0, 4), 10);
    if (Number.isFinite(y) && y >= boundaryYear) o.note = `${kind} estimate/projection`;
  }
  const citation = imfDataMapperCitation(ctx, {
    code: s.code,
    dataset,
    seriesName: def.label,
    editionLabel,
    sourceUrl: s.humanUrl,
    apiUrl: s.valuesApiUrl,
    lastModified: s.edition?.lastModified
  });
  const result = {
    series_id: `imf/${s.code}`,
    name: def.label,
    country: { iso3: country.iso3, name: country.name },
    unit: def.unit,
    frequency: "annual",
    observations,
    citation,
    notes
  };
  return finishSeries(result, opts);
}
async function indicatorFromFred(ctx, def, opts) {
  const s = await fetchFredSeries(ctx, def.fred, { start: opts.start, end: opts.end });
  const citation = fredCitation(ctx, { seriesId: s.seriesId, seriesName: s.seriesName, units: s.units, apiUrl: s.apiUrl });
  const result = {
    series_id: `fred/${s.seriesId}`,
    name: s.seriesName,
    country: { iso3: "USA", name: "United States" },
    unit: s.units ?? def.unit,
    frequency: s.frequency?.toLowerCase(),
    observations: s.observations,
    citation,
    notes: def.notes ? [def.notes] : []
  };
  return finishSeries(result, opts);
}
async function getIndicator(ctx, key, countryInput, opts = {}) {
  const def = getIndicatorDef(key);
  if (!def) {
    const near = searchIndicatorDefs(key, 5).map((m) => m.def.key);
    throw new ToolError(
      `Unknown indicator '${key}'.` + (near.length ? ` Closest matches: ${near.join(", ")}.` : "") + " Use search_indicators to browse the registry, or pass an explicit series id like 'worldbank/NY.GDP.MKTP.KD.ZG'.",
      { input: key, suggestions: near }
    );
  }
  const country = requireCountry(countryInput);
  if (!def.wb && !def.dbnomics && def.fred) {
    if (country.iso3 !== "USA") {
      throw new ToolError(`Indicator '${def.key}' is a US-specific series (FRED ${def.fred}).`, { indicator: def.key });
    }
    return indicatorFromFred(ctx, def, opts);
  }
  const preferDbnomics = def.dbnomics && (!def.wb || DB_PRIMARY.has(def.key));
  const attempts = [];
  const pushImfChain = () => {
    if (def.datamapper) {
      attempts.push({ label: "IMF DataMapper API", run: () => indicatorFromDataMapper(ctx, def, country, opts) });
    }
    if (def.dbnomics) {
      attempts.push({ label: "IMF WEO (via DBnomics)", run: () => indicatorFromDbnomics(ctx, def, country, opts) });
    }
  };
  if (preferDbnomics) {
    pushImfChain();
    if (def.wb) attempts.push({ label: "World Bank WDI", run: () => indicatorFromWb(ctx, def, country, opts) });
  } else {
    if (def.wb) attempts.push({ label: "World Bank WDI", run: () => indicatorFromWb(ctx, def, country, opts) });
    pushImfChain();
  }
  if (def.fred && country.iso3 === "USA" && fredAvailable(ctx) && attempts.length === 0) {
    attempts.push({ label: "FRED", run: () => indicatorFromFred(ctx, def, opts) });
  }
  const tried = opts.strictSource ? attempts.slice(0, 1) : attempts;
  const errors = [];
  let firstErrorWasTransient = false;
  let anyErrorWasTransient = false;
  for (let i = 0; i < tried.length; i++) {
    try {
      const result = await tried[i].run();
      if (i > 0) {
        result.fallback_used = true;
        result.fallback_reason = anyErrorWasTransient ? "transient" : "definitive";
        const primaryLabel = tried[0].label;
        const servedLabel = tried[i].label;
        result.notes.push(
          firstErrorWasTransient ? `${primaryLabel} was transiently unavailable for this request; served from ${servedLabel} instead, which may use a different statistical definition and can report a different value for the same nominal indicator. If exact consistency with ${primaryLabel} matters, retry this query \u2014 the primary source may have recovered. (${errors[0]})` : `${primaryLabel} does not have this indicator/country/period; served from ${servedLabel} instead. (${errors[0]})`
        );
      }
      return result;
    } catch (e) {
      const transient = isTransientUpstreamError(e);
      if (i === 0) firstErrorWasTransient = transient;
      if (transient) anyErrorWasTransient = true;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (opts.strictSource && attempts.length > tried.length) {
    throw new ToolError(
      `Could not retrieve '${def.key}' for ${country.name} from its primary source (${tried[0].label}): ${errors.join(" | ")}. strict_source=true prevented fallback to ${attempts[1].label}` + (firstErrorWasTransient ? "; the failure looks transient \u2014 retrying this query may succeed, or drop strict_source to accept the fallback source" : "") + ".",
      { indicator: def.key, country: country.iso3, strict_source: true }
    );
  }
  throw new ToolError(
    `Could not retrieve '${def.key}' for ${country.name}: ${errors.join(" | ")}`,
    { indicator: def.key, country: country.iso3 }
  );
}
var DB_PRIMARY = /* @__PURE__ */ new Set(["govt_debt_gdp", "fiscal_balance_gdp", "govt_revenue_gdp", "govt_expenditure_gdp"]);
var DM_CODE_INFO = /* @__PURE__ */ new Map();
for (const d of INDICATORS) {
  if (d.datamapper) DM_CODE_INFO.set(d.datamapper[0], { dataset: d.datamapper[1], def: d });
}
async function getSeries(ctx, seriesId, opts = {}) {
  const id = seriesId.trim();
  const lower = id.toLowerCase();
  if (lower.startsWith("worldbank/") || lower.startsWith("wb/")) {
    const code = id.slice(id.indexOf("/") + 1);
    if (!opts.country) {
      throw new ToolError("World Bank series require a 'country' parameter (ISO3 code or name).", { series_id: id });
    }
    const country = requireCountry(opts.country);
    const wb = await fetchWbSeries(country.iso3, code);
    const citation = worldBankCitation(ctx, {
      indicatorId: wb.indicatorId,
      indicatorName: wb.indicatorName,
      iso3: wb.countryIso3,
      apiUrl: wb.apiUrl,
      lastUpdated: wb.lastUpdated
    });
    return finishSeries(
      {
        series_id: `worldbank/${wb.indicatorId}`,
        name: wb.indicatorName,
        country: { iso3: wb.countryIso3, name: wb.countryName },
        frequency: "annual",
        observations: wb.observations,
        citation,
        notes: []
      },
      opts
    );
  }
  if (lower.startsWith("imf/")) {
    const code = id.slice(4);
    const info = DM_CODE_INFO.get(code);
    if (!info) {
      throw new ToolError(
        `Unrecognized IMF DataMapper code '${code}'. Known codes: ${[...DM_CODE_INFO.keys()].join(", ")}.`,
        { series_id: id }
      );
    }
    if (!opts.country) {
      throw new ToolError("IMF DataMapper series require a 'country' parameter (ISO3 code or name).", { series_id: id });
    }
    const country = requireCountry(opts.country);
    return indicatorFromDataMapper(ctx, info.def, country, opts);
  }
  if (lower.startsWith("fred/")) {
    const code = id.slice(5);
    const s = await fetchFredSeries(ctx, code, { start: opts.start, end: opts.end });
    const citation = fredCitation(ctx, { seriesId: s.seriesId, seriesName: s.seriesName, units: s.units, apiUrl: s.apiUrl });
    return finishSeries(
      {
        series_id: `fred/${s.seriesId}`,
        name: s.seriesName,
        country: { iso3: "USA", name: "United States" },
        unit: s.units,
        frequency: s.frequency?.toLowerCase(),
        observations: s.observations,
        citation,
        notes: []
      },
      opts
    );
  }
  if (lower.startsWith("dbnomics/")) {
    const parts = id.split("/");
    if (parts.length < 4) {
      throw new ToolError(
        "DBnomics series ids have the form dbnomics/PROVIDER/DATASET/SERIES (e.g. dbnomics/IMF/WEO:latest/USA.NGDP_RPCH.pcent_change).",
        { series_id: id }
      );
    }
    const [, provider, dataset, ...rest] = parts;
    const s = await fetchDbnomicsSeries(provider, dataset, rest.join("/"));
    const citation = dbnomicsCitation(ctx, {
      providerName: s.providerName,
      providerCode: s.providerCode,
      datasetCode: s.datasetCode,
      datasetName: s.datasetName,
      seriesCode: s.seriesCode,
      seriesName: s.seriesName,
      apiUrl: s.apiUrl
    });
    const notes = [];
    const projNote = weoProjectionNote(s.datasetCode, s.observations);
    if (projNote) notes.push(projNote);
    const staleNote = weoVintageStaleNote(s.datasetCode);
    if (staleNote) notes.push(staleNote);
    markWeoProjections(s.datasetCode, s.observations);
    return finishSeries(
      {
        series_id: `dbnomics/${s.providerCode}/${s.datasetCode}/${s.seriesCode}`,
        name: s.seriesName,
        frequency: s.frequency,
        observations: s.observations,
        citation,
        notes
      },
      opts
    );
  }
  if (getIndicatorDef(id)) {
    if (!opts.country) {
      throw new ToolError(`'${id}' is a registry indicator \u2014 pass a 'country' as well, or use the get_indicator tool.`);
    }
    return getIndicator(ctx, id, opts.country, opts);
  }
  throw new ToolError(
    `Unrecognized series id '${id}'. Expected 'worldbank/CODE', 'fred/ID', 'dbnomics/PROVIDER/DATASET/SERIES', or a registry indicator key (see search_indicators).`,
    { series_id: id }
  );
}
async function searchIndicators(ctx, query, opts = {}) {
  const matches = searchIndicatorDefs(query, 8);
  const items = matches.map((m) => ({
    type: "indicator",
    id: m.def.key,
    title: m.def.label,
    description: `${m.def.unit}${m.def.notes ? ` \u2014 ${m.def.notes}` : ""}`,
    url: m.def.wb ? `https://data.worldbank.org/indicator/${m.def.wb}` : void 0,
    usage: `get_indicator(indicator="${m.def.key}", country="<ISO3 or name>")`
  }));
  if (opts.includeDbnomics !== false && items.length < 5) {
    try {
      const ds = await searchDbnomicsDatasets(query, 4);
      for (const d of ds) {
        items.push({
          type: "dbnomics_dataset",
          id: `dbnomics/${d.providerCode}/${d.datasetCode}`,
          title: `${d.providerName}: ${d.datasetName}`,
          description: `${d.nbSeries.toLocaleString("en-US")} series \u2014 browse then fetch with get_series('dbnomics/${d.providerCode}/${d.datasetCode}/SERIES_CODE')`,
          url: d.url
        });
      }
    } catch {
    }
  }
  return items;
}
function listRegistry() {
  return INDICATORS.map((d) => {
    const dmLabel = d.datamapper ? "IMF DataMapper API (current WEO/Fiscal Monitor)" : void 0;
    const dbLabel = d.dbnomics ? `${d.dbnomics[0]} ${d.dbnomics[1].replace(":latest", "")} (via DBnomics)` : void 0;
    const wbLabel = d.wb ? "World Bank WDI" : void 0;
    const dbFirst = d.dbnomics && (!d.wb || DB_PRIMARY.has(d.key));
    const imfChain = [...dmLabel ? [dmLabel] : [], ...dbLabel ? [dbLabel] : []];
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      sources: [
        ...dbFirst ? [...imfChain, ...wbLabel ? [wbLabel] : []] : [...wbLabel ? [wbLabel] : [], ...imfChain],
        ...d.fred ? ["FRED (US)"] : []
      ],
      notes: d.notes
    };
  });
}

// ../server/src/core/snapshot.ts
var SNAPSHOT_WB_KEYS = [
  "gdp_current_usd",
  "gdp_growth",
  "gdp_per_capita_usd",
  "inflation_cpi",
  "unemployment_rate",
  "population",
  "current_account_gdp",
  "trade_gdp",
  "fdi_inflows_gdp",
  "life_expectancy"
];
async function countrySnapshot(ctx, countryInput) {
  const country = requireCountry(countryInput);
  const defs = SNAPSHOT_WB_KEYS.map((k) => getIndicatorDef(k));
  const codes = defs.map((d) => d.wb);
  const byCode2 = await fetchWbMulti(country.iso3, codes, { mrv: 8 });
  const items = [];
  const missing = [];
  const notes = [
    "Latest available observation per indicator; periods differ because sources update on different schedules."
  ];
  let countryName = country.name;
  for (const def of defs) {
    const s = byCode2.get(def.wb);
    const latest = s ? latestNonNull(s.observations) : void 0;
    if (!s || !latest || latest.value == null) {
      missing.push(def.key);
      continue;
    }
    countryName = s.countryName;
    items.push({
      indicator: def.key,
      label: s.indicatorName,
      period: latest.period,
      value: latest.value,
      unit: def.unit,
      citation: worldBankCitation(ctx, {
        indicatorId: s.indicatorId,
        indicatorName: s.indicatorName,
        iso3: s.countryIso3,
        apiUrl: s.apiUrl,
        lastUpdated: s.lastUpdated
      })
    });
  }
  const fallbackIndicators = [];
  try {
    const debtDef = getIndicatorDef("govt_debt_gdp");
    const s = await getIndicator(ctx, "govt_debt_gdp", country.iso3, { limit: 1 });
    const latest = latestNonNull(s.observations);
    if (latest && latest.value != null) {
      items.push({
        indicator: debtDef.key,
        label: s.name,
        period: latest.period,
        value: latest.value,
        unit: debtDef.unit,
        citation: s.citation
      });
      if (s.fallback_used) {
        fallbackIndicators.push("govt_debt_gdp");
        notes.push(`Government debt: ${s.notes[s.notes.length - 1] ?? "served from a fallback source."}`);
      }
    } else {
      missing.push("govt_debt_gdp");
    }
  } catch {
    missing.push("govt_debt_gdp");
  }
  if (items.length === 0) {
    throw new ToolError(`No snapshot data available for '${countryInput}' (${country.iso3}).`, {
      country: country.iso3
    });
  }
  return {
    country: { iso3: country.iso3, name: countryName },
    as_of: new Date(ctx.now ? ctx.now() : /* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    indicators: items,
    missing,
    notes,
    ...fallbackIndicators.length ? { fallback_used: true, fallback_indicators: fallbackIndicators } : {}
  };
}

// ../server/src/core/inflation.ts
async function inflationAdjust(ctx, amount, fromYear, toYear, countryInput = "USA") {
  if (!Number.isFinite(amount)) throw new ToolError("'amount' must be a number.");
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) {
    throw new ToolError("'from_year' and 'to_year' must be integer years, e.g. 1995 and 2025.");
  }
  const country = requireCountry(countryInput);
  const wb = await fetchWbSeries(country.iso3, "FP.CPI.TOTL");
  const byYear = new Map(wb.observations.filter((o) => o.value != null).map((o) => [parseInt(o.period, 10), o.value]));
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length === 0) {
    throw new ToolError(`No CPI index data available for ${country.name}.`, { country: country.iso3 });
  }
  const min = years[0];
  const max = years[years.length - 1];
  const from = byYear.get(fromYear);
  const to = byYear.get(toYear);
  if (from == null || to == null) {
    throw new ToolError(
      `CPI index for ${country.name} covers ${min}\u2013${max}; requested ${fromYear}\u2192${toYear}. Missing: ${[from == null ? fromYear : null, to == null ? toYear : null].filter(Boolean).join(", ")}.`,
      { available_range: [min, max] }
    );
  }
  const factor = to / from;
  const adjusted = amount * factor;
  const notes = [
    "Annual-average CPI; sub-year precision is not represented.",
    "CPI measures consumer prices \u2014 for comparing incomes or output across years, a GDP deflator may be more appropriate."
  ];
  if (country.iso3 === "USA") {
    notes.push("For US monthly precision, the FRED series CPIAUCSL is available via get_series('fred/CPIAUCSL') when the server has a FRED key.");
  }
  return {
    original_amount: amount,
    from_year: fromYear,
    to_year: toYear,
    adjusted_amount: Number(adjusted.toFixed(6)),
    factor: Number(factor.toFixed(6)),
    country: { iso3: wb.countryIso3, name: wb.countryName },
    index_used: { series: "worldbank/FP.CPI.TOTL", from_value: from, to_value: to, base: "2010 = 100" },
    method: `adjusted = amount \xD7 CPI(${toYear}) / CPI(${fromYear}) = ${amount} \xD7 ${to} / ${from}`,
    citation: worldBankCitation(ctx, {
      indicatorId: wb.indicatorId,
      indicatorName: wb.indicatorName,
      iso3: wb.countryIso3,
      apiUrl: wb.apiUrl,
      lastUpdated: wb.lastUpdated
    }),
    notes
  };
}

// ../server/src/adapters/frankfurter.ts
var BASE5 = "https://api.frankfurter.dev/v1";
async function listEcbCurrencies() {
  return await fetchJson(`${BASE5}/currencies`, { ttlSeconds: 86400 });
}
async function getEcbRates(base, symbols, date) {
  if (date && date < "1999-01-04") {
    throw new ToolError(
      "ECB reference rates begin on 1999-01-04. For earlier periods use annual official rates (World Bank series PA.NUS.FCRF).",
      { requested_date: date }
    );
  }
  const path = date ? `/${date}` : "/latest";
  const apiUrl = `${BASE5}${path}?base=${encodeURIComponent(base)}&symbols=${symbols.map(encodeURIComponent).join(",")}`;
  const data = await fetchJson(apiUrl, { ttlSeconds: date ? 604800 : 1800 });
  if (!data.rates || !data.date) {
    throw new ToolError("Frankfurter returned an unexpected payload", { api_url: apiUrl });
  }
  return { base: data.base ?? base, date: data.date, rates: data.rates, apiUrl };
}
async function getEcbAnnualAverage(base, symbol, year) {
  if (year < 1999) {
    throw new ToolError("ECB reference rates begin in 1999; earlier years use World Bank annual official rates.", { year });
  }
  const apiUrl = `${BASE5}/${year}-01-01..${year}-12-31?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(symbol)}`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 604800 });
  const days = Object.values(data.rates ?? {});
  const values = days.map((d) => d[symbol]).filter((v) => typeof v === "number");
  if (values.length === 0) {
    throw new ToolError(`No ECB daily rates found for ${base}/${symbol} in ${year}.`, { year });
  }
  return { average: values.reduce((a, b) => a + b, 0) / values.length, days: values.length, apiUrl };
}

// ../server/src/core/fx.ts
var CURRENCY_COUNTRY = {
  BBD: "BRB",
  XCD: "LCA",
  JMD: "JAM",
  TTD: "TTO",
  BSD: "BHS",
  GYD: "GUY",
  BZD: "BLZ",
  HTG: "HTI",
  DOP: "DOM",
  CUP: "CUB",
  AWG: "ABW",
  ANG: "CUW",
  KYD: "CYM",
  BMD: "BMU",
  SRD: "SUR",
  ARS: "ARG",
  CLP: "CHL",
  COP: "COL",
  PEN: "PER",
  UYU: "URY",
  BOB: "BOL",
  PYG: "PRY",
  CRC: "CRI",
  GTQ: "GTM",
  HNL: "HND",
  NIO: "NIC",
  PAB: "PAN",
  VES: "VEN",
  EGP: "EGY",
  NGN: "NGA",
  KES: "KEN",
  GHS: "GHA",
  XOF: "SEN",
  XAF: "CMR",
  MAD: "MAR",
  TND: "TUN",
  DZD: "DZA",
  ETB: "ETH",
  TZS: "TZA",
  UGX: "UGA",
  RWF: "RWA",
  ZMW: "ZMB",
  BWP: "BWA",
  NAD: "NAM",
  MUR: "MUS",
  SCR: "SYC",
  MZN: "MOZ",
  AOA: "AGO",
  CDF: "COD",
  GMD: "GMB",
  SLL: "SLE",
  LRD: "LBR",
  LKR: "LKA",
  PKR: "PAK",
  BDT: "BGD",
  NPR: "NPL",
  VND: "VNM",
  KHR: "KHM",
  LAK: "LAO",
  MMK: "MMR",
  MNT: "MNG",
  KZT: "KAZ",
  UZS: "UZB",
  GEL: "GEO",
  AMD: "ARM",
  AZN: "AZE",
  TJS: "TJK",
  TMT: "TKM",
  ALL: "ALB",
  MKD: "MKD",
  RSD: "SRB",
  BAM: "BIH",
  MDL: "MDA",
  UAH: "UKR",
  BYN: "BLR",
  RUB: "RUS",
  SAR: "SAU",
  AED: "ARE",
  QAR: "QAT",
  KWD: "KWT",
  BHD: "BHR",
  OMR: "OMN",
  JOD: "JOR",
  ILS: "ISR",
  IQD: "IRQ",
  IRR: "IRN",
  LBP: "LBN",
  YER: "YEM",
  SYP: "SYR",
  FJD: "FJI",
  PGK: "PNG",
  WST: "WSM",
  TOP: "TON",
  SBD: "SLB",
  VUV: "VUT",
  XPF: "PYF",
  MVR: "MDV",
  BTN: "BTN",
  MOP: "MAC",
  BND: "BRN",
  // ECB-covered majors also get World Bank mappings so annual-average requests
  // (and pre-1999 history) work for them too.
  EUR: "EMU",
  GBP: "GBR",
  JPY: "JPN",
  CHF: "CHE",
  CAD: "CAN",
  AUD: "AUS",
  NZD: "NZL",
  CNY: "CHN",
  INR: "IND",
  BRL: "BRA",
  MXN: "MEX",
  KRW: "KOR",
  SEK: "SWE",
  NOK: "NOR",
  DKK: "DNK",
  PLN: "POL",
  CZK: "CZE",
  HUF: "HUN",
  RON: "ROU",
  BGN: "BGR",
  TRY: "TUR",
  ZAR: "ZAF",
  SGD: "SGP",
  HKD: "HKG",
  THB: "THA",
  MYR: "MYS",
  IDR: "IDN",
  PHP: "PHL",
  ISK: "ISL",
  USD: "USA"
};
async function wbUsdPerUnit(ctx, currency, year) {
  const iso3 = CURRENCY_COUNTRY[currency];
  if (!iso3) {
    throw new ToolError(
      `Currency '${currency}' is not covered. ECB daily rates cover ~30 majors; StatCite's annual fallback covers ~120 currencies via World Bank official rates. Check the ISO 4217 code, or fetch a specific economy's rate with get_indicator(indicator='official_fx_rate', country=...).`,
      { currency }
    );
  }
  const wb = await fetchWbSeries(iso3, "PA.NUS.FCRF");
  const usable = wb.observations.filter((o) => o.value != null);
  if (usable.length === 0) throw new ToolError(`No official exchange-rate data for ${currency} (${iso3}).`);
  let chosen = usable[usable.length - 1];
  if (year) {
    const hit = usable.find((o) => parseInt(o.period, 10) === year);
    if (!hit) {
      const min = usable[0].period;
      const max = usable[usable.length - 1].period;
      throw new ToolError(`Official annual rate for ${currency} covers ${min}\u2013${max}; no data for ${year}.`, {
        currency,
        available_range: [min, max]
      });
    }
    chosen = hit;
  }
  return {
    usdPerUnit: 1 / chosen.value,
    period: chosen.period,
    citation: worldBankCitation(ctx, {
      indicatorId: wb.indicatorId,
      indicatorName: `${wb.indicatorName} \u2014 ${wb.countryName}`,
      iso3: wb.countryIso3,
      apiUrl: wb.apiUrl,
      lastUpdated: wb.lastUpdated
    })
  };
}
async function fxConvert(ctx, amount, fromRaw, toRaw, date) {
  if (!Number.isFinite(amount)) throw new ToolError("'amount' must be a number.");
  const from = fromRaw.trim().toUpperCase();
  const to = toRaw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    throw new ToolError("Currencies must be 3-letter ISO codes, e.g. USD, EUR, BBD.", { from: fromRaw, to: toRaw });
  }
  if (date && !/^\d{4}(-\d{2}-\d{2})?$/.test(date)) {
    throw new ToolError("'date' must be YYYY-MM-DD (daily rates) or YYYY (annual-average rates).", { date });
  }
  if (from === to) {
    return {
      amount,
      from,
      to,
      converted_amount: amount,
      rate: 1,
      rate_date: date ?? "n/a",
      method: "identical currencies",
      precision: "daily",
      citations: [],
      notes: []
    };
  }
  const yearOnly = date && date.length === 4 ? parseInt(date, 10) : void 0;
  const dayDate = date && date.length === 10 ? date : void 0;
  const ecbSet = new Set(Object.keys(await listEcbCurrencies()));
  const bothEcb = ecbSet.has(from) && ecbSet.has(to);
  if (bothEcb && yearOnly && yearOnly >= 1999) {
    const r = await getEcbAnnualAverage(from, to, yearOnly);
    return {
      amount,
      from,
      to,
      converted_amount: Number((amount * r.average).toFixed(6)),
      rate: Number(r.average.toFixed(8)),
      rate_date: String(yearOnly),
      method: `Annual average of ECB daily reference rates for ${yearOnly} (${r.days} trading days): ${amount} ${from} \xD7 ${r.average.toFixed(6)} = ${(amount * r.average).toFixed(4)} ${to}`,
      precision: "annual_average",
      citations: [ecbFxCitation(ctx, { base: from, quote: to, rateDate: `${yearOnly} (annual average)`, apiUrl: r.apiUrl })],
      notes: []
    };
  }
  if (bothEcb && !yearOnly) {
    const r = await getEcbRates(from, [to], dayDate);
    const rate2 = r.rates[to];
    if (rate2 == null) throw new ToolError(`ECB rate ${from}\u2192${to} unavailable.`, { from, to });
    const notes2 = [];
    if (dayDate && r.date !== dayDate) {
      notes2.push(`Requested ${dayDate}; nearest ECB working day is ${r.date} (weekends/holidays have no reference rate).`);
    }
    return {
      amount,
      from,
      to,
      converted_amount: Number((amount * rate2).toFixed(6)),
      rate: rate2,
      rate_date: r.date,
      method: `ECB euro reference rates (cross-rate via EUR where needed): ${amount} ${from} \xD7 ${rate2} = ${(amount * rate2).toFixed(4)} ${to}`,
      precision: "daily",
      citations: [ecbFxCitation(ctx, { base: from, quote: to, rateDate: r.date, apiUrl: r.apiUrl })],
      notes: notes2
    };
  }
  const notes = [];
  const citations = [];
  let precision = "annual_average";
  let rateDate = "";
  const wbYear = yearOnly ?? (dayDate ? parseInt(dayDate.slice(0, 4), 10) : void 0);
  async function usdPerUnit(cur) {
    if (cur === "USD") return 1;
    if (ecbSet.has(cur) && !yearOnly) {
      const r = await getEcbRates(cur, ["USD"], dayDate);
      citations.push(ecbFxCitation(ctx, { base: cur, quote: "USD", rateDate: r.date, apiUrl: r.apiUrl }));
      rateDate = rateDate || r.date;
      return r.rates.USD;
    }
    const wb = await wbUsdPerUnit(ctx, cur, wbYear);
    if (wb.citation) citations.push(wb.citation);
    if (dayDate) {
      notes.push(
        `Requested ${dayDate}; daily precision is unavailable for ${cur} \u2014 used the ${wb.period} annual-average official rate (World Bank PA.NUS.FCRF).`
      );
    }
    rateDate = rateDate || wb.period;
    return wb.usdPerUnit;
  }
  const fromUsd = await usdPerUnit(from);
  const toUsd = await usdPerUnit(to);
  const rate = fromUsd / toUsd;
  const usedEcbLeg = (ecbSet.has(from) || ecbSet.has(to)) && !yearOnly && from !== "USD" && to !== "USD";
  if (usedEcbLeg) precision = "mixed";
  if (yearOnly) {
    notes.push(
      `Annual-average official exchange rates for ${yearOnly} (World Bank PA.NUS.FCRF); daily precision is not available on this path.`
    );
  } else if (!dayDate) {
    notes.push(
      "One or both currencies are outside the ECB daily set; converted via USD using the latest annual-average official rate(s). For pegged currencies (e.g. BBD at 2.00/USD, XCD at 2.70/USD) this is exact."
    );
  }
  if (precision === "mixed") notes.push("Mixed precision: one leg is a daily ECB rate, the other an annual average \u2014 treat the result as approximate.");
  return {
    amount,
    from,
    to,
    converted_amount: Number((amount * rate).toFixed(6)),
    rate: Number(rate.toFixed(8)),
    rate_date: rateDate || (yearOnly ? String(yearOnly) : "latest available"),
    method: `USD bridge: 1 ${from} = ${fromUsd.toFixed(6)} USD; 1 ${to} = ${toUsd.toFixed(6)} USD; rate = ${fromUsd.toFixed(6)}/${toUsd.toFixed(6)}`,
    precision,
    citations,
    notes
  };
}

// ../server/src/core/verify.ts
function isPercentKind(indicatorKey) {
  const def = getIndicatorDef(indicatorKey);
  return def ? def.kind === "percent" : false;
}
async function verifyStat(ctx, p) {
  if (!Number.isFinite(p.claimed_value)) throw new ToolError("'claimed_value' must be a number.");
  const period = normalizePeriod(p.period);
  if (!/^\d{4}(-Q[1-4]|[QM-]?\d{0,2})?$/i.test(period)) {
    throw new ToolError("'period' should be a year like '2024' (or a period label matching the series, e.g. '2024-05' or '2024-Q1').", {
      period: p.period
    });
  }
  const year = parseInt(period.slice(0, 4), 10);
  const isRegistry = Boolean(getIndicatorDef(p.indicator));
  if (isRegistry && !p.country) {
    throw new ToolError(`Indicator '${p.indicator}' needs a 'country' (ISO3 code or name) to verify against.`);
  }
  const result = isRegistry ? await getIndicator(ctx, p.indicator, p.country ?? "", { strictSource: p.strict_source }) : await getSeries(ctx, p.indicator, { country: p.country, strictSource: p.strict_source });
  const obs = result.observations;
  const byPeriod = new Map(obs.map((o) => [o.period, o]));
  const lookup = (key) => {
    const o = byPeriod.get(key);
    return o?.value != null ? o : void 0;
  };
  let matched = lookup(period) ?? (period.length > 4 ? void 0 : lookup(String(year)));
  if (!matched && period.length >= 6) {
    const hit = obs.find((o) => o.period.startsWith(period) && o.value != null);
    if (hit) matched = hit;
  }
  const diagnostics = [];
  const notes = [...result.notes];
  notes.push(
    "Macro data is revised: the official value reflects the source's current published figure, which may differ from what was published at the time of the claim."
  );
  const percentKind = isRegistry ? isPercentKind(p.indicator) : /%|percent/i.test(result.unit ?? result.name);
  const imfHeuristicSeries = /^imf\//.test(result.series_id) || /^dbnomics\/IMF\/(WEO|FM):/i.test(result.series_id);
  const statusMethod = imfHeuristicSeries ? "horizon_heuristic" : "as_published";
  if (!matched) {
    const near = obs.filter((o) => Math.abs(parseInt(o.period.slice(0, 4), 10) - year) <= 2 && o.value != null).slice(-6);
    const range = obs.length ? `${obs[0].period}\u2013${obs[obs.length - 1].period}` : "none";
    const freqHint = obs.some((o) => o.period.length > 4) && period.length === 4 ? " This series is higher-frequency \u2014 specify the period as YYYY-MM." : "";
    return {
      verdict: "cannot_verify",
      claimed_value: p.claimed_value,
      official_value: null,
      is_projection: false,
      observation_status: "unknown",
      status_method: statusMethod,
      period,
      difference: null,
      relative_difference_pct: null,
      explanation: `No official observation for ${period} in ${result.series_id}${result.country ? ` (${result.country.name})` : ""}. Available range: ${range}.` + (near.length ? ` Nearby values: ${near.map((o) => `${o.period}: ${fmt(o.value)}`).join(", ")}.` : "") + freqHint,
      diagnostics,
      series: { id: result.series_id, name: result.name, unit: result.unit },
      country: result.country,
      citation: result.citation,
      notes,
      ...result.fallback_used ? { fallback_used: true } : {}
    };
  }
  const official = matched.value;
  const isProjection = /WEO|Fiscal Monitor/i.test(matched.note ?? "") && /estimate|projection/i.test(matched.note ?? "");
  const observationStatus = imfHeuristicSeries ? isProjection ? "projection" : "estimate_or_actual" : isRegistry || result.series_id.startsWith("worldbank/") ? "actual" : "unknown";
  const diff = p.claimed_value - official;
  const relPct = official !== 0 ? diff / Math.abs(official) * 100 : null;
  const ratio = official !== 0 ? p.claimed_value / official : null;
  if (ratio != null && ratio > 0) {
    for (const [factor, label] of [
      [100, "a percent-vs-decimal mix-up (e.g. 0.05 vs 5%)"],
      [1e3, "a thousands scaling difference"],
      [1e6, "a millions scaling difference"],
      [1e9, "a billions scaling difference"],
      [1e12, "a trillions scaling difference"]
    ]) {
      if (within(ratio, factor, 0.02) || within(ratio, 1 / factor, 0.02)) {
        diagnostics.push(`The claimed value is ~${factor.toLocaleString("en-US")}\xD7 ${ratio > 1 ? "larger" : "smaller"} than the official figure \u2014 possibly ${label}.`);
      }
    }
  }
  if (ratio != null && ratio < 0 && within(-ratio, 1, 0.02)) {
    diagnostics.push(
      "The claimed value is approximately the official figure with the opposite sign \u2014 possibly a sign-convention mix-up (e.g. a fiscal deficit quoted as positive where the source reports net lending as negative)."
    );
  }
  for (const offset of [-2, -1, 1, 2]) {
    const v = byPeriod.get(String(year + offset))?.value;
    if (v != null && closeEnough(p.claimed_value, v, percentKind, p)) {
      diagnostics.push(`The claimed value matches the ${year + offset} figure (${fmt(v)}) \u2014 the year may be misattributed.`);
    }
  }
  const def = isRegistry ? getIndicatorDef(p.indicator) : void 0;
  if (isRegistry && result.fallback_used === true && result.fallback_reason !== "definitive") {
    const vintageFlavor = Boolean(def?.datamapper) && result.series_id.startsWith("dbnomics/") ? " IMF vintage revisions (e.g. GDP rebasing) can move WEO/Fiscal Monitor series by more than a percentage point for the same historical year." : " Substitute sources can use different statistical definitions and report materially different values for the same nominal indicator.";
    const projFlag = isProjection ? " (an IMF estimate/projection-period value)" : "";
    return {
      verdict: "cannot_verify",
      claimed_value: p.claimed_value,
      official_value: official,
      is_projection: isProjection,
      observation_status: observationStatus,
      status_method: statusMethod,
      period,
      difference: null,
      relative_difference_pct: null,
      explanation: `This indicator's primary source was transiently unavailable; the fallback (${result.citation.source}, ${result.series_id}) shows ${fmt(official)}${result.unit ? ` ${result.unit}` : ""}${projFlag} for ${period} \u2014 indicative only, not a verification.${vintageFlavor} Retry when the primary source has recovered, or pass strict_source=true to fail hard instead.`,
      diagnostics,
      series: { id: result.series_id, name: result.name, unit: result.unit },
      country: result.country,
      citation: result.citation,
      notes,
      fallback_used: true
    };
  }
  const { verdict, why } = judge(p.claimed_value, official, percentKind, p);
  const unitText = result.unit ? ` ${result.unit}` : "";
  const projKind = /Fiscal Monitor/i.test(matched.note ?? "") ? "IMF Fiscal Monitor" : "IMF WEO";
  const officialLabel = isProjection ? `official (${projKind} projection)` : "official";
  const explanation = verdict === "match" ? `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period} \u2014 consistent (${why}).` : verdict === "close" ? `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period} \u2014 in the right neighborhood but not exact (${why}). Cite the official value.` : `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period} \u2014 materially different (${why}).` + (diagnostics.length ? " See diagnostics for likely causes." : "");
  return {
    verdict,
    claimed_value: p.claimed_value,
    official_value: official,
    is_projection: isProjection,
    observation_status: observationStatus,
    status_method: statusMethod,
    period,
    difference: Number(diff.toFixed(6)),
    relative_difference_pct: relPct == null ? null : Number(relPct.toFixed(3)),
    explanation,
    diagnostics,
    series: { id: result.series_id, name: result.name, unit: result.unit },
    country: result.country,
    citation: result.citation,
    notes,
    ...result.fallback_used ? { fallback_used: true } : {}
  };
}
function within(x, target, tolFrac) {
  return Math.abs(x - target) / target <= tolFrac;
}
function normalizePeriod(input) {
  const s = input.trim();
  const q = s.match(/^(\d{4})[\s-]?Q([1-4])$/i);
  if (q) return `${q[1]}-Q${q[2]}`;
  const m = s.match(/^(\d{4})(0[1-9]|1[0-2])$/);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}
function closeEnough(claimed, official, percentKind, p) {
  return judge(claimed, official, percentKind, p).verdict !== "mismatch";
}
function judge(claimed, official, percentKind, p) {
  const absDiff = Math.abs(claimed - official);
  if (absDiff === 0) return { verdict: "match", why: "exact match" };
  if (official === 0) {
    return absDiff <= 0.05 ? { verdict: "close", why: `official value is 0; claimed ${claimed}` } : { verdict: "mismatch", why: `official value is 0; claimed ${claimed}` };
  }
  const relDiff = Math.abs(claimed - official) / Math.abs(official);
  if (p.tolerance_abs != null || p.tolerance_pct != null) {
    const okAbs = p.tolerance_abs != null && absDiff <= p.tolerance_abs;
    const okRel = p.tolerance_pct != null && relDiff * 100 <= p.tolerance_pct;
    if (okAbs || okRel) return { verdict: "match", why: "within your specified tolerance" };
    const nearAbs = p.tolerance_abs != null && absDiff <= p.tolerance_abs * 3;
    const nearRel = p.tolerance_pct != null && relDiff * 100 <= p.tolerance_pct * 3;
    if (nearAbs || nearRel) return { verdict: "close", why: "within 3\xD7 your specified tolerance" };
    return { verdict: "mismatch", why: "outside your specified tolerance" };
  }
  if (percentKind) {
    if (absDiff <= 0.06 || relDiff <= 5e-3) {
      return {
        verdict: "match",
        why: absDiff <= 0.06 ? `difference of ${absDiff.toFixed(3)} pp is within normal rounding` : `relative difference ${(relDiff * 100).toFixed(2)}% is within normal rounding`
      };
    }
    if (absDiff <= 0.3 || relDiff <= 0.02) {
      return {
        verdict: "close",
        why: absDiff <= 0.3 ? `difference of ${absDiff.toFixed(2)} pp` : `difference of ${absDiff.toFixed(2)} pp (${(relDiff * 100).toFixed(1)}% relative)`
      };
    }
    return { verdict: "mismatch", why: `difference of ${absDiff.toFixed(2)} percentage points (${(relDiff * 100).toFixed(1)}% relative)` };
  }
  if (relDiff <= 5e-3) return { verdict: "match", why: `relative difference ${(relDiff * 100).toFixed(2)}% is within normal rounding` };
  if (relDiff <= 0.05) return { verdict: "close", why: `relative difference ${(relDiff * 100).toFixed(1)}%` };
  return { verdict: "mismatch", why: `relative difference ${(relDiff * 100).toFixed(1)}%` };
}
function fmt(v) {
  if (Math.abs(v) >= 1e6) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

// ../server/src/core/sources.ts
var SOURCES = [
  {
    id: "worldbank",
    name: "World Bank \u2014 World Development Indicators",
    coverage: "~1,400 annual indicators, 200+ economies, many from 1960",
    access: "No key; queried live from api.worldbank.org v2",
    license: "CC BY 4.0",
    attribution_required: "The World Bank: World Development Indicators: <series name>",
    url: "https://data.worldbank.org",
    terms_url: "https://data.worldbank.org/summary-terms-of-use"
  },
  {
    id: "imf_weo",
    name: "IMF \u2014 World Economic Outlook & Fiscal Monitor (via the IMF DataMapper API, with DBnomics as fallback)",
    coverage: "Growth, fiscal, external indicators for 190+ economies, incl. estimates/projections; twice-yearly vintages (April/October, plus interim Updates). The primary path is the IMF's own DataMapper API \u2014 the current edition, verbatim edition label passed through unrewritten. If that path is unavailable, StatCite falls back to the newest edition DBnomics has ingested, which can lag the IMF's release calendar; every response cites the resolved vintage, and a fallback that crosses editions is disclosed (verify_stat demotes such cases to cannot_verify rather than judging a claim against a superseded vintage). The actual/projection boundary is a heuristic derived from each response's own data horizon, not a per-country authoritative cutoff",
    access: "No key; queried live from www.imf.org/external/datamapper (primary) and api.db.nomics.world v22 (fallback)",
    license: IMF_LICENSE,
    attribution_required: "Source: International Monetary Fund",
    url: "https://www.imf.org/en/Publications/WEO",
    terms_url: "https://www.imf.org/external/terms.htm"
  },
  {
    id: "ecb_fx",
    name: "European Central Bank \u2014 euro foreign exchange reference rates (via Frankfurter)",
    coverage: "~30 major currencies, daily since 1999",
    access: "No key; queried live from api.frankfurter.dev",
    license: "Published for information purposes; reuse with attribution; not transaction rates",
    attribution_required: "Source: European Central Bank euro foreign exchange reference rates",
    url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    terms_url: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html"
  },
  {
    id: "fred",
    name: "Federal Reserve Bank of St. Louis \u2014 FRED (optional)",
    coverage: "US and international series incl. monthly CPI, unemployment, rates (active only when the server operator configures a free FRED API key)",
    access: "Requires the operator's FRED API key",
    license: "FRED API Terms of Use \u2014 disabled by default on this server; an operator enabling it must review the current FRED terms first (they include restrictions relevant to caching, redistribution, and AI/software use) and note that some series are owned by third parties",
    attribution_required: "This product uses the FRED\xAE API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.",
    url: "https://fred.stlouisfed.org",
    terms_url: "https://fred.stlouisfed.org/docs/api/terms_of_use.html"
  },
  {
    id: "dbnomics",
    name: "DBnomics (aggregator)",
    coverage: "Tens of millions of series from 90+ official providers (IMF, OECD, Eurostat, ECB, BIS, national statistical offices)",
    access: "No key; open aggregator \u2014 upstream provider licenses flow through",
    license: "Per underlying provider",
    attribution_required: "Cite the underlying provider (StatCite citations do this automatically)",
    url: "https://db.nomics.world",
    terms_url: "https://docs.db.nomics.world/"
  }
];
export {
  SOURCES,
  ToolError,
  countrySnapshot,
  fxConvert,
  getIndicator,
  getSeries,
  inflationAdjust,
  listRegistry,
  searchIndicators,
  verifyStat
};
