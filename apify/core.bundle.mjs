// ../server/src/core/types.ts
var ToolError = class extends Error {
  details;
  code;
  constructor(message, details, code) {
    super(message);
    this.name = "ToolError";
    this.details = details;
    this.code = code;
  }
};
function nowIso(ctx) {
  return (ctx.now ? ctx.now() : /* @__PURE__ */ new Date()).toISOString();
}
function today(ctx) {
  return nowIso(ctx).slice(0, 10);
}

// ../server/src/core/countries.ts
var INSEE = (dep) => ({
  publisher: "INSEE, the French national statistical institute",
  publisherUrl: `https://www.insee.fr/fr/statistiques/2011101?geo=DEP-${dep}`
});
var FRANCE = {
  parentIso3: "FRA",
  parentName: "France",
  relation: "an overseas department of France"
};
var INTEGRATED_TERRITORIES = {
  GLP: { ...FRANCE, ...INSEE("971") },
  MTQ: { ...FRANCE, ...INSEE("972") },
  GUF: { ...FRANCE, ...INSEE("973") },
  REU: { ...FRANCE, ...INSEE("974") },
  MYT: { ...FRANCE, ...INSEE("976") },
  // Found 2026-08-14 by running the Caribbean sweep instead of restating an
  // earlier count. Bonaire, Sint Eustatius and Saba were falling through the
  // three-letter passthrough as an unknown code, which is the same defect the
  // 19 territories above were added to fix.
  BES: {
    parentIso3: "NLD",
    parentName: "the Netherlands",
    relation: "made up of three special municipalities of the Netherlands",
    publisher: "CBS, the Netherlands national statistical office",
    publisherUrl: "https://www.cbs.nl/en-gb/dossier/caribbean-netherlands"
  }
};
function integratedTerritoryNote(iso3, name) {
  const t = INTEGRATED_TERRITORIES[iso3.toUpperCase()];
  if (!t) return void 0;
  const note = `${name} is ${t.relation}, so the international sources this service draws on report it inside ${t.parentName} rather than as a separate economy. This is a coverage fact, not a lookup failure. Figures for ${name} itself are published by ${t.publisher}, at ${t.publisherUrl}. A snapshot for the parent state is available with country="${t.parentName}".`;
  return note.charAt(0).toUpperCase() + note.slice(1);
}
var ROWS = [
  // Small territories and non-UN-member economies. Added 2026-08-13 after a
  // check found 19 REAL places falling through the three-letter passthrough,
  // including Montserrat and Anguilla, which are this service's own headline
  // example of coverage the World Bank does not provide. While they were
  // absent, the passthrough could not distinguish "a genuine economy the
  // source does not cover" from "not a country at all", so the honest-absence
  // contract rested on a table that did not know these places existed.
  ["MSR", "MS", "Montserrat"],
  ["AIA", "AI", "Anguilla"],
  ["VGB", "VG", "British Virgin Islands", "bvi", "virgin islands british"],
  // Missing until 2026-09-12: "US Virgin Islands" resolved to nothing and a
  // bare "Virgin Islands" was silently given the British territory.
  ["VIR", "VI", "Virgin Islands (U.S.)", "us virgin islands", "u s virgin islands", "united states virgin islands", "usvi"],
  ["TCA", "TC", "Turks and Caicos Islands", "turks and caicos"],
  ["GIB", "GI", "Gibraltar"],
  ["FLK", "FK", "Falkland Islands", "malvinas"],
  ["SHN", "SH", "Saint Helena", "st helena"],
  ["GRL", "GL", "Greenland"],
  ["FRO", "FO", "Faroe Islands", "faroes"],
  ["IMN", "IM", "Isle of Man"],
  ["JEY", "JE", "Jersey"],
  ["GGY", "GG", "Guernsey"],
  ["NIU", "NU", "Niue"],
  ["COK", "CK", "Cook Islands"],
  ["REU", "RE", "Reunion", "r\xE9union"],
  ["GLP", "GP", "Guadeloupe"],
  ["MTQ", "MQ", "Martinique"],
  ["GUF", "GF", "French Guiana", "guyane"],
  ["MYT", "YT", "Mayotte"],
  ["BES", "BQ", "the Caribbean Netherlands", "bonaire", "sint eustatius", "saba", "bes islands", "caribbean netherlands"],
  ["ESH", "EH", "Western Sahara"],
  ["TWN", "TW", "Taiwan", "chinese taipei", "taiwan province of china"],
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
  // A US territory, not Samoa. Missing until 2026-09-12, so "American Samoa"
  // fell through to the substring step and was served Samoa's statistics.
  ["ASM", "AS", "American Samoa"],
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
var AMBIGUOUS_NAMES = ["virgin islands"];
for (const a of AMBIGUOUS_NAMES) byName.delete(a);
var NORM_NAMES = COUNTRIES.map((c) => ({ c, n: norm(c.name) }));
var SAME_STATE_QUALIFIERS = /* @__PURE__ */ new Set([
  "the",
  "of",
  "and",
  "republic",
  "kingdom",
  "state",
  "states",
  "commonwealth",
  "federal",
  "federation",
  "democratic",
  "people",
  "peoples",
  "s",
  "islamic",
  "socialist",
  "plurinational",
  "bolivarian",
  "principality",
  "grand",
  "duchy",
  "sultanate",
  "independent",
  "union",
  "government",
  "country"
]);
function resolveCountry(input, opts = {}) {
  const raw = input.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const codeAllowed = !opts.strict || raw === upper;
  if (codeAllowed && /^[A-Z0-9]{2,3}$/.test(upper) && byCode.has(upper)) return byCode.get(upper);
  const n = norm(raw);
  if (byName.has(n)) return byName.get(n);
  if (n.length >= 4) {
    const hits = NORM_NAMES.filter(({ n: cn }) => {
      if (cn.includes(n)) return true;
      if (!n.includes(cn)) return false;
      const known = new Set(cn.split(" "));
      const extra = n.split(" ").filter((t) => t && !known.has(t));
      return extra.every((t) => SAME_STATE_QUALIFIERS.has(t));
    });
    const uniq = [...new Set(hits.map((h) => h.c.iso3))];
    if (uniq.length === 1) return hits[0].c;
  }
  if (n.length >= 5) {
    const hits = NORM_NAMES.filter(({ n: cn }) => Math.abs(cn.length - n.length) <= 1 && editDistanceLeq1(n, cn));
    const uniq = [...new Set(hits.map((h) => h.c.iso3))];
    if (uniq.length === 1) return hits[0].c;
  }
  if (!opts.strict && /^[A-Z]{3}$/.test(upper)) {
    return { iso3: upper, iso2: upper.slice(0, 2), name: upper, unverified: true };
  }
  return null;
}
function editDistanceLeq1(a, b) {
  if (a === b) return true;
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];
  if (t.length - s.length > 1) return false;
  if (s.length === t.length) {
    let i2 = 0;
    while (i2 < s.length && s[i2] === t[i2]) i2++;
    if (i2 === s.length) return true;
    if (s.slice(i2 + 1) === t.slice(i2 + 1)) return true;
    return s[i2] === t[i2 + 1] && s[i2 + 1] === t[i2] && s.slice(i2 + 2) === t.slice(i2 + 2);
  }
  let i = 0;
  while (i < s.length && s[i] === t[i]) i++;
  return s.slice(i) === t.slice(i + 1);
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
    modeled: true,
    synonyms: ["unemployment", "unemployment rate", "jobless rate", "joblessness"],
    notes: "ILO modeled estimates; national definitions may differ from officially published national rates."
  },
  {
    key: "labor_force_participation",
    label: "Labor force participation rate (% of population 15+, modeled ILO)",
    unit: "% of population ages 15+",
    kind: "percent",
    wb: "SL.TLF.CACT.ZS",
    modeled: true,
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
  // SDMX sources (BIS, ECB). Policy rates fill the hole left by FRED's
  // permanent disablement — BIS WS_CBPOL covers 49 economies in one
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
      sourceUrl: "https://data.bis.org/topics/CBPOL"
    },
    synonyms: ["policy rate", "interest rate", "central bank rate", "base rate", "fed funds", "bank rate", "monetary policy rate"],
    notes: "BIS central bank policy rates. The rate that best captures each monetary authority's policy stance. Monthly. Coverage is the 49 economies the BIS compiles (enumerated from the dataflow itself, including the euro area); economies outside that set return an honest no-published-data response rather than a substitute."
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
      sourceUrl: "https://data.ecb.europa.eu/data/datasets/ICP"
    },
    synonyms: ["hicp", "euro area inflation", "eurozone inflation", "harmonised inflation"],
    notes: `Monthly euro-area harmonised inflation from the ECB's current HICP dataflow. Euro-area aggregate only (request with country="euro area"); for national annual CPI use inflation_cpi.`
  },
  {
    key: "tourism_receipts_exports",
    label: "International tourism, receipts (% of total exports)",
    unit: "% of total exports",
    kind: "percent",
    wb: "ST.INT.RCPT.XP.ZS",
    synonyms: ["tourism receipts", "tourism exports", "tourism share of exports", "tourism dependence"],
    notes: "A headline exposure measure for tourism-dependent economies (most small island developing states)."
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
    notes: "World Bank International Debt Statistics; reported for low- and middle-income economies (high-income economies are not covered by IDS)."
  },
  {
    key: "external_debt_service_usd",
    label: "Total debt service on external debt (TDS, current US$)",
    unit: "current US$",
    kind: "level",
    wb: "DT.TDS.DECT.CD",
    synonyms: ["debt service", "external debt service", "debt repayments"],
    notes: "World Bank International Debt Statistics; low- and middle-income economies only."
  },
  {
    key: "debt_service_exports_pct",
    label: "Total debt service (% of exports of goods, services and primary income)",
    unit: "% of exports",
    kind: "percent",
    wb: "DT.TDS.DECT.EX.ZS",
    synonyms: ["debt service ratio", "debt service to exports", "debt burden"],
    notes: "World Bank International Debt Statistics; the classic debt-burden ratio for low- and middle-income economies."
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
var TRANSFORM_VALUES = ["none", "yoy", "pct_change", "index"];
function parseTransform(v) {
  if (v == null || v === "") return "none";
  const s = String(v).toLowerCase().trim();
  if (TRANSFORM_VALUES.includes(s)) return s;
  throw new ToolError(`Unknown transform '${String(v)}'. Valid: ${TRANSFORM_VALUES.join(", ")}.`);
}
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
      // The unit MUST change with the values. A yoy transform of GDP in current
      // US$ returns 5.18, and leaving `unit` as "current US$" tells an agent to
      // publish "GDP was 5.18 current US$" when the real figure is 7.6 billion:
      // wrong by nine orders of magnitude, and wrong in the one field a
      // consumer is meant to trust. The note alone cannot carry this, because
      // notes are prose and `unit` is a typed field clients read directly.
      unit: transform === "yoy" ? "% change (year-over-year)" : "% change (period-over-period)",
      note: transform === "yoy" ? `Computed by StatCite: year-over-year % change (lag ${lag} period${lag > 1 ? "s" : ""}).` : "Computed by StatCite: period-over-period % change."
    };
  }
  if (transform !== "index") {
    throw new ToolError(`Unknown transform '${String(transform)}'. Valid: ${TRANSFORM_VALUES.join(", ")}.`);
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
    // Naming the rebase period here is what stops a response asserting two
    // different base years at once. cpi_index arrives as "index, 2010 = 100";
    // rebased to 2018 it kept that label while its own note said 2018, so the
    // payload contradicted itself about what the numbers meant.
    unit: `index, ${base.period} = 100`,
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
var MEM_BYTES_MAX = 32 * 1024 * 1024;
var MEM_ENTRY_BYTES_MAX = 2 * 1024 * 1024;
var memBytes = 0;
var MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;
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
function doFetch(url, signal, ttlSeconds, accept) {
  return fetch(url, {
    // `accept` is overridable because some official APIs content-negotiate
    // JSON only via a vendor media type: BIS returns SDMX **XML** for a plain
    // `application/json` Accept, and 200-with-XML is a silent-corruption
    // class, not an error class.
    headers: { "user-agent": USER_AGENT, accept: accept ?? "application/json" },
    redirect: "follow",
    signal,
    // Cloudflare edge cache for upstream GETs (effective on custom domains; ignored elsewhere).
    cf: { cacheTtl: ttlSeconds, cacheEverything: true }
  });
}
async function readCapped(res, maxBytes, url) {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new UpstreamError(`Upstream response too large (${declared} bytes, limit ${maxBytes})`, url, res.status);
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UpstreamError(`Upstream response too large (over ${maxBytes} bytes)`, url, res.status);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
function errorSnippet(body) {
  const t = body.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
  if (!t || /^[<{[]/.test(t)) return "";
  return t.length > 120 ? t.slice(0, 117) + "..." : t;
}
function memPut(url, entry) {
  if (entry.bytes > MEM_ENTRY_BYTES_MAX) return;
  const old = mem.get(url);
  if (old) {
    memBytes -= old.bytes;
    mem.delete(url);
  }
  while (mem.size > 0 && (mem.size >= MEM_MAX || memBytes + entry.bytes > MEM_BYTES_MAX)) {
    const first = mem.keys().next().value;
    if (first === void 0) break;
    memBytes -= mem.get(first)?.bytes ?? 0;
    mem.delete(first);
  }
  mem.set(url, entry);
  memBytes += entry.bytes;
}
var RETRY_DELAYS_MS = [300, 900];
var HOST_FAILURE_LIMIT = RETRY_DELAYS_MS.length + 1;
function hostStateOf(ctx) {
  return ctx._hostState ??= /* @__PURE__ */ new Map();
}
function hostKey(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
var ShapeError = class extends Error {
  /** Not a subclass of UpstreamError on purpose. The in-flight joiner at the
   * foot of this file rethrows only UpstreamError to a joining caller, and the
   * apify bundle is byte-compared against a fresh build of this graph, so the
   * hierarchy is load-bearing in two places. Callers branch on it explicitly. */
  url;
  constructor(message, url) {
    super(redactUrl(message));
    this.name = "ShapeError";
    this.url = redactUrl(url);
  }
};
var inflight = /* @__PURE__ */ new Map();
async function fetchJson(url, opts = {}) {
  const { ttlSeconds = 21600, timeoutMs = 8e3, validate, accept, maxBytes = MAX_UPSTREAM_BYTES, hostState } = opts;
  const key = JSON.stringify([ttlSeconds, timeoutMs, maxBytes, accept ?? "", url]);
  const flight = inflight.get(key);
  if (flight) {
    try {
      const data = await flight;
      if (!validate || validate(data)) return data;
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
    }
  }
  const started = attemptFetchJson(url, { ttlSeconds, timeoutMs, validate, accept, maxBytes, hostState });
  inflight.set(key, started);
  try {
    return await started;
  } finally {
    inflight.delete(key);
  }
}
async function attemptFetchJson(url, {
  ttlSeconds = 21600,
  timeoutMs = 8e3,
  validate,
  accept,
  maxBytes = MAX_UPSTREAM_BYTES,
  hostState
} = {}) {
  const host = hostKey(url);
  const hostSpent = () => hostState !== void 0 && (hostState.get(host) ?? 0) >= HOST_FAILURE_LIMIT;
  const countFailedAttempt = () => hostState?.set(host, (hostState.get(host) ?? 0) + 1);
  const hit = mem.get(url);
  const now = Date.now();
  if (hit && hit.exp > now && (!validate || validate(hit.data))) return hit.data;
  let lastErr;
  const maxAttempts = hostSpent() ? 1 : RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let counted = false;
    try {
      const res = await doFetch(url, controller.signal, ttlSeconds, accept);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(`Upstream returned HTTP ${res.status}`, url, res.status);
        await res.body?.cancel();
        countFailedAttempt();
        counted = true;
        if (!isLastAttempt && !hostSpent()) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        let snippet = "";
        try {
          snippet = errorSnippet(await readCapped(res, 1024, url));
        } catch {
        }
        throw new UpstreamError(`Upstream returned HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`, url, res.status);
      }
      const text = await readCapped(res, maxBytes, url);
      const data = JSON.parse(text);
      if (validate && !validate(data)) {
        lastErr = new ShapeError("Upstream returned a response that failed shape validation", url);
        countFailedAttempt();
        counted = true;
        if (!isLastAttempt && !hostSpent()) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw lastErr;
      }
      memPut(url, { exp: now + ttlSeconds * 1e3, data, bytes: text.length });
      hostState?.set(host, 0);
      return data;
    } catch (e) {
      lastErr = e;
      if (e instanceof UpstreamError && e.status && e.status < 500 && e.status !== 429) throw e;
      if (!counted) countFailedAttempt();
      if (!isLastAttempt && !hostSpent()) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
    } finally {
      clearTimeout(timer);
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
function parseEnvelope(data, apiUrl, ctx = {}) {
  if (!Array.isArray(data)) throw new ToolError("World Bank API returned an unexpected payload", { api_url: apiUrl });
  const first = data[0];
  if (first && Array.isArray(first.message)) {
    const msgs = first.message;
    const text = msgs.map((m) => `${m.key ?? ""}: ${m.value ?? ""}`).join("; ");
    if (/invalid value/i.test(text) || /not valid/i.test(text)) {
      if (ctx.countryUnverified) {
        throw new ToolError(
          `'${ctx.countryCode ?? "(unknown)"}' was not recognised as a country or economy, and the World Bank rejected it as an unknown code. Use an ISO3 code (e.g. USA, BRB, DEU) or a standard English name.`,
          { api_url: apiUrl, country: ctx.countryCode, unknown_country: true }
        );
      }
      const err = new ToolError(
        `The World Bank does not publish indicator ${ctx.indicatorId ?? "(unknown)"} for '${ctx.countryCode ?? "(unknown)"}'. This is a coverage fact at the source, not a lookup failure, some economies (e.g. Anguilla, Montserrat) are not World Bank reporting economies at all.`,
        { api_url: apiUrl, no_published_data: true, country: ctx.countryCode, indicator: ctx.indicatorId }
      );
      err.wbParameterRefusal = true;
      throw err;
    }
    throw new ToolError(`World Bank API error, ${text}`, { api_url: apiUrl });
  }
  const rows = data[1] ?? [];
  const usable = Array.isArray(rows) ? rows.filter((r) => r && typeof r === "object" && typeof r.date === "string" && typeof r.indicator?.id === "string" && r.country && typeof r.country === "object") : [];
  return { meta: first ?? {}, rows: usable };
}
async function wbIndicatorIsUnknown(indicatorId) {
  try {
    const d = await fetchJson(`${BASE}/indicator/${encodeURIComponent(indicatorId)}?format=json`, { ttlSeconds: 86400 });
    const first = Array.isArray(d) ? d[0] : void 0;
    return Boolean(first?.message?.some((m) => m.id === "120" || /invalid value/i.test(m.key ?? "")));
  } catch {
    return false;
  }
}
async function fetchWbSeries(countryCode, indicatorId, opts = {}) {
  const params = new URLSearchParams({ format: "json", per_page: String(opts.perPage ?? 1e3) });
  if (opts.mrv) params.set("mrv", String(opts.mrv));
  const apiUrl = `${BASE}/country/${encodeURIComponent(countryCode)}/indicator/${encodeURIComponent(indicatorId)}?${params}`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 21600, hostState: opts.hostState });
  let parsed;
  try {
    parsed = parseEnvelope(data, apiUrl, { countryCode, indicatorId, countryUnverified: opts.countryUnverified });
  } catch (e) {
    if (opts.checkIndicatorOnRefusal && e.wbParameterRefusal) {
      if (await wbIndicatorIsUnknown(indicatorId)) {
        throw new ToolError(
          `Unknown World Bank indicator code '${indicatorId}'. The World Bank does not recognise it, so this is not a coverage gap. Check the code at https://data.worldbank.org/indicator, or find a registry key with search_indicators.`,
          { indicator: indicatorId, unknown_indicator: true, api_url: `${BASE}/indicator/${encodeURIComponent(indicatorId)}?format=json` }
        );
      }
    }
    throw e;
  }
  const { meta, rows } = parsed;
  if (rows.length === 0) {
    throw new ToolError(
      `No World Bank data found for indicator ${indicatorId}, country ${countryCode}. The indicator code or country may be wrong, or the series may not be reported for this economy.`,
      // Same honest-absence contract as the parameter-validation path above:
      // both mean "the source publishes nothing here", and a caller must not
      // have to parse prose to tell them apart.
      { indicator: indicatorId, country: countryCode, no_published_data: true }
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
  const data = await fetchJson(apiUrl, { ttlSeconds: 21600, hostState: opts.hostState });
  const { meta, rows } = parseEnvelope(data, apiUrl, { countryCode, indicatorId: indicatorIds.join(";") });
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
async function fetchDbnomicsSeries(providerCode, datasetCode, seriesCode, opts = {}) {
  const apiUrl = `${BASE2}/series/${encodeURIComponent(providerCode)}/${encodeURIComponent(datasetCode)}/${encodeURIComponent(seriesCode)}?observations=1`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 21600, hostState: opts.hostState });
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
function fredAvailable(_ctx) {
  return false;
}
function requireKey(_ctx) {
  throw new ToolError(
    "FRED series are disabled on this server: FRED's terms of use prohibit AI/ML use and caching/redistribution of its content, which conflicts with how StatCite serves data. Cross-country equivalents are available without FRED: try the `worldbank/...` series or a registry indicator key instead."
  );
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
function previousWeoEdition(edition) {
  const m = edition.match(/^(\d{4})-(04|10)$/);
  if (!m) throw new Error(`not a WEO edition: '${edition}'`);
  return m[2] === "10" ? `${m[1]}-04` : `${parseInt(m[1], 10) - 1}-10`;
}
function nextExpectedWeoEditionLabel(now = /* @__PURE__ */ new Date()) {
  const cur = expectedWeoEdition(now);
  const m = cur.match(/^(\d{4})-(04|10)$/);
  return m[2] === "10" ? `April ${parseInt(m[1], 10) + 1}` : `October ${m[1]}`;
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
      if (Math.abs(now.getTime() - Date.UTC(y, month - 1, 15)) <= windowMs) return true;
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
function computeBoundaryYear(horizonYear, now = /* @__PURE__ */ new Date(), editionYear) {
  const naive = horizonYear - 5;
  const calendarYear = parseInt(expectedWeoEdition(now).slice(0, 4), 10);
  if (Math.abs(naive - calendarYear) > 1) {
    const target = editionYear != null && Number.isFinite(editionYear) ? Math.min(editionYear, calendarYear) : calendarYear;
    return { boundaryYear: target, clamped: true };
  }
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
      // The payload lists every economy the IMF publishes for this series, so
      // a missing country is a coverage fact, not a lookup failure.
      { code, country: countryIso3, no_published_data: true }
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

// ../server/src/core/text.ts
function quoteInput(value, max = 80) {
  const s = String(value ?? "");
  const cut = s.length > max ? s.slice(0, max) : s;
  const escaped = JSON.stringify(cut).slice(1, -1);
  return s.length > max ? `${escaped}...` : escaped;
}
var CONTROL_RUN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g;
function stripControls(value) {
  return typeof value === "string" ? value.replace(CONTROL_RUN, " ") : value;
}
function cleanLabel(value, max = 300) {
  const s = stripControls(String(value ?? "")).trim();
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}
function httpsUrl(value) {
  if (typeof value !== "string") return void 0;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : void 0;
  } catch {
    return void 0;
  }
}

// ../server/src/core/citations.ts
var FRED_NOTICE = "This product uses the FRED\xAE API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";
var IMF_LICENSE = 'Published IMF statistical data may be copied, redistributed, and used (including in derivative works) with attribution to the IMF as source. Conditions: attribute as "Source: International Monetary Fund, <database>, <link>"; do not alter the data in ways affecting its accuracy, and state explicitly if it is materially transformed; anyone redistributing it downstream must take reasonable efforts to communicate these terms to their own users; and if sold as a standalone product, purchasers must be told the data is available free of charge from the IMF. Some statistical products incorporate third-party information under separate terms';
var STATCITE_URL = "https://statcite.com";
function retrievedVia(date, through) {
  const chain = through ? `${through} and StatCite` : "StatCite";
  return `Retrieved ${date} via ${chain} (${STATCITE_URL}).`;
}
function bibtexEscape(s) {
  return s.replace(/[\r\n]+/g, " ").replace(/[{}\\]/g, "").replace(/([&%$#_])/g, "\\$1");
}
function bibtexUrl(u) {
  return u.replace(/[\r\n]+/g, "").replace(/\{/g, "%7B").replace(/\}/g, "%7D");
}
function withExports(raw) {
  const c = {
    ...raw,
    source: stripControls(raw.source),
    dataset: stripControls(raw.dataset),
    series_name: stripControls(raw.series_name),
    attribution: stripControls(raw.attribution),
    citation_text: stripControls(raw.citation_text),
    ...raw.notices ? { notices: raw.notices.map(stripControls) } : {}
  };
  const year = c.retrieved_at.slice(0, 4);
  const key = `${c.source.split(/[^A-Za-z]/)[0].toLowerCase() || "statcite"}_${c.series_id.replace(/[^A-Za-z0-9]+/g, "_")}_${year}`;
  const bibtex = `@misc{${key},
  author = {{${bibtexEscape(c.source)}}},
  title = {{${bibtexEscape(c.dataset)}: ${bibtexEscape(c.series_name)}}},
  year = {${year}},
  url = {${bibtexUrl(c.source_url)}},
  note = {Series ${bibtexEscape(c.series_id)}. ${retrievedVia(c.retrieved_at)} ${bibtexEscape(c.attribution)}}
}`;
  const apa = `${c.source}. (n.d.). ${c.series_name} [Data set]. ${c.dataset}. Retrieved ${c.retrieved_at}, from ${c.source_url}`;
  return { ...c, export_formats: { bibtex, apa } };
}
function worldBankCitation(ctx, opts) {
  const loc = opts.iso3 ? `?locations=${opts.iso3}` : "";
  const sourceUrl = `https://data.worldbank.org/indicator/${opts.indicatorId}${loc}`;
  const date = today(ctx);
  return withExports({
    source: "World Bank",
    dataset: "World Development Indicators",
    series_id: opts.indicatorId,
    series_name: opts.indicatorName,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: "CC BY 4.0",
    attribution: `The World Bank: World Development Indicators: ${opts.indicatorName}`,
    retrieved_at: date,
    citation_text: `World Bank, World Development Indicators, series ${opts.indicatorId} (${opts.indicatorName})${opts.lastUpdated ? `, data last updated ${opts.lastUpdated}` : ""}. ${retrievedVia(date)} ${sourceUrl}`
  });
}
function dbnomicsCitation(ctx, opts) {
  const sourceUrl = `https://db.nomics.world/${opts.providerCode}/${encodeURIComponent(opts.datasetCode)}/${encodeURIComponent(opts.seriesCode)}`;
  const date = today(ctx);
  const isImf = opts.providerCode === "IMF";
  return withExports({
    source: opts.providerName,
    dataset: opts.datasetName,
    series_id: `${opts.providerCode}/${opts.datasetCode}/${opts.seriesCode}`,
    series_name: opts.seriesName,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: isImf ? IMF_LICENSE : `${opts.providerName} terms apply; retrieved via DBnomics (open aggregator)`,
    attribution: isImf ? `Source: International Monetary Fund, ${opts.datasetName}, ${sourceUrl}` : `Source: ${opts.providerName} (via DBnomics)`,
    retrieved_at: date,
    citation_text: `${opts.providerName}, ${opts.datasetName}, series ${opts.seriesCode} (${opts.seriesName}). ${retrievedVia(date, "DBnomics")} ${sourceUrl}`
  });
}
function imfDataMapperCitation(ctx, opts) {
  const date = today(ctx);
  const datasetName = opts.dataset === "FM" ? "IMF Fiscal Monitor" : "IMF World Economic Outlook";
  const alreadyNamed = /world economic outlook|fiscal monitor/i.test(opts.editionLabel);
  const datasetSuffix = alreadyNamed ? "" : ` (${datasetName})`;
  return withExports({
    source: "International Monetary Fund",
    dataset: opts.editionLabel,
    series_id: `imf/${opts.code}`,
    series_name: opts.seriesName,
    source_url: opts.sourceUrl,
    api_url: opts.apiUrl,
    license: IMF_LICENSE,
    // The IMF's terms specify this exact attribution shape: "Source:
    // International Monetary Fund, Database Name, <<link to the dataset>>."
    // A bare "Source: IMF" omits the database and link the terms ask for.
    attribution: `Source: International Monetary Fund, ${opts.editionLabel}, ${opts.sourceUrl}`,
    retrieved_at: date,
    citation_text: `International Monetary Fund, ${opts.editionLabel}${datasetSuffix}, ${opts.seriesName}, series ${opts.code}. ${retrievedVia(date, "the IMF DataMapper API")} ${opts.sourceUrl}`,
    ...opts.lastModified ? { notices: [`IMF data load timestamp: ${opts.lastModified} UTC.`] } : {}
  });
}
function fredCitation(ctx, opts) {
  const sourceUrl = `https://fred.stlouisfed.org/series/${opts.seriesId}`;
  const date = today(ctx);
  return withExports({
    source: "Federal Reserve Bank of St. Louis (FRED)",
    dataset: "FRED, Federal Reserve Economic Data",
    series_id: opts.seriesId,
    series_name: opts.seriesName,
    source_url: sourceUrl,
    api_url: opts.apiUrl ? opts.apiUrl.replace(/api_key=[^&]+/, "api_key=REDACTED") : void 0,
    license: "FRED\xAE API Terms of Use; check series page for third-party data owners",
    attribution: `Federal Reserve Bank of St. Louis, FRED series ${opts.seriesId}`,
    retrieved_at: date,
    citation_text: `Federal Reserve Bank of St. Louis, FRED, series ${opts.seriesId} (${opts.seriesName}). ${retrievedVia(date)} ${sourceUrl}`,
    notices: [FRED_NOTICE]
  });
}
function ecbFxCitation(ctx, opts) {
  const date = today(ctx);
  const sourceUrl = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
  return withExports({
    source: "European Central Bank",
    dataset: "Euro foreign exchange reference rates (via Frankfurter)",
    series_id: `ECB/${opts.base}${opts.quote}`,
    series_name: `${opts.base}/${opts.quote} reference exchange rate`,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: "ECB reference rates are published for information purposes; reuse with attribution",
    attribution: "Source: European Central Bank euro foreign exchange reference rates",
    retrieved_at: date,
    citation_text: `European Central Bank, euro foreign exchange reference rates, ${opts.base}/${opts.quote} as of ${opts.rateDate} (via Frankfurter). ${retrievedVia(date)} ${sourceUrl}`,
    notices: [
      "ECB reference rates are indicative and 'for information purposes'; they are not transaction rates."
    ]
  });
}
function sdmxCitation(ctx, opts) {
  const date = today(ctx);
  const source = opts.provider === "BIS" ? "Bank for International Settlements" : opts.provider === "IMF" ? "International Monetary Fund" : "European Central Bank";
  const dataset = opts.provider === "BIS" ? `BIS ${opts.flow}` : opts.provider === "IMF" ? opts.datasetLabel ?? opts.flow : `ECB Data Portal ${opts.flow}`;
  return withExports({
    source,
    dataset,
    series_id: `${opts.provider.toLowerCase()}/${opts.flow}/${opts.key}`,
    series_name: opts.seriesName,
    source_url: opts.sourceUrl,
    api_url: opts.apiUrl,
    license: opts.provider === "BIS" ? "BIS statistics may be reproduced and redistributed with attribution; see the BIS terms and conditions for statistics" : opts.provider === "IMF" ? IMF_LICENSE : "ECB content may be reproduced with attribution; see the ECB disclaimer and copyright notice",
    attribution: opts.provider === "BIS" ? "Source: Bank for International Settlements" : opts.provider === "IMF" ? (
      // Same shape the IMF's terms specify for every IMF citation here.
      `Source: International Monetary Fund, ${dataset}, ${opts.sourceUrl}`
    ) : "Source: European Central Bank",
    retrieved_at: date,
    citation_text: `${source}, ${dataset}, series ${opts.key} (${opts.seriesName}). ${retrievedVia(date)} ${opts.sourceUrl}`
  });
}
function caribstatCitation(ctx, opts) {
  const date = today(ctx);
  const freqWord = opts.frequency === "m" ? "monthly" : opts.frequency === "q" ? "quarterly" : "annual";
  const asAt = opts.dataAsAtRaw ?? opts.dataAsAt;
  return withExports({
    source: opts.source,
    dataset: opts.publicationTitle ?? opts.tableTitle ?? "",
    series_id: opts.seriesId,
    series_name: `${opts.rowLabel}, ${opts.countryName} (${freqWord})`,
    source_url: opts.sourceUrl,
    api_url: opts.apiUrl,
    license: "Reproduced with the publishing central bank's permission; see the source entry in /v1/sources for the scope of that grant",
    attribution: `Source: ${opts.source}`,
    retrieved_at: date,
    citation_text: `${opts.source}, ${opts.publicationTitle ?? opts.tableTitle}, ${opts.rowLabel}, ${opts.countryName} (${freqWord})` + (asAt ? `, data as at ${asAt}` : opts.publishedAt ? `, published ${opts.publishedAt}` : "") + `. ${retrievedVia(date)} ${opts.attachmentUrl ?? opts.sourceUrl}`,
    ...asAt ? {
      notices: [
        `The publishing bank stamps this table "Data as at ${asAt}". That is the source's own currency claim and is not the same as the retrieval date above.`
      ]
    } : opts.publishedAt ? {
      notices: [
        `This source publishes no "data as at" stamp. ${opts.publishedAt} is the date of the publication these figures were taken from, which is a weaker claim: it says when the document appeared, not how current the bank considers the figures. Neither is the retrieval date above.`
      ]
    } : {}
  });
}

// ../server/src/adapters/sdmx.ts
var BIS_POLICY_RATE_AREAS = {
  ARG: "AR",
  AUS: "AU",
  AUT: "AT",
  BEL: "BE",
  BRA: "BR",
  CAN: "CA",
  CHE: "CH",
  CHL: "CL",
  CHN: "CN",
  COL: "CO",
  CZE: "CZ",
  DEU: "DE",
  DNK: "DK",
  ESP: "ES",
  FRA: "FR",
  GBR: "GB",
  GRC: "GR",
  HKG: "HK",
  HRV: "HR",
  HUN: "HU",
  IDN: "ID",
  IND: "IN",
  ISL: "IS",
  ISR: "IL",
  ITA: "IT",
  JPN: "JP",
  KOR: "KR",
  KWT: "KW",
  MAR: "MA",
  MEX: "MX",
  MKD: "MK",
  MYS: "MY",
  NLD: "NL",
  NOR: "NO",
  NZL: "NZ",
  PER: "PE",
  PHL: "PH",
  POL: "PL",
  PRT: "PT",
  ROU: "RO",
  RUS: "RU",
  SAU: "SA",
  SRB: "RS",
  SWE: "SE",
  THA: "TH",
  TUR: "TR",
  USA: "US",
  ZAF: "ZA",
  // The euro area: BIS "XM", StatCite ISO3 "EMU". This single line is the bug fix.
  EMU: "XM"
};
function buildUrl(provider, flow, key, lastN) {
  if (provider === "BIS") {
    return `https://stats.bis.org/api/v2/data/dataflow/BIS/${flow}/1.0/${key}?lastNObservations=${lastN}&format=sdmx-json`;
  }
  if (provider === "IMF") {
    return `https://api.imf.org/external/sdmx/3.0/data/dataflow/${flow}/${key}?format=sdmx-json`;
  }
  return `https://data-api.ecb.europa.eu/service/data/${flow}/${key}?format=jsondata&lastNObservations=${lastN}`;
}
function stalenessBudgetMonths(freq) {
  return freq === "D" ? 2 : freq === "M" ? 4 : 18;
}
function monthsBetween(latestPeriod, now) {
  const m = latestPeriod.match(/^(\d{4})-?(\d{2})?/);
  if (!m) return 0;
  const y = parseInt(m[1], 10);
  const mo = m[2] ? parseInt(m[2], 10) : 12;
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - mo);
}
async function fetchSdmxSeries(provider, flow, key, opts = {}) {
  const lastN = opts.lastN ?? 60;
  const apiUrl = buildUrl(provider, flow, key, lastN);
  const body = await fetchJson(apiUrl, {
    ttlSeconds: opts.ttlSeconds ?? 3600,
    timeoutMs: 8e3,
    // BIS content-negotiates SDMX-JSON ONLY via this vendor media type; with a
    // plain application/json Accept it returns XML with a 200. The URL also
    // carries ?format=sdmx-json, which works but is absent from the published
    // OpenAPI spec — the header is the contractual path, the param the belt.
    ...provider === "BIS" ? { accept: "application/vnd.sdmx.data+json" } : {},
    // Shape validation doubles as the XML guard: an XML body never parses to
    // an object carrying these keys, and a 200-with-XML would otherwise be
    // cached and reparsed forever.
    validate: (d) => {
      const root2 = pickRoot(d);
      return Boolean(root2 && root2.dataSets && structureOf(root2));
    }
  });
  const root = pickRoot(body);
  if (!root) throw new Error(`${provider} returned an unexpected SDMX payload shape for ${flow}/${key}`);
  const structure = structureOf(root);
  const periods = structure?.dimensions?.observation?.[0]?.values ?? [];
  const seriesMap = root.dataSets?.[0]?.series ?? {};
  if (Object.keys(seriesMap).length === 0) {
    throw new Error(
      `${provider} returned 200 but no series for ${flow}/${key}. The series key is not valid for this dataflow (usually a wrong dimension order or an unknown code). Treated as a request error, not as an absence of published data.`
    );
  }
  const first = Object.values(seriesMap)[0];
  const obsMap = first?.observations ?? {};
  const observations = Object.entries(obsMap).map(([idx, tuple]) => {
    const p = periods[Number(idx)];
    const period = p?.value ?? p?.id;
    const raw = Array.isArray(tuple) ? tuple[0] : void 0;
    const value = raw == null || raw === "" ? null : Number(raw);
    return { period: period ?? "", value: value != null && Number.isFinite(value) ? value : null };
  }).filter((o) => o.period).sort((a, b) => a.period < b.period ? -1 : a.period > b.period ? 1 : 0);
  const out = {
    observations,
    name: structure?.name,
    apiUrl
  };
  const latest = provider === "IMF" ? void 0 : observations.filter((o) => o.value != null).at(-1);
  if (latest) {
    const lag = monthsBetween(latest.period, opts.now ?? /* @__PURE__ */ new Date());
    const budget = stalenessBudgetMonths(key.split(".")[0] ?? "M");
    if (lag > budget) {
      out.stalenessNote = `Upstream freshness warning: the newest published observation for this ${provider} series is ${latest.period}, about ${lag} months old, beyond the ${budget}-month expectation for its frequency. The source is returning data successfully but may have stopped updating this flow. Treat the latest value as possibly superseded and check the provider directly.`;
    }
  }
  return out;
}
function structureOf(root) {
  return root?.structure ?? (Array.isArray(root?.structures) ? root.structures[0] : void 0);
}
function pickRoot(d) {
  if (!d || typeof d !== "object") return void 0;
  const any = d;
  if (any.data && any.data.dataSets) return any.data;
  if (any.dataSets) return any;
  return void 0;
}

// ../server/src/adapters/caribstat.ts
var CARIBSTAT_ENABLED = true;
var CARIBSTAT_ORIGIN = "https://asokore.github.io/caribstat";
function decodeRow(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
var ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
var MAX_ROW_SELECTOR = 200;
function malformedId(id, why, example) {
  return new ToolError(`Malformed caribstat series id '${quoteInput(id, 120)}': ${why}. ${example} Add '#Row Label' to select one row.`, {
    series_id: quoteInput(id, 200)
  });
}
function parseCaribstatId(id) {
  const rest = id.replace(/^caribstat\//i, "");
  const hashAt = rest.indexOf("#");
  const pathPart = hashAt >= 0 ? rest.slice(0, hashAt) : rest;
  const rowPart = hashAt >= 0 ? rest.slice(hashAt + 1) : void 0;
  if (rowPart && rowPart.length > MAX_ROW_SELECTOR) {
    throw new ToolError(
      `The row selector in this caribstat id is ${rowPart.length} characters long. Row labels are at most ${MAX_ROW_SELECTOR} characters, so name the row as the table lists it.`,
      { series_id: quoteInput(id, 200) }
    );
  }
  const bits = pathPart.split("/");
  if (bits[0]?.toLowerCase() === "cbb") {
    if (bits.length < 3) {
      throw new ToolError(
        `Malformed caribstat series id '${id}'. Central Bank of Barbados ids have the form 'caribstat/CBB/{category}/{sheet}', e.g. 'caribstat/CBB/balance-of-payments-reports/analytical-summary'. Add '#Row Label' to select one row.`,
        { series_id: id }
      );
    }
    const cbbSegments = bits.slice(1);
    if (!cbbSegments.every((seg) => ID_SEGMENT.test(seg))) {
      throw malformedId(id, "each part of the path must be a slug of letters, digits, '-' or '_'", "Example: 'caribstat/CBB/balance-of-payments-reports/analytical-summary'.");
    }
    return {
      provider: "CBB",
      table: bits.slice(1, -1).join("/"),
      sheet: bits[bits.length - 1],
      iso3: "BRB",
      freq: "a",
      ...rowPart ? { row: decodeRow(rowPart) } : {}
    };
  }
  if (bits.length < 3) {
    throw new ToolError(
      `Malformed caribstat series id '${id}'. Expected 'caribstat/{PROVIDER}/{table}/{ISO3}.{freq}', e.g. 'caribstat/ECCB/total-public-sector-debt/AIA.a'. Add '#Row Label' to select one row.`,
      { series_id: id }
    );
  }
  const provider = bits[0];
  if (provider.toLowerCase() !== "eccb") {
    throw malformedId(id, `unknown provider '${quoteInput(provider, 40)}'. The providers are ECCB and CBB`, "Example: 'caribstat/ECCB/total-public-sector-debt/AIA.a'.");
  }
  if (bits.length !== 3) {
    throw malformedId(id, "ECCB ids have exactly one table segment", "Example: 'caribstat/ECCB/total-public-sector-debt/AIA.a'.");
  }
  const last = bits[bits.length - 1];
  const table = bits[1];
  if (!ID_SEGMENT.test(table)) {
    throw malformedId(id, "the table must be a slug of letters, digits, '-' or '_'", "Example: 'caribstat/ECCB/total-public-sector-debt/AIA.a'.");
  }
  const dot = last.lastIndexOf(".");
  if (dot < 1) {
    throw new ToolError(
      `Malformed caribstat series id '${id}': the last segment must be '{ISO3}.{freq}' (frequency a, q or m), e.g. 'AIA.a'.`,
      { series_id: id }
    );
  }
  const iso3 = last.slice(0, dot).toUpperCase();
  const freq = last.slice(dot + 1).toLowerCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw malformedId(id, "the country must be a three-letter ISO code", "Example: 'caribstat/ECCB/total-public-sector-debt/AIA.a'.");
  }
  if (!["a", "q", "m"].includes(freq)) {
    throw new ToolError(`Unsupported caribstat frequency '${freq}' in '${id}'. Use a (annual), q (quarterly) or m (monthly).`, {
      series_id: id
    });
  }
  return { provider: provider.toUpperCase(), table, iso3, freq, row: rowPart?.trim() || void 0 };
}
function inferFrequency(periods) {
  const p = (periods ?? []).find((x) => typeof x === "string");
  if (!p) return "a";
  if (/^\d{4}-Q[1-4]$/i.test(p)) return "q";
  if (/^\d{4}-\d{2}$/.test(p)) return "m";
  return "a";
}
var CARIBSTAT_CACHE_EPOCH = "2026-08-15a";
function caribstatUrl(p, origin = CARIBSTAT_ORIGIN) {
  const v = `?v=${CARIBSTAT_CACHE_EPOCH}`;
  const enc = (path) => path.split("/").map(encodeURIComponent).join("/");
  if (p.provider.toLowerCase() === "cbb") {
    return `${origin}/data/cbb/${enc(p.table)}/${enc(p.sheet ?? "")}.json${v}`;
  }
  return `${origin}/data/${enc(p.provider.toLowerCase())}/${enc(p.table)}/${enc(p.freq)}/${enc(p.iso3)}.json${v}`;
}
function canonicalCaribstatBase(p) {
  return p.provider === "CBB" ? `caribstat/CBB/${p.table}/${p.sheet}` : `caribstat/${p.provider}/${p.table}/${p.iso3}.${p.freq}`;
}
function withOccurrence(row, n, total) {
  return total > 1 ? { ...row, label: `${row.label} [${n} of ${total}]` } : row;
}
function selectRow(doc, want) {
  if (!doc.series?.length) {
    throw new ToolError(`caribstat document for ${doc.table_id}/${doc.country.iso3} contains no series rows.`, {
      table: doc.table_id,
      country: doc.country.iso3,
      no_published_data: true
    });
  }
  if (!want) return doc.series[0];
  const trimmed = want.trim();
  const occ = /\[(\d+)(?:\s+of\s+\d+)?\]$/i.exec(trimmed);
  const wantLabel = occ ? trimmed.slice(0, occ.index).trim() : want;
  const matches = doc.series.filter((s) => s.label.toLowerCase() === wantLabel.toLowerCase());
  if (occ) {
    const n = Number(occ[1]);
    if (n >= 1 && n <= matches.length) return withOccurrence(matches[n - 1], n, matches.length);
    throw new ToolError(
      `Row '${wantLabel}' occurs ${matches.length} time(s) in ${doc.table_id}/${doc.country.iso3}, so [${n}] is out of range.`,
      { table: doc.table_id, country: doc.country.iso3, occurrences: matches.length }
    );
  }
  if (matches.length > 1) {
    const first = (r) => r.observations.find((o) => o.value != null)?.value ?? "no values";
    throw new ToolError(
      `Row selector '${wantLabel}' matches ${matches.length} different rows in ${doc.table_id}/${doc.country.iso3}, which the source repeats under different headings. They are distinct series: ` + matches.map((m, i) => `[${i + 1}] first value ${first(m)}`).join(", ") + `. Select one with '${wantLabel}[1]' \u2026 '${wantLabel}[${matches.length}]'.`,
      {
        table: doc.table_id,
        country: doc.country.iso3,
        ambiguous_label: wantLabel,
        occurrences: matches.length
      }
    );
  }
  if (matches.length === 1) return matches[0];
  const prefixed = doc.series.filter((s) => s.label.toLowerCase().startsWith(want.toLowerCase()));
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) {
    throw new ToolError(
      `Row selector '${want}' is ambiguous in ${doc.table_id}/${doc.country.iso3}: it matches ${prefixed.length} rows (${prefixed.map((s) => `"${s.label}"`).join(", ")}). Use the exact label.`,
      { table: doc.table_id, country: doc.country.iso3, matches: prefixed.map((s) => s.label) }
    );
  }
  throw new ToolError(
    `No row '${want}' in ${doc.table_id}/${doc.country.iso3}. Available rows: ${doc.series.map((s) => s.label).join(" | ")}`,
    { table: doc.table_id, country: doc.country.iso3, available_rows: doc.series.map((s) => s.label) }
  );
}
async function fetchCaribstatSeries(id, opts = {}) {
  const parsed = parseCaribstatId(id);
  const apiUrl = caribstatUrl(parsed, opts.origin ?? CARIBSTAT_ORIGIN);
  let doc;
  try {
    doc = await fetchJson(apiUrl, {
      // Six hours: the banks publish monthly at best, and the document carries
      // its own data_as_at so a consumer can always see the real currency.
      ttlSeconds: opts.ttlSeconds ?? 21600,
      timeoutMs: 8e3,
      validate: (d) => {
        const x = d;
        return Boolean(x && typeof x === "object" && Array.isArray(x.series) && x.country?.iso3 && x.source);
      }
    });
  } catch (e) {
    if (e instanceof Error && /HTTP 404/.test(e.message)) {
      throw new ToolError(
        `No CaribStat series '${canonicalCaribstatBase(parsed)}'. That combination of table, country and frequency is not collected. Not every table exists at every frequency: consumer-price-index is annual and quarterly only, and public-sector-debt is annual only.`,
        { series_id: canonicalCaribstatBase(parsed), api_url: apiUrl, no_published_data: true }
      );
    }
    throw e;
  }
  doc = sanitiseDoc(doc);
  const row = selectRow(doc, parsed.row);
  let defaultRow;
  if (!parsed.row && doc.series.length > 1) {
    const same = doc.series.filter((s) => s.label === row.label).length;
    defaultRow = { selector: same > 1 ? `${row.label}[1]` : row.label, rows: doc.series.map((s) => s.label) };
  }
  return {
    doc,
    label: row.label,
    unit: row.unit,
    observations: row.observations,
    apiUrl,
    canonicalBase: canonicalCaribstatBase(parsed),
    rowSelected: Boolean(parsed.row),
    ...defaultRow ? { defaultRow } : {}
  };
}
var PROVIDER_HOME = {
  eccb: "https://www.eccb-centralbank.org",
  cbb: "https://www.centralbank.org.bb"
};
function sanitiseDoc(doc) {
  const home = PROVIDER_HOME[String(doc.source_id ?? "").toLowerCase()] ?? PROVIDER_HOME[doc.country?.iso3 === "BRB" ? "cbb" : "eccb"];
  return {
    ...doc,
    source: cleanLabel(doc.source, 120),
    source_url: httpsUrl(doc.source_url) ?? home,
    ...doc.attachment_url !== void 0 ? { attachment_url: httpsUrl(doc.attachment_url) } : {},
    ...doc.table_title !== void 0 ? { table_title: cleanLabel(doc.table_title) } : {},
    ...doc.publication_title !== void 0 ? { publication_title: cleanLabel(doc.publication_title) } : {},
    ...doc.sheet !== void 0 ? { sheet: cleanLabel(doc.sheet, 120) } : {},
    // The date stamps go into citation_text and notices too. An empty result
    // becomes undefined, so a stamp made only of control characters cannot
    // win the `data_as_at_raw ?? data_as_at` choice and hide the real date.
    ...doc.data_as_at !== void 0 ? { data_as_at: cleanLabel(doc.data_as_at, 60) || void 0 } : {},
    ...doc.data_as_at_raw !== void 0 ? { data_as_at_raw: cleanLabel(doc.data_as_at_raw, 60) || void 0 } : {},
    ...doc.published_at !== void 0 ? { published_at: cleanLabel(doc.published_at, 60) || void 0 } : {},
    country: { ...doc.country, name: cleanLabel(doc.country?.name, 120) },
    series: doc.series.map((s) => ({ ...s, label: cleanLabel(s.label) }))
  };
}
var CARIBSTAT_CATALOGUE = [
  {
    provider: "ECCB",
    table: "total-public-sector-debt",
    title: "Total Public Sector Debt",
    freqs: ["a", "q"],
    geographies: 9,
    sampleRow: "Central Government Debt",
    topics: ["debt", "public sector debt", "government debt", "external debt", "domestic debt"]
  },
  {
    provider: "ECCB",
    table: "debt-to-gdp",
    title: "Debt to GDP",
    freqs: ["a"],
    geographies: 9,
    sampleRow: "Total Public Sector Debt to GDP",
    topics: ["debt to gdp", "debt ratio", "debt burden", "gdp"]
  },
  {
    provider: "ECCB",
    table: "central-government-fiscal-accounts",
    title: "Central Government Fiscal Accounts",
    freqs: ["a", "q", "m"],
    geographies: 9,
    sampleRow: "Total Revenue and Grants",
    topics: ["fiscal", "revenue", "expenditure", "budget", "deficit", "tax", "grants"]
  },
  {
    provider: "ECCB",
    table: "consumer-price-index",
    title: "Consumer Price Index",
    freqs: ["a", "q"],
    geographies: 9,
    sampleRow: "Inflation Rate - end of period",
    topics: ["inflation", "cpi", "prices", "consumer price", "cost of living"]
  },
  {
    provider: "ECCB",
    table: "summarized-monetary-survey",
    title: "Summarized Monetary Survey",
    freqs: ["a", "q", "m"],
    geographies: 9,
    sampleRow: "Money Supply (M2)",
    topics: ["money supply", "monetary", "m2", "credit", "deposits", "reserves"]
  },
  {
    provider: "ECCB",
    table: "interest-rates-deposits-loans",
    title: "Interest Rates on Deposits and Loans",
    freqs: ["a", "q", "m"],
    geographies: 9,
    sampleRow: "Weighted Average Deposit Rate",
    topics: ["interest rate", "lending rate", "deposit rate", "spread"]
  },
  {
    provider: "ECCB",
    table: "selected-tourism-statistics",
    title: "Selected Tourism Statistics",
    freqs: ["a", "q", "m"],
    geographies: 9,
    sampleRow: "Total Visitors",
    topics: ["tourism", "visitors", "arrivals", "cruise", "stayover"]
  },
  // --- CBB ------------------------------------------------------------
  //
  // GENERATED. Run `node tools/cbb/catalogue.mjs` in caribstat/ and paste the
  // output here. Do not hand-edit the sheet lists.
  //
  // WHY GENERATED. Search builds a series id from the FIRST sheet listed:
  // `caribstat/CBB/{table}/{sheets[0]}`. These were written by hand and were
  // wrong -- `real-gdp`, `tourism` and `unemployment` against the real
  // `real-gdp-2010-prices`, `h1-processing` and `table-i5` -- so every CBB
  // suggestion search made returned 422 when followed. A recommendation that
  // cannot be fetched is worse than none, because the caller blames their own
  // request. The list also covered 5 of 16 categories, leaving eleven
  // unreachable by search.
  {
    provider: "CBB",
    table: "balance-of-payments-reports",
    title: "Balance of Payments (BOP)",
    sheets: ["standard-summary", "financial-account-balances", "net-acquision-of-assets", "net-incurrence-of-liabilities", "financial-account-summary", "other-services", "primary-income", "secondary-income", "transport", "current-account", "analytical-summary", "capital-account", "travel", "government-nie"],
    sampleRow: "1. CURRENT ACCOUNT",
    topics: ["balance of payments", "bop", "current account", "capital account", "trade balance"]
  },
  {
    provider: "CBB",
    table: "commercial-banks-deposit-liabilities",
    title: "Loan Assets And Deposit Liability",
    sheets: ["bankdeptot", "cudeposits", "partiiideptot", "bankloantot", "culoans", "partiiiloantot"],
    sampleRow: "Central Bank",
    topics: ["deposit liabilities", "commercial banks", "loan assets", "bank deposits"]
  },
  {
    provider: "CBB",
    table: "commercial-banks-provisional-deposit-liabilities",
    title: "Commercial Banks' Provisional Deposit Liabilities",
    sheets: ["b2e1a", "b2e", "b2e1", "b2e2", "b2e3", "b2e4"],
    sampleRow: "Agriculture",
    topics: ["provisional deposits", "commercial banks", "deposit liabilities"]
  },
  {
    provider: "CBB",
    table: "depository-corporations-survey",
    title: "Depository Corporation Survey",
    sheets: ["dcs-broadmoney", "dcs-domestic-claims-expanded"],
    sampleRow: "Claims on Non Residents",
    topics: ["depository corporations", "broad money", "domestic claims", "money supply"]
  },
  {
    provider: "CBB",
    table: "exchange-rates-cbob",
    title: "Exchange Rates",
    sheets: ["e3", "e4"],
    sampleRow: "Stg",
    topics: ["exchange rate", "currency", "fx", "barbados dollar"]
  },
  {
    provider: "CBB",
    table: "financial-soundness-indicators",
    title: "Core Financial Soundness Indicators for Deposit Takers",
    sheets: ["core-fis-for-deposit-takers"],
    sampleRow: "Regulatory capital to risk-weighted assets",
    topics: ["financial soundness", "capital adequacy", "fsi", "deposit takers", "bank stability"]
  },
  {
    provider: "CBB",
    table: "gross-domestic-product",
    title: "Gross Domestic Product (GDP)",
    sheets: ["real-gdp-2016-prices", "real-gdp-2010-prices"],
    sampleRow: "Agriculture and Fishing",
    topics: ["gdp", "growth", "output", "sectors", "real gdp"]
  },
  {
    provider: "CBB",
    table: "index-of-industrial-production",
    title: "Index of Industrial Production",
    sheets: ["1994-avg", "1994-eop", "1982-avg", "1982-eop"],
    sampleRow: "Total All Industries",
    topics: ["industrial production", "manufacturing", "output", "iip"]
  },
  {
    provider: "CBB",
    table: "inflation-and-retail-price-index",
    title: "Retail Price Index (RPI) and Rate of Inflation",
    sheets: ["inflation", "jul2001-eop-rw", "jul2018-avg-rw", "jul2018-eop-rw", "jul2001-avg-rw", "jul2001-eop", "may1994-eop", "jul2001-avg", "mar1980-avg", "mar1980-eop", "may1994-avg", "oct1965-avg", "oct1965-eop"],
    sampleRow: "12 MONTH MOVING AVERAGE",
    topics: ["inflation", "retail price index", "rpi", "prices", "cost of living"]
  },
  {
    provider: "CBB",
    table: "interest-rates",
    title: "Selected Interest Rates, Comparative Treasury Bill Rates and Bank Rates",
    sheets: ["e1", "e2"],
    sampleRow: "Deposits: Savings",
    topics: ["interest rate", "treasury bill", "bank rate", "lending rate", "deposit rate"]
  },
  {
    provider: "CBB",
    table: "international-reserves",
    title: "Monetary Base and Net Domestic Assets",
    sheets: ["nda", "internationalreserves"],
    sampleRow: "NIR",
    topics: ["international reserves", "foreign reserves", "monetary base", "net domestic assets"]
  },
  {
    provider: "CBB",
    table: "labour-statistics",
    title: "Labour Statistics",
    sheets: ["table-i5d", "table-i5b", "table-i5f", "table-i5", "table-i5c2", "table-i5a", "table-i5c1", "table-i5e"],
    sampleRow: "Employer",
    topics: ["labour", "labor", "unemployment", "employment", "jobs", "wages"]
  },
  {
    provider: "CBB",
    table: "statistics",
    title: "Investments (Provisional)",
    sheets: ["b2f", "b3f", "depositorycorporations", "monetaryauthorities", "loans-deposits"],
    sampleRow: "TOTAL: Fixed Income Securities",
    topics: ["investments", "depository corporations", "monetary authorities", "bank investments"]
  },
  {
    provider: "CBB",
    table: "the-wages-index",
    title: "Wages Index",
    sheets: ["wagesindex"],
    sampleRow: "Extrapolated WAGES INDEX",
    topics: ["wages", "wage index", "earnings", "pay"]
  },
  {
    provider: "CBB",
    table: "tourism",
    title: "Long Stay & Cruise Arrivals",
    sheets: ["h1-processing"],
    sampleRow: "U.S.A",
    topics: ["tourism", "arrivals", "visitors", "cruise", "long stay"]
  },
  {
    provider: "CBB",
    table: "trade-in-goods-barbados",
    title: "Trade in Goods",
    sheets: ["g2b", "g3b", "g4b", "g1a", "g2a", "g3a", "g4a", "g1"],
    sampleRow: "FOOD AND BEVERAGES: Sugar",
    topics: ["trade in goods", "imports", "exports", "re-exports", "merchandise trade"]
  }
];
var ECCB_GEOGRAPHIES = {
  AIA: "Anguilla",
  ATG: "Antigua and Barbuda",
  DMA: "Dominica",
  GRD: "Grenada",
  KNA: "St. Kitts and Nevis",
  LCA: "St. Lucia",
  MSR: "Montserrat",
  VCT: "St. Vincent and the Grenadines",
  XCU: "ECCU (currency union aggregate)"
};
function searchCaribstat(query, limit = 4) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  let iso3;
  for (const [code, name] of Object.entries(ECCB_GEOGRAPHIES)) {
    if (q.includes(name.toLowerCase()) || q.includes(code.toLowerCase())) {
      iso3 = code;
      break;
    }
  }
  const caribbeanIntent = /caribbean|eccu|eccb|barbados|antigua|anguilla|montserrat|grenada|dominica|lucia|kitts|nevis|vincent/i.test(q);
  const out = [];
  for (const e of CARIBSTAT_CATALOGUE) {
    let score = 0;
    for (const t of e.topics) {
      if (q.includes(t)) score += t.split(" ").length * 2;
    }
    if (e.title.toLowerCase().includes(q)) score += 3;
    if (score > 0 && !caribbeanIntent && !e.title.toLowerCase().includes(q)) continue;
    if (score === 0 && caribbeanIntent) score = 1;
    if (score === 0) continue;
    const id = e.provider === "ECCB" ? `caribstat/ECCB/${e.table}/${iso3 ?? "AIA"}.${e.freqs?.[0] ?? "a"}` : `caribstat/CBB/${e.table}/${e.sheets?.[0]}`;
    out.push({
      entry: e,
      iso3,
      id,
      score,
      why: e.provider === "ECCB" ? `${e.title}, ${e.geographies} ECCB geographies, ${(e.freqs ?? []).join("/")}` : `${e.title}, Barbados, ${(e.sheets ?? []).length} sheet(s)`
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map(({ entry, iso3: iso32, id, why }) => ({ entry, iso3: iso32, id, why }));
}
var UNCTAD_GDP_FALLBACK = {
  AIA: { name: "Anguilla", slug: "anguilla" },
  MSR: { name: "Montserrat", slug: "montserrat" },
  VGB: { name: "British Virgin Islands", slug: "british-virgin-islands" }
};
function searchUnctadGap(query) {
  const q = query.toLowerCase();
  if (!/\bgdp\b|growth|economy|output|national accounts/.test(q)) return [];
  const out = [];
  for (const [iso3, v] of Object.entries(UNCTAD_GDP_FALLBACK)) {
    if (q.includes(v.name.toLowerCase()) || q.includes(iso3.toLowerCase())) {
      out.push({
        iso3,
        name: v.name,
        id: `dbnomics/UNCTAD/GDPTAPCGRA/A.annual-average-growth-rate.${v.slug}`
      });
    }
  }
  return out;
}

// ../server/src/core/eccb-related.ts
var ECCU_ISO3 = /* @__PURE__ */ new Set(["AIA", "ATG", "DMA", "GRD", "KNA", "LCA", "MSR", "VCT", "XCU"]);
var RELATED = {
  govt_debt_gdp: (iso3) => ({
    series: [
      { id: `caribstat/ECCB/debt-to-gdp/${iso3}.a#Total Public Sector Debt to GDP`, label: "Total public sector debt to GDP (ECCB)" },
      { id: `caribstat/ECCB/debt-to-gdp/${iso3}.a#Central Government Debt to GDP`, label: "Central government debt to GDP (ECCB)" }
    ],
    definition: "The ECCB reports central government and total public sector debt, not the IMF's general government gross debt, so the figures are related but not the same measure."
  }),
  inflation_cpi: (iso3) => ({
    series: [
      { id: `caribstat/ECCB/consumer-price-index/${iso3}.a#Inflation Rate - end of period`, label: "Inflation, end of period (ECCB)" }
    ],
    definition: "The ECCB reports inflation end of period, the change to December, not the annual-average change the World Bank series measures."
  })
};
function eccbRelated(key, iso3) {
  if (!ECCU_ISO3.has(iso3)) return void 0;
  const f = RELATED[key];
  return f ? f(iso3) : void 0;
}

// ../server/src/core/series.ts
function assertYearWindow(opts) {
  const { start, end } = opts;
  if (!start || !end) return;
  if (Number(start) > Number(end)) {
    throw new ToolError(
      `start_year (${start}) is after end_year (${end}). Swap them: the window runs from the earlier year to the later one.`,
      { start_year: start, end_year: end }
    );
  }
}
function requireCountry(input) {
  const c = resolveCountry(input);
  if (!c) {
    const suggestions = suggestCountries(input);
    throw new ToolError(
      `Could not resolve country '${input}'. Use an ISO3 code (e.g. USA, BRB, DEU) or a standard English name.` + (suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""),
      { input, suggestions },
      "unknown_country"
    );
  }
  return c;
}
function finishSeries(result, opts) {
  const windowed = filterPeriodRange(result.observations, opts.start, opts.end);
  let obs = windowed;
  const transform = opts.transform ?? "none";
  const hadValuesBeforeTransform = windowed.some((o) => o.value != null);
  if (transform !== "none") {
    const basis = transform === "index" ? windowed : result.observations;
    const t = applyTransform(basis, transform, { frequency: result.frequency });
    obs = transform === "index" ? t.observations : filterPeriodRange(t.observations, opts.start, opts.end);
    if (t.note) result.notes.push(t.note);
    if (t.unit) result.unit = t.unit;
    if (result.citation) {
      const derived = "Values shown are computed by StatCite from the cited series, not as published by the source.";
      result.citation.notices = [...result.citation.notices ?? [], derived];
    }
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
    const allValued = result.observations.filter((o) => o.value != null);
    if (allValued.length === 0) {
      throw new ToolError(
        `${result.name ?? result.series_id} has no published values for ${result.country ? result.country.name : "this query"} at the source. This is a statement about what the source publishes, not a data error. Some economies are not covered by this series.`,
        { series_id: result.series_id, no_published_data: true }
      );
    }
    const availStart = allValued[0].period;
    const availEnd = allValued[allValued.length - 1].period;
    const y = (p) => p.slice(0, 4);
    const before = opts.start ? [...allValued].reverse().find((o) => y(o.period) < opts.start) : void 0;
    const after = opts.end ? allValued.find((o) => y(o.period) > opts.end) : void 0;
    const insideRange = Boolean(before && after);
    if (insideRange) {
      const win = opts.start && opts.end && opts.start === opts.end ? opts.start : `${opts.start ?? "\u2026"}\u2013${opts.end ?? "\u2026"}`;
      const near = [before, after].filter(Boolean).map((o) => `${o.period} (${o.value})`);
      throw new ToolError(
        `The source publishes ${win} as missing for ${result.series_id}${result.country ? ` (${result.country.name})` : ""}. This is a gap inside the published range ${availStart}\u2013${availEnd}, not a window outside it.` + (near.length ? ` Nearest published values: ${near.join(" and ")}.` : ""),
        {
          series_id: result.series_id,
          no_published_data: false,
          gap_in_published_range: true,
          available_range: { start: availStart, end: availEnd },
          ...before ? { nearest_before: before } : {},
          ...after ? { nearest_after: after } : {}
        }
      );
    }
    throw new ToolError(
      `No observations available for ${result.series_id}${result.country ? ` (${result.country.name})` : ""} in the requested window` + (opts.start || opts.end ? ` ${opts.start ?? "\u2026"}\u2013${opts.end ?? "\u2026"}` : "") + `. Published data exists for ${availStart}\u2013${availEnd}, adjust the year range.`,
      { series_id: result.series_id, no_published_data: false, available_range: { start: availStart, end: availEnd } }
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
  const wb = await fetchWbSeries(country.iso3, def.wb, { countryUnverified: country.unverified, hostState: hostStateOf(ctx) });
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
  const s = await fetchDbnomicsSeries(provider, dataset, code, { hostState: hostStateOf(ctx) });
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
  return `The IMF's ${refKind} database is currently at a different edition (${other.source}) than this series' edition (${thisEdition.label}). Fiscal indicators drawn from the two databases (e.g. revenue/expenditure vs. debt/balance) may temporarily reflect different releases.`;
}
async function indicatorFromDataMapper(ctx, def, country, opts) {
  const [code, dataset] = def.datamapper;
  const now = ctx.now ? ctx.now() : /* @__PURE__ */ new Date();
  const s = await fetchDataMapperSeries(ctx, code, dataset, country.iso3, now);
  const { boundaryYear, clamped } = computeBoundaryYear(s.horizonYear, now, s.edition?.year);
  const kind = dataset === "FM" ? "IMF Fiscal Monitor" : "IMF WEO";
  const notes = def.notes ? [def.notes] : [];
  let editionLabel;
  if (s.edition?.year && s.edition?.month) {
    editionLabel = s.edition.label;
  } else {
    editionLabel = `${boundaryYear} vintage (April or October edition, edition metadata unavailable; a newer edition may exist)`;
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
        `This series' data horizon (through ${s.horizonYear}) is ${Math.abs(gap - 5)} year(s) off the usual edition-year-plus-5 pattern for the ${editionLabel} edition. The values and edition-label fetches may reflect slightly different load moments. The projection boundary used here (${boundaryYear}) is derived from the data's own horizon, not the label, so this does not affect which values are flagged as projections.`
      );
    }
    if (s.edition.lastModified) {
      const lm = /* @__PURE__ */ new Date(s.edition.lastModified.replace(" ", "T") + "Z");
      const editionLoadMs = Date.UTC(s.edition.year, s.edition.month - 1, 1);
      if (!Number.isNaN(lm.getTime())) {
        const daysSince = (lm.getTime() - editionLoadMs) / (24 * 3600 * 1e3);
        if (daysSince > 40) {
          notes.push(
            `The IMF reloaded this series' data on ${s.edition.lastModified.slice(0, 10)}, ${Math.round(daysSince)} day(s) after the ${editionLabel} release. Values may include a post-release revision (e.g. a WEO Update) not contained in the originally-published ${editionLabel} database.`
          );
        }
      }
    }
  }
  if (clamped) {
    notes.push(
      s.edition?.year != null ? `The data horizon implied a projection-boundary year that looked implausible against the IMF's release calendar, so it was clamped to ${boundaryYear} (the older of the payload's own edition year and the calendar-expected edition year). Consistent with the DataMapper serving a stale edition, or a truncated/mid-load payload.` : `The data horizon implied a projection-boundary year that looked implausible against the IMF's release calendar, so the calendar year (${boundaryYear}) was used instead. Possible if this payload is truncated or mid-load.`
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
    countryMaxYear > 0 && countryMaxYear < boundaryYear ? `${base} The IMF publishes no current-edition projections for ${country.name} on this series; it ends at ${countryMaxYear}. Treat recent values as unconfirmed estimates, not the IMF's current assessment.` : base
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
async function indicatorFromSdmx(ctx, def, country, opts) {
  const cfg = def.sdmx;
  const perCountry = cfg.key.includes("{ISO2}");
  if (!perCountry && country.iso3 !== "EMU" && country.iso3 !== "XM") {
    throw new ToolError(
      `'${def.key}' is a euro-area aggregate series and is only published for the euro area, request it with country="euro area".`,
      { indicator: def.key, country: country.iso3 },
      "invalid_request"
    );
  }
  let areaCode;
  if (perCountry) {
    areaCode = cfg.provider === "BIS" ? BIS_POLICY_RATE_AREAS[country.iso3] : country.iso2;
    if (!areaCode) {
      throw new ToolError(
        `${cfg.provider} does not publish ${def.label} for ${country.name}. This is a coverage fact at the source, not a lookup failure. The BIS compiles policy rates for ${Object.keys(BIS_POLICY_RATE_AREAS).length} economies.`,
        { indicator: def.key, country: country.iso3, no_published_data: true }
      );
    }
  }
  const key = cfg.key.replace("{ISO2}", areaCode ?? "");
  const s = await fetchSdmxSeries(cfg.provider, cfg.flow, key, { now: ctx.now ? ctx.now() : void 0 });
  if (s.observations.length === 0) {
    throw new ToolError(
      `${cfg.provider} publishes no ${def.label} series for ${country.name}. This is a coverage fact at the source, not a lookup failure.`,
      { indicator: def.key, country: country.iso3, no_published_data: true }
    );
  }
  const notes = [];
  if (s.stalenessNote) notes.push(s.stalenessNote);
  return finishSeries(
    {
      series_id: `${cfg.provider.toLowerCase()}/${cfg.flow}/${key}`,
      name: def.label,
      country: { iso3: country.iso3, name: country.name },
      unit: def.unit,
      frequency: key.startsWith("D.") ? "daily" : key.startsWith("M.") ? "monthly" : void 0,
      observations: s.observations,
      citation: sdmxCitation(ctx, {
        provider: cfg.provider,
        flow: cfg.flow,
        key,
        seriesName: s.name ? `${s.name}, ${country.name}` : `${def.label}, ${country.name}`,
        sourceUrl: cfg.sourceUrl,
        apiUrl: s.apiUrl
      }),
      notes
    },
    opts
  );
}
function buildSourceAttempts(ctx, def, country, opts) {
  const preferDbnomics = def.dbnomics && (!def.wb || DB_PRIMARY.has(def.key));
  const attempts = [];
  if (def.sdmx) {
    attempts.push({
      label: def.sdmx.provider === "BIS" ? "BIS statistics" : "ECB Data Portal",
      run: () => indicatorFromSdmx(ctx, def, country, opts)
    });
    return attempts;
  }
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
  return attempts;
}
async function getIndicator(ctx, key, countryInput, opts = {}) {
  assertYearWindow(opts);
  const def = getIndicatorDef(key);
  if (!def) {
    const near = searchIndicatorDefs(key, 8).filter((m) => !isDisabledDef(m.def)).slice(0, 5).map((m) => m.def.key);
    throw new ToolError(
      `Unknown indicator '${key}'.` + (near.length ? ` Closest matches: ${near.join(", ")}.` : "") + (ctx.surface === "rest" ? " Use GET /v1/indicators to list the registry, or pass an explicit series id like 'worldbank/NY.GDP.MKTP.KD.ZG'." : " Use search_indicators to browse the registry, or pass an explicit series id like 'worldbank/NY.GDP.MKTP.KD.ZG'."),
      { input: key, suggestions: near },
      "unknown_indicator"
    );
  }
  const country = requireCountry(countryInput);
  if (!def.wb && !def.dbnomics && def.fred) {
    if (country.iso3 !== "USA") {
      throw new ToolError(`Indicator '${def.key}' is a US-specific series (FRED ${def.fred}).`, { indicator: def.key });
    }
    return indicatorFromFred(ctx, def, opts);
  }
  const attempts = buildSourceAttempts(ctx, def, country, opts);
  const tried = opts.strictSource ? attempts.slice(0, 1) : attempts;
  const errors = [];
  const attemptDetails = [];
  const attemptAbsent = [];
  const attemptCodes = [];
  let absenceDetails;
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
          firstErrorWasTransient ? `${primaryLabel} was transiently unavailable for this request; served from ${servedLabel} instead, which may use a different statistical definition and can report a different value for the same nominal indicator. If exact consistency with ${primaryLabel} matters, retry this query, the primary source may have recovered. (${errors[0]})` : anyErrorWasTransient ? `${primaryLabel} does not have this indicator/country/period, and an intermediate fallback source was transiently unavailable; served from ${servedLabel} instead. A skipped source may recover, so the serving source for this query can change on retry. (${errors[0]})` : `${primaryLabel} does not have this indicator/country/period; served from ${servedLabel} instead. (${errors[0]})`
        );
      }
      return result;
    } catch (e) {
      const transient = isTransientUpstreamError(e);
      if (i === 0) firstErrorWasTransient = transient;
      if (transient) anyErrorWasTransient = true;
      errors.push(e instanceof Error ? e.message : String(e));
      attemptDetails.push(e instanceof ToolError && e.details && typeof e.details === "object" ? e.details : void 0);
      attemptAbsent.push(
        e instanceof ToolError && e.details?.no_published_data === true || e instanceof UpstreamError && e.status === 404
      );
      attemptCodes.push(e instanceof ToolError ? e.code : void 0);
      if (e instanceof ToolError && e.details && typeof e.details === "object" && "no_published_data" in e.details) {
        if (!absenceDetails) absenceDetails = e.details;
      }
    }
  }
  if (opts.strictSource && attempts.length > tried.length) {
    throw new ToolError(
      `Could not retrieve '${def.key}' for ${country.name} from its primary source (${tried[0].label}): ${errors.join(" | ")}. strict_source=true prevented fallback to ${attempts[1].label}` + (firstErrorWasTransient ? "; the failure looks transient. Retrying this query may succeed, or drop strict_source to accept the fallback source" : "") + ".",
      { indicator: def.key, country: country.iso3, strict_source: true }
    );
  }
  const territory = integratedTerritoryNote(country.iso3, country.name);
  if (territory) {
    const t = INTEGRATED_TERRITORIES[country.iso3];
    throw new ToolError(`No '${def.key}' for ${country.name}. ${territory}`, {
      indicator: def.key,
      country: country.iso3,
      no_published_data: true,
      reported_under: t.parentIso3,
      publisher: t.publisher,
      publisher_url: t.publisherUrl
    });
  }
  const definitiveAbsence = !anyErrorWasTransient && attemptAbsent.length === tried.length && attemptAbsent.every(Boolean);
  if (definitiveAbsence) {
    const labels = tried.map((t) => t.label);
    const sources = tried.map((t, i) => ({ source: t.label, no_published_data: true, reason: cleanReason(errors[i]) }));
    const related = eccbRelated(def.key, country.iso3);
    if (related) {
      throw new ToolError(
        `None of the sources for '${def.key}' (${labels.join(", ")}) publishes it for ${country.name}. The Eastern Caribbean Central Bank publishes a related series on its own definition: ` + related.series.map((s) => `'${s.id}'`).join(" and ") + `. ${related.definition} Fetch it with get_series and state that definition when you cite it. It is not substituted here because the measures differ.`,
        {
          ...absenceDetails,
          indicator: def.key,
          country: country.iso3,
          no_published_data: true,
          publisher: "Eastern Caribbean Central Bank",
          publisher_url: "https://www.eccb-centralbank.org/statistics",
          related_series: related.series,
          definition_note: related.definition,
          sources
        }
      );
    }
    throw new ToolError(
      `None of the sources for '${def.key}' (${labels.join(", ")}) publishes it for ${country.name}. This is a statement about what those sources publish, not a lookup failure. Some economies are not covered by every series.`,
      { ...absenceDetails, indicator: def.key, country: country.iso3, no_published_data: true, sources },
      "no_published_data"
    );
  }
  const windowMiss = attemptDetails.find((d) => d?.no_published_data === false && d.available_range);
  const statedCode = attemptCodes[0] && attemptCodes.every((c) => c === attemptCodes[0]) ? attemptCodes[0] : void 0;
  const code = anyErrorWasTransient ? "upstream_unavailable" : windowMiss ? windowMiss.gap_in_published_range ? "data_gap" : "out_of_range" : statedCode ?? "upstream_unavailable";
  throw new ToolError(
    `Could not retrieve '${def.key}' for ${country.name}: ${errors.map(cleanReason).join(" | ")}`,
    {
      ...anyErrorWasTransient ? {} : windowMiss ?? {},
      indicator: def.key,
      country: country.iso3,
      sources: tried.map((t, i) => ({
        source: t.label,
        ...attemptAbsent[i] ? { no_published_data: true } : {},
        reason: cleanReason(errors[i])
      }))
    },
    code
  );
}
function hasDotSegment(path) {
  return path.split("/").some((seg) => {
    let d = seg;
    try {
      d = decodeURIComponent(seg);
    } catch {
    }
    return d === "." || d === "..";
  });
}
function cleanReason(msg) {
  const m = String(msg ?? "").replace(/(Upstream returned HTTP \d+):\s*[\[{][\s\S]*$/, "$1");
  return m.length > 300 ? m.slice(0, 297) + "..." : m;
}
function asOfCapableIndicators() {
  return INDICATORS.filter((d) => d.dbnomics).map((d) => d.key);
}
async function getIndicatorAtEdition(ctx, def, country, edition, opts = {}) {
  if (!def.dbnomics) {
    throw new ToolError(`'${def.key}' has no dated IMF WEO source; editions cannot be pinned.`, { indicator: def.key });
  }
  const [provider, datasetTemplate, codeTemplate] = def.dbnomics;
  const dataset = datasetTemplate.replace(/:latest$/, `:${edition}`);
  const imfVintage = IMF_VINTAGE_FLOWS[edition];
  if (imfVintage) {
    try {
      return await indicatorFromImfVintage(ctx, def, country, edition, imfVintage, codeTemplate, opts);
    } catch {
    }
  }
  const pinnedDef = { ...def, dbnomics: [provider, dataset, codeTemplate] };
  try {
    return await indicatorFromDbnomics(ctx, pinnedDef, country, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ToolError(
      `Could not retrieve the ${dataset} vintage of '${def.key}' for ${country.name}: ${msg} DBnomics's dated WEO editions have been confirmed to exist back to 2010-04; a date far outside that range, or a future date past the current edition, may not have a matching edition ingested.`,
      { indicator: def.key, country: country.iso3, edition },
      isTransientUpstreamError(e) ? "upstream_unavailable" : void 0
    );
  }
}
var IMF_VINTAGE_FLOWS = {
  "2025-10": "IMF.RES/WEO_2025_OCT_VINTAGE/1.0.0"
};
async function indicatorFromImfVintage(ctx, def, country, edition, flow, codeTemplate, opts) {
  const imfCode = codeTemplate.split(".")[1];
  if (!imfCode) throw new Error(`cannot derive an IMF indicator code from '${codeTemplate}'`);
  const key = `${country.iso3}.${imfCode}.A`;
  const s = await fetchSdmxSeries("IMF", flow, key, { now: ctx.now ? ctx.now() : void 0 });
  if (s.observations.length === 0) {
    throw new Error(`IMF vintage ${flow} returned no observations for ${key}`);
  }
  const [, flowId] = flow.split("/");
  const m = /^WEO_(\d{4})_([A-Z]{3})_VINTAGE$/.exec(flowId ?? "");
  const label = m ? `World Economic Outlook, ${m[2] === "APR" ? "April" : m[2] === "OCT" ? "October" : m[2]} ${m[1]} vintage` : flowId ?? flow;
  const sourceUrl = `https://api.imf.org/external/sdmx/3.0/data/dataflow/${flow}/${key}?format=sdmx-json`;
  return finishSeries(
    {
      series_id: `imf-sdmx/${flowId}/${key}`,
      name: def.label,
      country: { iso3: country.iso3, name: country.name },
      unit: def.unit,
      observations: s.observations,
      citation: sdmxCitation(ctx, {
        provider: "IMF",
        flow: flowId ?? flow,
        key,
        seriesName: `${def.label}, ${country.name}`,
        sourceUrl,
        apiUrl: s.apiUrl,
        datasetLabel: label
      }),
      notes: [
        `Served from the IMF's own dated vintage dataflow (${flowId}) rather than an aggregator, so it reflects the ${edition} edition exactly as the IMF published it.`
      ]
    },
    opts
  );
}
async function getIndicatorAsOf(ctx, key, countryInput, asOfDate, opts = {}) {
  const def = getIndicatorDef(key);
  if (!def) {
    const near = searchIndicatorDefs(key, 8).filter((m) => !isDisabledDef(m.def)).slice(0, 5).map((m) => m.def.key);
    throw new ToolError(
      `Unknown indicator '${key}'.` + (near.length ? ` Closest matches: ${near.join(", ")}.` : ""),
      { input: key, suggestions: near },
      "unknown_indicator"
    );
  }
  if (!def.dbnomics) {
    throw new ToolError(
      `'as_of' is only supported for indicators with a dated IMF WEO edition: ${asOfCapableIndicators().join(", ")}. '${key}' has no dated-vintage source (World Bank does not expose historical editions here).`,
      { indicator: key }
    );
  }
  const country = requireCountry(countryInput);
  const edition = expectedWeoEdition(asOfDate);
  const result = await getIndicatorAtEdition(ctx, def, country, edition, opts);
  const isFmPrimary = key === "govt_revenue_gdp" || key === "govt_expenditure_gdp";
  const wbPrimary = Boolean(def.wb) && !DB_PRIMARY.has(key);
  const sourceInfo = {
    verification_scope: "imf_weo_historical_vintage",
    normal_primary_source: wbPrimary ? "World Bank WDI" : isFmPrimary ? "IMF Fiscal Monitor (via the DataMapper API)" : "IMF WEO (via the DataMapper API)",
    // Name the source that ACTUALLY served — the chain is IMF-first with a
    // DBnomics fallback, and hardcoding "(via DBnomics)" here misattributed
    // provenance whenever the IMF's own vintage dataflow served (observed live
    // 2026-08-10, contradicting the citation in the same response).
    historical_source: result.series_id.startsWith("imf-sdmx/") ? `IMF WEO ${edition} dated edition (first-party, api.imf.org)` : `IMF WEO ${edition} dated edition (via DBnomics)`,
    source_changed_for_as_of: wbPrimary || isFmPrimary
  };
  const dateStr = asOfDate.toISOString().slice(0, 10);
  result.notes.push(
    `Pinned to the WEO:${edition} vintage, resolved conservatively from ${dateStr} using the IMF's April/October publication calendar (month precision, this is historical IMF-vintage verification, not exact release-date resolution). The value reflects that edition and may differ from both earlier vintages and the currently published figure.`
  );
  const month = asOfDate.getUTCMonth() + 1;
  if (month === 4 || month === 10) {
    const inMonthEdition = `${asOfDate.getUTCFullYear()}-${month === 4 ? "04" : "10"}`;
    result.notes.push(
      `The IMF typically publishes the ${month === 4 ? "April" : "October"} WEO edition during that month, so the ${inMonthEdition} edition may already have been available on ${dateStr}; this resolver conservatively selects the previous edition for dates inside a release month. To verify against ${inMonthEdition} explicitly, use get_series with 'dbnomics/IMF/WEO:${inMonthEdition}/\u2026' or an as_of date in the following month.`
    );
  }
  if (sourceInfo.source_changed_for_as_of) {
    result.notes.push(
      `Source note: this indicator's live primary source is ${sourceInfo.normal_primary_source}, but only the IMF WEO archive carries dated historical editions, so this verdict is against ${sourceInfo.historical_source}. A claim originally based on ${sourceInfo.normal_primary_source} can legitimately differ from the WEO edition for methodological reasons, not only because of revisions.`
    );
  }
  return { result, edition, sourceInfo };
}
var DB_PRIMARY = /* @__PURE__ */ new Set(["govt_debt_gdp", "fiscal_balance_gdp", "govt_revenue_gdp", "govt_expenditure_gdp"]);
function wbIsPrimarySource(def) {
  return Boolean(def.wb) && !(def.dbnomics && DB_PRIMARY.has(def.key));
}
var DM_CODE_INFO = /* @__PURE__ */ new Map();
for (const d of INDICATORS) {
  if (d.datamapper) DM_CODE_INFO.set(d.datamapper[0], { dataset: d.datamapper[1], def: d });
}
async function getSeries(ctx, seriesId, opts = {}) {
  assertYearWindow(opts);
  const id = seriesId.trim();
  const lower = id.toLowerCase();
  if (lower.startsWith("worldbank/") || lower.startsWith("wb/")) {
    const code = id.slice(id.indexOf("/") + 1);
    if (hasDotSegment(code)) {
      throw new ToolError(`'${quoteInput(id, 80)}' is not a World Bank series id. Use the form worldbank/CODE, e.g. worldbank/NY.GDP.MKTP.KD.ZG.`, { series_id: quoteInput(id, 200) }, "unknown_indicator");
    }
    if (!opts.country) {
      throw new ToolError("World Bank series require a 'country' parameter (ISO3 code or name).", { series_id: id });
    }
    const country = requireCountry(opts.country);
    const wb = await fetchWbSeries(country.iso3, code, { countryUnverified: country.unverified, checkIndicatorOnRefusal: !country.unverified });
    const citation = worldBankCitation(ctx, {
      indicatorId: wb.indicatorId,
      indicatorName: wb.indicatorName,
      iso3: wb.countryIso3,
      apiUrl: wb.apiUrl,
      lastUpdated: wb.lastUpdated
    });
    const wbDef = Object.values(INDICATORS).find((d) => d.wb === wb.indicatorId);
    return finishSeries(
      {
        series_id: `worldbank/${wb.indicatorId}`,
        name: wb.indicatorName,
        country: { iso3: wb.countryIso3, name: wb.countryName },
        unit: wbDef?.unit ?? null,
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
        { series_id: id },
        "unknown_indicator"
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
  if (lower.startsWith("caribstat/")) {
    if (!CARIBSTAT_ENABLED) {
      throw new ToolError(
        "caribstat series are not served on this deployment.",
        { series_id: id }
      );
    }
    const c = await fetchCaribstatSeries(id);
    const freq = c.doc.frequency ?? inferFrequency(c.doc.periods);
    const resolvedId = c.defaultRow ? `${c.canonicalBase}#${c.defaultRow.selector}` : c.rowSelected ? `${c.canonicalBase}#${c.label}` : c.canonicalBase;
    const caribNotes = [];
    if (c.defaultRow) {
      const shown = c.defaultRow.rows.slice(0, 12);
      caribNotes.push(
        `No row was named, so this is the table's first row, '${c.label}'. The table has ${c.defaultRow.rows.length} rows: ` + shown.join(" | ") + (c.defaultRow.rows.length > shown.length ? " | ..." : "") + `. Add '#Row Label' to the series id to choose one.`
      );
    }
    const citation = caribstatCitation(ctx, {
      source: c.doc.source,
      sourceUrl: c.doc.source_url,
      tableTitle: c.doc.table_title ?? c.doc.sheet,
      rowLabel: c.label,
      countryName: c.doc.country.name,
      frequency: freq,
      dataAsAt: c.doc.data_as_at,
      dataAsAtRaw: c.doc.data_as_at_raw,
      // Only one of these pairs is ever present. ECCB stamps currency; CBB
      // does not and names the publication instead.
      publicationTitle: c.doc.publication_title,
      publishedAt: c.doc.published_at,
      attachmentUrl: c.doc.attachment_url,
      apiUrl: c.apiUrl,
      seriesId: resolvedId
    });
    return finishSeries(
      {
        series_id: resolvedId,
        name: `${c.doc.table_title ?? c.doc.publication_title ?? c.doc.sheet ?? "CaribStat"}: ${c.label}`,
        country: { iso3: c.doc.country.iso3, name: c.doc.country.name },
        unit: c.unit ?? null,
        frequency: freq,
        observations: c.observations,
        citation,
        notes: caribNotes
      },
      opts
    );
  }
  if (lower.startsWith("dbnomics/")) {
    const parts = id.split("/");
    if (hasDotSegment(parts.slice(1).join("/"))) {
      throw new ToolError(`'${quoteInput(id, 80)}' is not a DBnomics series id. Use dbnomics/PROVIDER/DATASET/SERIES, e.g. dbnomics/IMF/WEO:latest/USA.NGDP_RPCH.pcent_change.`, { series_id: quoteInput(id, 200) }, "unknown_indicator");
    }
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
      throw new ToolError(
        ctx.surface === "rest" ? `'${id}' is a registry indicator. Pass a 'country' as well, or call GET /v1/indicator/${id}?country=<ISO3 or name>.` : `'${id}' is a registry indicator. Pass a 'country' as well, or use the get_indicator tool.`
      );
    }
    return getIndicator(ctx, id, opts.country, opts);
  }
  if (lower.startsWith("bis/")) {
    throw new ToolError(
      `'${id}' is a BIS policy-rate series, served through get_indicator rather than get_series. Call get_indicator with indicator 'policy_rate' and the country.`,
      { series_id: id, use_instead: { tool: "get_indicator", indicator: "policy_rate" } }
    );
  }
  if (lower.startsWith("ecb/")) {
    throw new ToolError(
      `'${id}' is an ECB Data Portal series, served through get_indicator rather than get_series. Call get_indicator with indicator 'euro_area_hicp' and country 'euro area'.`,
      { series_id: id, use_instead: { tool: "get_indicator", indicator: "euro_area_hicp" } }
    );
  }
  const hints = [];
  if (/^[A-Z]{2,}(\.[A-Z0-9]+)+$/i.test(id)) hints.push(`Did you mean 'worldbank/${id.toUpperCase()}'?`);
  const near = id.length <= 80 ? searchIndicatorDefs(id.replace(/[^A-Za-z0-9]+/g, " "), 8).filter((m) => !isDisabledDef(m.def)).slice(0, 5).map((m) => m.def.key) : [];
  if (near.length) hints.push(`Registry keys that may match: ${near.join(", ")}.`);
  throw new ToolError(
    `Unrecognized series id '${id}'. Expected 'worldbank/CODE', 'imf/CODE', 'caribstat/BANK/TABLE/SERIES', 'dbnomics/PROVIDER/DATASET/SERIES', or a registry indicator key (${ctx.surface === "rest" ? "list them with GET /v1/indicators" : "see search_indicators"}). 'fred/' ids are recognised but permanently disabled.` + (hints.length ? " " + hints.join(" ") : ""),
    { series_id: id, ...near.length ? { suggestions: near } : {} },
    "unknown_indicator"
  );
}
function isDisabledDef(d) {
  return !d.wb && !d.dbnomics && !d.datamapper && !d.sdmx;
}
var FRED_DISABLED_REASON = "FRED is permanently disabled on this service (FRED's terms of use prohibit AI/ML use and redistribution of its content). This key always declines; use an active World Bank/IMF-backed key instead.";
function isFixedGeographyDef(def) {
  return Boolean(def.sdmx && !def.sdmx.key.includes("{ISO2}"));
}
function countryNamedIn(query) {
  const tokens = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length >= 3);
  for (let n = Math.min(4, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const phrase = tokens.slice(i, i + n).join(" ");
      const c = resolveCountry(phrase);
      if (c && !c.unverified) return c;
    }
  }
  return void 0;
}
var INDICATOR_RESULT_CAP = 8;
async function searchIndicators(ctx, query, opts = {}) {
  const eligible = searchIndicatorDefs(query, Number.MAX_SAFE_INTEGER).filter((m) => {
    if (!isFixedGeographyDef(m.def)) return true;
    const c = countryNamedIn(query);
    if (!c) return true;
    return c.iso3 === "EMU" || c.iso3 === "XM";
  });
  const matches = eligible.slice(0, INDICATOR_RESULT_CAP);
  const truncated = eligible.length > matches.length;
  const items = matches.map((m) => {
    const disabled = isDisabledDef(m.def);
    return {
      type: "indicator",
      id: m.def.key,
      title: m.def.label,
      description: disabled ? `DISABLED, ${m.def.unit}. ${FRED_DISABLED_REASON}` : `${m.def.unit}${m.def.notes ? ` \u2014 ${m.def.notes}` : ""}`,
      url: wbIsPrimarySource(m.def) ? `https://data.worldbank.org/indicator/${m.def.wb}` : void 0,
      usage: disabled ? "Do not call: this key always declines. Search again for an active alternative (e.g. unemployment_rate, inflation_cpi, gdp_growth)." : ctx.surface === "rest" ? `GET /v1/indicator/${m.def.key}?country=<ISO3 or name>` : `get_indicator(indicator="${m.def.key}", country="<ISO3 or name>")`,
      active: !disabled
    };
  });
  if (CARIBSTAT_ENABLED) {
    for (const hit of searchCaribstat(query, 4)) {
      items.push({
        type: "caribstat_series",
        id: hit.id,
        title: `${hit.entry.provider}: ${hit.entry.title}${hit.iso3 ? `, ${hit.iso3}` : ""}`,
        description: `${hit.why}. Regional central bank data, not a registry indicator: values are on the publishing bank's own definitions.`,
        usage: ctx.surface === "rest" ? `GET /v1/series?id=${hit.id}&row=${encodeURIComponent(hit.entry.sampleRow)} (or percent-encode the '#' row selector as %23)` : `get_series(series_id="${hit.id}") \u2014 add '#Row Label' to pick a row, e.g. '#${hit.entry.sampleRow}'`
      });
    }
  }
  for (const g of searchUnctadGap(query)) {
    items.push({
      type: "dbnomics_dataset",
      id: g.id,
      title: `UNCTAD: GDP growth, ${g.name} (1971-2019)`,
      description: `The World Bank and IMF publish no GDP series for ${g.name}. UNCTAD does, annually from 1971, but it ENDS IN 2019, so it is history rather than a current figure.`,
      usage: ctx.surface === "rest" ? `GET /v1/series?id=${g.id}` : `get_series(series_id="${g.id}")`
    });
  }
  if (opts.includeDbnomics !== false && items.length < 5) {
    try {
      const ds = await searchDbnomicsDatasets(query, 4);
      for (const d of ds) {
        items.push({
          type: "dbnomics_dataset",
          id: `dbnomics/${d.providerCode}/${d.datasetCode}`,
          title: `${d.providerName}: ${d.datasetName}`,
          description: `${d.nbSeries.toLocaleString("en-US")} series. Browse, then fetch one with ` + (ctx.surface === "rest" ? `GET /v1/series?id=dbnomics/${d.providerCode}/${d.datasetCode}/SERIES_CODE` : `get_series('dbnomics/${d.providerCode}/${d.datasetCode}/SERIES_CODE')`),
          url: d.url
        });
      }
    } catch {
    }
  }
  return { results: items, total_indicator_matches: eligible.length, truncated };
}
function listRegistry() {
  return INDICATORS.map((d) => {
    const dmLabel = d.datamapper ? "IMF DataMapper API (current WEO/Fiscal Monitor)" : void 0;
    const dbLabel = d.dbnomics ? `${d.dbnomics[0]} ${d.dbnomics[1].replace(":latest", "")} (via DBnomics)` : void 0;
    const wbLabel = d.wb ? "World Bank WDI" : void 0;
    const sdmxLabel = d.sdmx ? d.sdmx.provider === "BIS" ? "BIS statistics" : "ECB Data Portal" : void 0;
    const dbFirst = d.dbnomics && (!d.wb || DB_PRIMARY.has(d.key));
    const imfChain = [...dmLabel ? [dmLabel] : [], ...dbLabel ? [dbLabel] : []];
    const disabled = isDisabledDef(d);
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      sources: [
        ...sdmxLabel ? [sdmxLabel] : [],
        ...dbFirst ? [...imfChain, ...wbLabel ? [wbLabel] : []] : [...wbLabel ? [wbLabel] : [], ...imfChain],
        // For active keys a fred field is INERT (never served); only surface the
        // FRED label on the disabled keys, where it explains why they decline.
        ...disabled ? ["FRED (US), disabled"] : []
      ],
      active: !disabled,
      ...disabled ? { disabled_reason: FRED_DISABLED_REASON } : {},
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
var ECCU_SUPPLEMENT = [
  {
    key: "public_sector_debt_ec",
    label: "Central government debt (ECCB)",
    id: (iso3) => `caribstat/ECCB/total-public-sector-debt/${iso3}.a#Central Government Debt`
  },
  {
    key: "inflation_cpi_eccb",
    label: "Inflation, end of period (ECCB)",
    id: (iso3) => `caribstat/ECCB/consumer-price-index/${iso3}.a#Inflation Rate - end of period`
  },
  {
    key: "govt_revenue_ec",
    label: "Total revenue and grants (ECCB)",
    id: (iso3) => `caribstat/ECCB/central-government-fiscal-accounts/${iso3}.a#Total Revenue and Grants`
  },
  {
    // The one directly comparable to the global govt_debt_gdp concept, and a
    // ratio rather than an EC$ level, so it is readable without knowing the
    // currency or the size of the economy.
    key: "govt_debt_gdp_eccb",
    label: "Central government debt to GDP (ECCB)",
    id: (iso3) => `caribstat/ECCB/debt-to-gdp/${iso3}.a#Central Government Debt to GDP`
  },
  {
    // Tourism is the dominant sector in most of these economies, so a snapshot
    // that omits it describes them poorly however many other rows it carries.
    key: "visitor_arrivals_eccb",
    label: "Total visitor arrivals (ECCB)",
    id: (iso3) => `caribstat/ECCB/selected-tourism-statistics/${iso3}.a#Total Visitor Arrivals`
  }
];
async function countrySnapshot(ctx, countryInput) {
  const country = requireCountry(countryInput);
  const defs = SNAPSHOT_WB_KEYS.map((k) => getIndicatorDef(k));
  const codes = defs.map((d) => d.wb);
  let byCode2 = /* @__PURE__ */ new Map();
  let wbFailed;
  let wbUnreachable = false;
  try {
    byCode2 = await fetchWbMulti(country.iso3, codes, { mrv: 8 });
  } catch (e) {
    wbFailed = e instanceof Error ? e.message : String(e);
    wbUnreachable = isTransientUpstreamError(e);
  }
  const unavailable = [];
  if (wbUnreachable) unavailable.push({ source: "World Bank WDI", reason: cleanReason(wbFailed) });
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
  if (CARIBSTAT_ENABLED && ECCU_ISO3.has(country.iso3)) {
    const settled = await Promise.allSettled(ECCU_SUPPLEMENT.map((spec) => fetchCaribstatSeries(spec.id(country.iso3))));
    for (const [i, spec] of ECCU_SUPPLEMENT.entries()) {
      try {
        const outcome = settled[i];
        if (outcome.status === "rejected") throw outcome.reason;
        const c = outcome.value;
        const latest = latestNonNull(c.observations);
        if (!latest) continue;
        items.push({
          indicator: spec.key,
          label: spec.label,
          period: latest.period,
          value: latest.value,
          unit: c.unit ?? "",
          citation: caribstatCitation(ctx, {
            source: c.doc.source,
            sourceUrl: c.doc.source_url,
            tableTitle: c.doc.table_title ?? c.doc.sheet,
            rowLabel: c.label,
            countryName: c.doc.country.name,
            frequency: c.doc.frequency ?? "a",
            dataAsAt: c.doc.data_as_at,
            dataAsAtRaw: c.doc.data_as_at_raw,
            publicationTitle: c.doc.publication_title,
            publishedAt: c.doc.published_at,
            attachmentUrl: c.doc.attachment_url,
            apiUrl: c.apiUrl,
            seriesId: spec.id(country.iso3)
          })
        });
      } catch (e) {
        missing.push(spec.key);
        if (isTransientUpstreamError(e)) {
          unavailable.push({ source: "Eastern Caribbean Central Bank (CaribStat)", reason: cleanReason(e?.message) });
        }
      }
    }
    if (items.length) {
      if (byCode2.size === 0 && !wbUnreachable) {
        notes.push(
          "The World Bank publishes none of its headline indicators for this economy, so everything here comes from the regional central bank."
        );
      } else if (wbUnreachable) {
        notes.push(
          "The World Bank could not be reached for this request, so its headline indicators are absent from this snapshot rather than unpublished. Retrying may return a fuller snapshot."
        );
      }
      notes.push(
        "Items marked (ECCB) come from the Eastern Caribbean Central Bank, not the World Bank. They are stated in EC$ and on the ECCB's own definitions, so they are not interchangeable with the World Bank series above."
      );
    }
  }
  if (items.length === 0) {
    const territory = integratedTerritoryNote(country.iso3, countryName);
    const t = INTEGRATED_TERRITORIES[country.iso3];
    if (!territory && unavailable.length) {
      throw new ToolError(
        `Could not build a snapshot for ${countryName}: ${unavailable.map((u) => u.source).join(", ")} could not be reached. This is an upstream outage, not a statement that ${countryName} publishes no data. Retrying shortly may succeed.`,
        { country: country.iso3, sources: unavailable },
        "upstream_unavailable"
      );
    }
    const label = countryInput.trim().toUpperCase() === country.iso3 ? `'${country.iso3}'` : `'${countryInput}' (${country.iso3})`;
    throw new ToolError(
      territory ?? `No snapshot data available for ${label}.`,
      {
        country: country.iso3,
        ...t ? {
          no_published_data: true,
          reported_under: t.parentIso3,
          publisher: t.publisher,
          publisher_url: t.publisherUrl
        } : {}
      }
    );
  }
  return {
    country: { iso3: country.iso3, name: countryName },
    as_of: new Date(ctx.now ? ctx.now() : /* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    indicators: items,
    missing,
    notes,
    ...fallbackIndicators.length ? { fallback_used: true, fallback_indicators: fallbackIndicators } : {},
    ...unavailable.length ? { sources_unavailable: unavailable } : {}
  };
}

// ../server/src/core/inflation.ts
async function inflationAdjust(ctx, amount, fromYear, toYear, countryInput = "USA") {
  if (!Number.isFinite(amount)) throw new ToolError("'amount' must be a number.");
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) {
    throw new ToolError("'from_year' and 'to_year' must be integer years, e.g. 1995 and 2025.");
  }
  const country = requireCountry(countryInput);
  const wb = await fetchWbSeries(country.iso3, "FP.CPI.TOTL", { countryUnverified: country.unverified });
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
    "CPI measures consumer prices. For comparing incomes or output across years, a GDP deflator may be more appropriate."
  ];
  if (country.iso3 === "USA") {
    notes.push("This calculation uses World Bank annual-average CPI; US monthly-frequency CPI (FRED's CPIAUCSL) is not available. FRED is permanently disabled on this deployment per its terms of use.");
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
      indicatorName: `${wb.indicatorName}, ${wb.countryName}`,
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
  if (date && date.length === 10) {
    const [y, m, d] = date.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
      throw new ToolError(`'date' ${date} is not a real calendar date. Use YYYY-MM-DD or YYYY.`, { date });
    }
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
  const legs = [];
  const wbYear = yearOnly ?? (dayDate ? parseInt(dayDate.slice(0, 4), 10) : void 0);
  async function usdPerUnit(cur) {
    if (cur === "USD") {
      legs.push({ currency: "USD", usd_per_unit: 1, period: null, source: "identity (USD bridge base)" });
      return 1;
    }
    if (ecbSet.has(cur) && !yearOnly) {
      const r = await getEcbRates(cur, ["USD"], dayDate);
      citations.push(ecbFxCitation(ctx, { base: cur, quote: "USD", rateDate: r.date, apiUrl: r.apiUrl }));
      rateDate = rateDate || r.date;
      legs.push({ currency: cur, usd_per_unit: r.rates.USD, period: r.date, source: "ECB daily reference rate" });
      return r.rates.USD;
    }
    const wb = await wbUsdPerUnit(ctx, cur, wbYear);
    if (wb.citation) citations.push(wb.citation);
    if (dayDate) {
      notes.push(
        `Requested ${dayDate}; daily precision is unavailable for ${cur}. Used the ${wb.period} annual-average official rate (World Bank PA.NUS.FCRF).`
      );
    }
    rateDate = rateDate || wb.period;
    legs.push({ currency: cur, usd_per_unit: wb.usdPerUnit, period: wb.period, source: "World Bank PA.NUS.FCRF annual average" });
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
  if (precision === "mixed") notes.push("Mixed precision: one leg is a daily ECB rate, the other an annual average, treat the result as approximate.");
  const dated = legs.filter((l) => typeof l.period === "string");
  if (new Set(dated.map((l) => l.period.slice(0, 4))).size > 1) {
    const stalest = dated.reduce((a, b) => a.period <= b.period ? a : b);
    rateDate = stalest.period;
    notes.push(
      `Leg periods differ: ${dated.map((l) => `${l.currency} ${l.period}`).join(", ")}. A cross rate is only as current as its stalest leg, so rate_date is ${stalest.period}: ${stalest.currency} has no official rate published after ${stalest.period.slice(0, 4)}. Treat the result as a ${stalest.period.slice(0, 4)} rate, not a current one.`
    );
  }
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
    notes,
    legs
  };
}

// ../server/src/core/verify.ts
function parseAsOfDate(input) {
  const s = input.trim();
  const reject = () => {
    throw new ToolError(
      `'as_of' should be a real calendar date like '2019-04', '2019-04-15', or a bare year '2019', got '${input}'.`,
      { as_of: input }
    );
  };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) reject();
    return date;
  }
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const [y, mo] = [+m[1], +m[2]];
    if (mo < 1 || mo > 12) reject();
    return new Date(Date.UTC(y, mo - 1, 1));
  }
  m = /^(\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], 11, 31));
  return reject();
}
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
  if (p.as_of && !isRegistry) {
    throw new ToolError(
      `'as_of' only applies to registry indicator keys (see search_indicators). For an explicit series id, address the dated edition directly, e.g. 'dbnomics/IMF/WEO:2019-04/${p.country ?? "USA"}.NGDP_RPCH.pcent_change'.`,
      { indicator: p.indicator }
    );
  }
  let asOfResolved;
  const resolveSeries = async () => p.as_of ? await (async () => {
    const asOfDate = parseAsOfDate(p.as_of);
    const { result: r, edition, sourceInfo } = await getIndicatorAsOf(ctx, p.indicator, p.country ?? "", asOfDate, {
      strictSource: p.strict_source
    });
    asOfResolved = {
      requested: p.as_of,
      resolved_vintage: edition,
      resolution: "conservative_month_calendar",
      verification_scope: sourceInfo.verification_scope,
      normal_primary_source: sourceInfo.normal_primary_source,
      source_changed_for_as_of: sourceInfo.source_changed_for_as_of
    };
    return r;
  })() : isRegistry ? await getIndicator(ctx, p.indicator, p.country ?? "", { strictSource: p.strict_source }) : await getSeries(ctx, p.indicator, { country: p.country, strictSource: p.strict_source });
  let result;
  try {
    result = await resolveSeries();
  } catch (e) {
    const details = e instanceof ToolError ? e.details : void 0;
    const related = Array.isArray(details?.related_series) ? details.related_series : [];
    if (p.as_of || !(e instanceof ToolError) || details?.no_published_data !== true || related.length === 0) throw e;
    return await verifyAgainstRelated(ctx, p, e, related, details, period, year);
  }
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
    asOfResolved ? `Historical-vintage verification: the official value reflects the IMF WEO ${asOfResolved.resolved_vintage} edition, which may differ from both earlier vintages and the source's currently published figure.` : "Macro data is revised: the official value reflects the source's current published figure, which may differ from what was published at the time of the claim."
  );
  const percentKind = isRegistry ? isPercentKind(p.indicator) : /%|percent|pcent/i.test([result.unit, result.series_id, result.name].filter(Boolean).join(" "));
  const imfHeuristicSeries = /^imf\//.test(result.series_id) || /^dbnomics\/IMF\/(WEO|FM):/i.test(result.series_id);
  const statusMethod = imfHeuristicSeries ? "horizon_heuristic" : "as_published";
  if (!matched) {
    const near = obs.filter((o) => Math.abs(parseInt(o.period.slice(0, 4), 10) - year) <= 2 && o.value != null).slice(-6);
    const range = obs.length ? `${obs[0].period}\u2013${obs[obs.length - 1].period}` : "none";
    const freqHint = obs.some((o) => o.period.length > 4) && period.length === 4 ? " This series is higher-frequency, specify the period as YYYY-MM." : "";
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
      series: { id: result.series_id, name: result.name, unit: result.unit ?? void 0 },
      country: result.country,
      citation: result.citation,
      notes,
      ...result.fallback_used ? { fallback_used: true } : {},
      ...asOfResolved ? { as_of: asOfResolved } : {}
    };
  }
  const official = matched.value;
  const isProjection = /WEO|Fiscal Monitor/i.test(matched.note ?? "") && /estimate|projection/i.test(matched.note ?? "");
  const registryDef = isRegistry ? getIndicatorDef(p.indicator) : void 0;
  const observationStatus = imfHeuristicSeries ? isProjection ? "projection" : "estimate_or_actual" : registryDef?.modeled ? "modeled_estimate" : isRegistry || result.series_id.startsWith("worldbank/") ? "actual" : "unknown";
  const diff = p.claimed_value - official;
  const relPct = official !== 0 ? diff / Math.abs(official) * 100 : null;
  const ratio = official !== 0 ? p.claimed_value / official : null;
  diagnostics.push(...scaleDiagnostics(p.claimed_value, official));
  if (ratio != null && ratio < 0 && within(-ratio, 1, 0.02)) {
    diagnostics.push(
      "The claimed value is approximately the official figure with the opposite sign, possibly a sign-convention mix-up (e.g. a fiscal deficit quoted as positive where the source reports net lending as negative)."
    );
  }
  for (const offset of [-2, -1, 1, 2]) {
    const v = byPeriod.get(String(year + offset))?.value;
    if (v != null && judge(p.claimed_value, v, percentKind, p).verdict === "match" && Math.abs(p.claimed_value - v) < Math.abs(p.claimed_value - official)) {
      diagnostics.push(`The claimed value matches the ${year + offset} figure (${fmt(v)}), the year may be misattributed.`);
    }
  }
  if (isRegistry && result.fallback_used === true && result.fallback_reason !== "definitive") {
    const vintageFlavor = Boolean(registryDef?.datamapper) && result.series_id.startsWith("dbnomics/") ? " IMF vintage revisions (e.g. GDP rebasing) can move WEO/Fiscal Monitor series by more than a percentage point for the same historical year." : " Substitute sources can use different statistical definitions and report materially different values for the same nominal indicator.";
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
      explanation: `This indicator's primary source was transiently unavailable; the fallback (${result.citation.source}, ${result.series_id}) shows ${fmt(official)}${result.unit ? ` ${result.unit}` : ""}${projFlag} for ${period}. Indicative only, not a verification.${vintageFlavor} Retry when the primary source has recovered, or pass strict_source=true to fail hard instead.`,
      diagnostics,
      series: { id: result.series_id, name: result.name, unit: result.unit ?? void 0 },
      country: result.country,
      citation: result.citation,
      notes,
      fallback_used: true,
      ...asOfResolved ? { as_of: asOfResolved } : {}
    };
  }
  const { verdict, why } = judge(p.claimed_value, official, percentKind, p);
  let revisionCheck;
  if (verdict === "mismatch" && isRegistry && !p.as_of && !p.strict_source) {
    const def = getIndicatorDef(p.indicator);
    if (def?.dbnomics && p.country) {
      const nowDate = ctx.now ? ctx.now() : /* @__PURE__ */ new Date();
      const prevEdition = previousWeoEdition(expectedWeoEdition(nowDate));
      const nextLabel = nextExpectedWeoEditionLabel(nowDate);
      try {
        const prev = await getIndicatorAtEdition(ctx, def, requireCountry(p.country), prevEdition, {
          start: String(year - 1),
          end: String(year + 1)
        });
        const prevObs = prev.observations.find((o) => o.period === period && o.value != null);
        const prevValue = prevObs ? prevObs.value : null;
        const matches = prevValue != null && judge(p.claimed_value, prevValue, percentKind, p).verdict !== "mismatch";
        revisionCheck = {
          status: "checked",
          previous_edition: `WEO ${prevEdition}`,
          previous_value: prevValue,
          matches_previous_vintage: matches,
          next_edition_expected: nextLabel,
          note: matches ? `The claimed value matches the previous IMF vintage (WEO ${prevEdition}: ${prevValue}). The figure was likely accurate when written and has since been revised. Treat this as a revision event, not necessarily an author error. Cite the current official value going forward.` : `The claim does not match the previous IMF vintage either (WEO ${prevEdition}: ${prevValue ?? "no value for this period"}).`
        };
        if (matches) diagnostics.push(revisionCheck.note);
      } catch {
        revisionCheck = {
          status: "unavailable",
          previous_edition: `WEO ${prevEdition}`,
          next_edition_expected: nextLabel,
          note: "The previous WEO edition could not be retrieved right now, so no revision judgment is offered."
        };
      }
    }
  }
  const unitText = result.unit ? ` ${result.unit}` : "";
  const projKind = /Fiscal Monitor/i.test(matched.note ?? "") ? "IMF Fiscal Monitor" : "IMF WEO";
  const officialLabel = isProjection ? `official (${projKind} projection)` : "official";
  const explanation = verdict === "match" ? `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period}, consistent (${why}).` : verdict === "close" ? `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period}. In the right neighborhood but not exact (${why}). Cite the official value.` : `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period}, materially different (${why}).` + (diagnostics.length ? " See diagnostics for likely causes." : "");
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
    series: { id: result.series_id, name: result.name, unit: result.unit ?? void 0 },
    country: result.country,
    citation: result.citation,
    notes,
    ...revisionCheck ? { revision_check: revisionCheck } : {},
    ...result.fallback_used ? { fallback_used: true } : {},
    ...asOfResolved ? { as_of: asOfResolved } : {}
  };
}
function decimalsOf(x) {
  const s = String(Math.abs(x));
  if (/e/i.test(s)) return null;
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}
function sigDigitsOf(x) {
  const s = String(Math.abs(x)).replace(/e.*$/i, "").replace(".", "").replace(/^0+/, "");
  return s.length;
}
function scaleDiagnostics(claimed, official) {
  const out = [];
  if (official === 0) return out;
  const ratio = claimed / official;
  if (!(ratio > 0)) return out;
  const d = decimalsOf(claimed);
  const roundsTo = (v) => {
    if (d == null || d > 12 || sigDigitsOf(claimed) < 2) return false;
    const m = 10 ** d;
    const r = Math.round((Math.abs(v) + 1e-12) * m) / m;
    return Math.abs(r - Math.abs(claimed)) <= Math.abs(claimed) * 1e-9;
  };
  for (const [factor, label] of [
    [100, "a percent-vs-decimal mix-up (e.g. 0.05 vs 5%)"],
    [1e3, "a thousands scaling difference"],
    [1e6, "a millions scaling difference"],
    [1e9, "a billions scaling difference"],
    [1e12, "a trillions scaling difference"]
  ]) {
    const larger = within(ratio, factor, 0.02) || roundsTo(official * factor);
    const smaller = within(ratio, 1 / factor, 0.02) || roundsTo(official / factor);
    if (larger || smaller) {
      out.push(`The claimed value is ~${factor.toLocaleString("en-US")}\xD7 ${larger ? "larger" : "smaller"} than the official figure, possibly ${label}.`);
    }
  }
  return out;
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
async function verifyAgainstRelated(ctx, p, absence, related, details, period, year) {
  const settled = await Promise.allSettled(related.map((r) => getSeries(ctx, r.id)));
  const resolved = settled.map((s, i) => s.status === "fulfilled" ? { spec: related[i], series: s.value } : void 0).filter((x) => !!x);
  if (resolved.length === 0) throw absence;
  const definition = typeof details?.definition_note === "string" ? details.definition_note : void 0;
  const diagnostics = [];
  for (const { spec, series } of resolved) {
    const hit = series.observations.find((o) => o.period === period || o.period === String(year));
    if (hit?.value == null) continue;
    const verdict = judge(p.claimed_value, hit.value, true, p).verdict;
    const relation = verdict === "match" ? "is the same figure to rounding" : verdict === "close" ? "is close to it" : "differs from it";
    diagnostics.push(
      `${spec.label} for ${hit.period} is ${hit.value}${series.unit ? ` ${series.unit}` : ""}, which ${relation}. Different measure, shown for orientation only.`
    );
  }
  const first = resolved[0].series;
  const country = typeof details?.country === "string" ? details.country : p.country;
  return {
    verdict: "cannot_verify",
    claimed_value: p.claimed_value,
    official_value: null,
    is_projection: false,
    observation_status: "unknown",
    status_method: "as_published",
    period,
    difference: null,
    relative_difference_pct: null,
    explanation: `This is not a verification of ${p.indicator} for ${first.country?.name ?? country ?? "this economy"}. No source StatCite uses publishes that series for this economy.` + (definition ? ` ${definition}` : "") + " The related central bank figures below are a different measure, shown for orientation only.",
    diagnostics,
    series: { id: first.series_id, name: first.name, unit: first.unit },
    ...first.country ? { country: first.country } : {},
    citation: first.citation,
    notes: [
      "No verdict was reached: the claimed indicator is not published for this economy by any source StatCite serves.",
      ...first.notes
    ],
    not_verified_because: "no_published_data",
    related_series: related,
    ...typeof details?.publisher === "string" ? { publisher: details.publisher } : {}
  };
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
      if (claimed !== 0 && official !== 0 && Math.sign(claimed) !== Math.sign(official)) {
        return {
          verdict: "close",
          why: `the magnitudes agree to ${absDiff.toFixed(3)} pp but the signs disagree: claimed a ${claimed > 0 ? "positive" : "negative"} figure where the official value is ${official > 0 ? "positive" : "negative"}`
        };
      }
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
    name: "World Bank, World Development Indicators",
    coverage: "~1,400 annual indicators, 200+ economies, many from 1960",
    access: "No key; queried live from api.worldbank.org v2",
    license: "CC BY 4.0",
    license_verdict: "served",
    license_note: "Summary Terms of Use license datasets under CC BY 4.0: free to copy, distribute, adapt and build upon, including commercially, with attribution.",
    license_verified_on: "2026-08-07",
    attribution_required: "The World Bank: World Development Indicators: <series name>",
    url: "https://data.worldbank.org",
    terms_url: "https://data.worldbank.org/summary-terms-of-use"
  },
  {
    id: "imf_weo",
    name: "IMF, World Economic Outlook & Fiscal Monitor (via the IMF DataMapper API, with DBnomics as fallback)",
    coverage: "Growth, fiscal and external indicators for 190+ economies, including estimates and projections, in twice-yearly vintages (April and October, plus interim Updates). The primary path is the IMF's own DataMapper API, which serves the current edition and passes its edition label through verbatim. If that path is unavailable, StatCite falls back to the newest edition DBnomics has ingested, which can lag the IMF's release calendar. Every response cites the resolved vintage, and a fallback that crosses editions is disclosed (verify_stat demotes such cases to cannot_verify rather than judging a claim against a superseded vintage). The actual/projection boundary is a heuristic derived from each response's own data horizon, not a per-country authoritative cutoff",
    access: "No key; queried live from www.imf.org/external/datamapper (primary) and api.db.nomics.world v22 (fallback)",
    license: IMF_LICENSE,
    license_verdict: "served",
    license_note: `The IMF's SPECIAL TERMS for published statistical data (effective 2024-10-11) expressly permit copying, redistribution, derivative works and use with attribution. They form a separate regime, more permissive than the general IMF Content terms, and open with "Notwithstanding the general prohibition on the commercial use of IMF Content...". Named datasets include the WEO database, IFS, BOP, DOT, GFS, Primary Commodity Prices and data on the iData Portal. StatCite must attribute data in the IMF's format (database and link). It must never alter data in ways affecting accuracy, and must declare any material transformation. It must communicate these terms downstream to its own users, which it does through this ledger, /v1/sources and the licence field on every citation. Where data is sold as a standalone product, it must tell purchasers the data is free from the IMF, which the Apify actor listing does. Corrected 2026-08-10: the previous note claimed commercial reuse 'may require IMF permission', which conflated the Content regime with the Data regime and both understated the permission and overstated the restriction.`,
    license_verified_on: "2026-08-10",
    attribution_required: "Source: International Monetary Fund, <database name>, <link to the dataset>",
    url: "https://www.imf.org/en/Publications/WEO",
    terms_url: "https://www.imf.org/en/About/copyright-and-terms"
  },
  {
    id: "imf_sdmx_vintage",
    name: "IMF, dated World Economic Outlook vintages (api.imf.org, SDMX 3.0)",
    coverage: "Frozen dated WEO editions published as first-party SDMX 3.0 dataflows. StatCite uses them ONLY on the dated-vintage path (as_of verification and the revision probe), never in the live chain, and only for editions enumerated in IMF_VINTAGE_FLOWS from the live dataflow listing. The IMF exposes a small number of recent vintages, not an archive. DBnomics remains the deep historical fallback back to 2010-04, so this source narrows the newest-edition gap rather than replacing the aggregator",
    access: "No key and no account; api.imf.org serves this data anonymously (verified 2026-08-10). The sign-in wall on portal.api.imf.org guards the developer console, not the data. Rate limits are undocumented outside that console and no RateLimit/Retry-After headers are returned; a 31-request unpaced burst was accepted without throttling (2026-08-10), which establishes headroom rather than an absence of limits. StatCite issues one upstream call per as_of/revision-probe lookup, cached one hour",
    license: IMF_LICENSE,
    license_verdict: "served",
    license_note: "This source is governed by the same IMF special terms for statistical data as imf_weo. The WEO database is named in them explicitly, and the delivery endpoint does not change the licence on the data. The api.imf.org service itself imposes no additional terms on anonymous use: the API-management terms sit behind the portal sign-in and govern subscription keys, which StatCite does not hold and does not need. This was verified by a direct anonymous call on 2026-08-10.",
    license_verified_on: "2026-08-10",
    attribution_required: "Source: International Monetary Fund, <database name>, <link to the dataset>",
    url: "https://data.imf.org/",
    terms_url: "https://www.imf.org/en/About/copyright-and-terms"
  },
  {
    id: "ecb_fx",
    name: "European Central Bank, euro foreign exchange reference rates (via Frankfurter)",
    coverage: "~30 major currencies, daily since 1999",
    access: "No key; queried live from api.frankfurter.dev",
    license: "Published for information purposes; reuse with attribution; not transaction rates",
    license_verdict: "served",
    license_note: "ECB disclaimer permits reproduction with source attribution; the reference rates are explicitly informational, and StatCite labels them as reference (not transaction) rates.",
    license_verified_on: "2026-07-25",
    attribution_required: "Source: European Central Bank euro foreign exchange reference rates",
    url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    terms_url: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html"
  },
  {
    id: "dbnomics",
    name: "DBnomics (aggregator)",
    coverage: "Tens of millions of series from 90+ official providers (IMF, OECD, Eurostat, ECB, BIS, national statistical offices)",
    access: "No key; open aggregator, upstream provider licenses flow through",
    license: "Per underlying provider",
    license_verdict: "flow_through",
    license_note: "Aggregator: each served series inherits its underlying provider's licence, and the citation object names that provider. The CURATED registry routes only IMF series through DBnomics. The raw get_series escape hatch (dbnomics/PROVIDER/... ids) passes any DBnomics-hosted provider through on flow-through terms: the citation names the provider and states that its terms apply, and StatCite has NOT individually verified every provider's licence. Consumers of non-IMF dbnomics/ series must check the named provider's own terms before republishing. Corrected 2026-08-10: the previous note claimed only permitted providers were routed, which was true of the registry but overstated the raw-id path.",
    license_verified_on: "2026-07-25",
    attribution_required: "Cite the underlying provider (StatCite citations do this automatically)",
    url: "https://db.nomics.world",
    terms_url: "https://docs.db.nomics.world/"
  },
  {
    id: "bis",
    name: "Bank for International Settlements, central bank policy rates",
    coverage: "Policy rates for 49 economies (the rate that best captures each monetary authority's policy stance), monthly and daily, via the BIS SDMX API",
    access: "No key; queried live from stats.bis.org/api/v2 (SDMX-JSON via Accept header)",
    license: "BIS statistics may be reproduced and redistributed with attribution; see the BIS terms and conditions for statistics",
    license_verdict: "served",
    license_note: "The BIS terms for statistics permit reproduction and redistribution with attribution to the BIS. StatCite charges for the audit/convenience layer, never for BIS data standalone, and attributes the BIS on every response.",
    license_verified_on: "2026-08-08",
    attribution_required: "Source: Bank for International Settlements",
    url: "https://data.bis.org/topics/CBPOL",
    terms_url: "https://www.bis.org/terms_statistics.htm"
  },
  {
    id: "ecb_data",
    name: "European Central Bank, Data Portal (euro-area monetary statistics)",
    coverage: "Euro-area harmonised inflation (HICP) and related monetary series via the ECB Data Portal SDMX API",
    access: "No key; queried live from data-api.ecb.europa.eu (SDMX-JSON)",
    license: "ECB content may be reproduced with attribution; see the ECB disclaimer and copyright notice",
    license_verdict: "served",
    license_note: "The ECB's copyright notice permits reproduction of its published content with attribution to the ECB as source. This entry is distinct from ecb_fx, which covers the euro reference exchange rates served via Frankfurter.",
    license_verified_on: "2026-08-08",
    attribution_required: "Source: European Central Bank",
    url: "https://data.ecb.europa.eu",
    terms_url: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html"
  },
  // ------------------------------------------------------------------
  // REFUSED sources — evaluated, declined, and disclosed. These entries
  // exist so the refusal reasoning is public and machine-readable, and so
  // no future session re-litigates them without new terms to point at.
  // ------------------------------------------------------------------
  {
    id: "fred",
    name: "Federal Reserve Bank of St. Louis, FRED (permanently disabled)",
    coverage: "Not served. The FRED Services Terms of Use, clauses (p) and (q), reserve FRED content from use in connection with training or running AI/ML/LLM systems, and from storing, caching or archiving it.",
    access: "FRED is disabled. The six US-only registry keys and the fred/ series id are recognised but always decline.",
    license: "FRED Services Terms of Use, clauses (p) and (q), see https://fred.stlouisfed.org/legal/",
    license_verdict: "refused",
    license_note: "Clauses (p) and (q) of the FRED Services Terms of Use reserve FRED content from AI/ML/LLM-connected use and from storing, caching or archiving it. StatCite does not offer FRED, with or without an operator key: the six US-only registry keys and the fred/ series id are recognised and always decline, naming the reason.",
    license_verified_on: "2026-07-26",
    attribution_required: "Not applicable, no FRED content is served.",
    url: "https://fred.stlouisfed.org",
    terms_url: "https://fred.stlouisfed.org/legal/"
  },
  {
    id: "un_comtrade",
    name: "UN Comtrade (trade statistics), not served",
    coverage: "Not served. UN Comtrade's policy on use and re-dissemination requires an active premium subscription to re-disseminate its data, and licenses for-profit extraction or streaming applications for a fee.",
    access: "Not integrated; evaluated and declined",
    license: "UN Comtrade policy on use and re-dissemination",
    license_verdict: "refused",
    license_note: 'The policy states "To re-disseminate UN Comtrade data, a user must be an active premium subscriber" and prices "for-profit data extraction and/or streaming application[s]" under a licensing fee. StatCite offers a metered surface on Apify, which places it within that fee-bearing category.',
    license_verified_on: "2026-08-08",
    attribution_required: "Not applicable, no UN Comtrade content is served.",
    url: "https://comtradeplus.un.org",
    terms_url: "https://uncomtrade.org/docs/policy-on-use-and-re-dissemination/"
  },
  {
    id: "eccb",
    name: "Eastern Caribbean Central Bank statistics",
    coverage: "ECCU monetary, fiscal, debt, tourism, interest-rate and CPI statistics for the eight ECCB member geographies and the currency union aggregate, annual, quarterly and monthly. It includes Anguilla and Montserrat, which are not World Bank reporting economies and appear in few other machine-readable sources. The figures are collected on a schedule from the ECCB's published tables and served with the bank's own data-as-at stamp, carried separately from our retrieval time.",
    access: "Scheduled collection to static JSON at github.com/asokore/caribstat, fetched and edge-cached like any other upstream",
    license: "ECCB website terms of use, plus written permission granted to the operator",
    license_verdict: "served",
    license_note: "The ECCB's published website terms grant use of the site for personal, non-commercial purposes and reserve reproduction and redistribution unless permission is given. The operator wrote to the ECCB describing exactly this service, including scheduled fetching, storage, and serving each value with attribution and a link back to the source table, and permission was granted. This entry was recorded on the operator's confirmation of 2026-08-14. The correspondence itself is held privately rather than published, so the entry states its basis rather than quoting it. The request that was granted is public at github.com/asokore/statcite in caribstat/outreach/.",
    license_verified_on: "2026-08-14",
    attribution_required: `Eastern Caribbean Central Bank, with a link to the source table. Every served value carries both, and the bank's own "data as at" stamp.`,
    url: "https://www.eccb-centralbank.org",
    terms_url: "https://www.eccb-centralbank.org"
  },
  {
    id: "cbb",
    name: "Central Bank of Barbados statistics",
    coverage: `Barbados balance of payments back to 1967, GDP, inflation and retail prices, tourism, and the monetary survey, from the Bank's published workbooks. The Bank prints no "data as at" stamp, so every value instead names the publication it came from and links that workbook directly, which is a narrower claim than a currency stamp and one a reader can check.`,
    access: "Scheduled collection to static JSON at github.com/asokore/caribstat, fetched and edge-cached like any other upstream",
    license: "Central Bank of Barbados website terms of use, plus written permission granted to the operator",
    license_verdict: "served",
    license_note: "The Bank's published website terms reserve reproduction and redistribution of site content unless permission is given, and the operator requested and obtained that permission. This entry was recorded on the operator's confirmation of 2026-08-14. The request that was granted is public at github.com/asokore/statcite in caribstat/outreach/. The Bank publishes no currency stamp, so citations name the source publication and its date rather than asserting how current the Bank considers a figure.",
    license_verified_on: "2026-08-14",
    attribution_required: "Central Bank of Barbados, with a link to the source publication. Every served value carries both, and the publication date.",
    url: "https://www.centralbank.org.bb",
    terms_url: "https://www.centralbank.org.bb"
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
  parseTransform,
  searchIndicators,
  verifyStat
};
