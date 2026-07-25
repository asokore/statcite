// Country / economy resolver: ISO2, ISO3, names, and common aliases.
// The World Bank API accepts ISO2 or ISO3 codes; we resolve free-text names to codes
// and pass unknown 2/3-letter codes through (the upstream validates them).

export interface Country {
  iso3: string;
  iso2: string;
  name: string;
  aggregate?: boolean;
}

type Row = [string, string, string, ...string[]]; // iso3, iso2, name, aliases

const ROWS: Row[] = [
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
  ["CIV", "CI", "Cote d'Ivoire", "ivory coast", "côte d'ivoire"],
  ["HRV", "HR", "Croatia"],
  ["CUB", "CU", "Cuba"],
  ["CUW", "CW", "Curacao", "curaçao"],
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
  ["STP", "ST", "Sao Tome and Principe", "são tomé and príncipe"],
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
  ["TUR", "TR", "Turkiye", "turkey", "türkiye"],
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
  ["ZWE", "ZW", "Zimbabwe"],
];

const AGGREGATES: Row[] = [
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
  ["SAS", "8S", "South Asia"],
];

export const COUNTRIES: Country[] = [
  ...ROWS.map(([iso3, iso2, name]) => ({ iso3, iso2, name })),
  ...AGGREGATES.map(([iso3, iso2, name]) => ({ iso3, iso2, name, aggregate: true })),
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const byCode = new Map<string, Country>();
const byName = new Map<string, Country>();
for (const rows of [ROWS, AGGREGATES]) {
  const aggregate = rows === AGGREGATES;
  for (const [iso3, iso2, name, ...aliases] of rows) {
    const c: Country = aggregate ? { iso3, iso2, name, aggregate: true } : { iso3, iso2, name };
    byCode.set(iso3, c);
    byCode.set(iso2, c);
    byName.set(norm(name), c);
    // Name without parenthetical / comma qualifiers: "Korea, Rep." -> "korea rep", "Iran, Islamic Rep." etc.
    const short = norm(name.split(",")[0].split("(")[0]);
    if (short && !byName.has(short)) byName.set(short, c);
    for (const a of aliases) byName.set(norm(a), c);
  }
}

// Precomputed normalized names (avoids re-normalizing 230+ names per lookup).
const NORM_NAMES: Array<{ c: Country; n: string }> = COUNTRIES.map((c) => ({ c, n: norm(c.name) }));

/**
 * Resolve free text or a code to a country. Returns null when unknown.
 * strict mode (used by free-text search): no unknown-code pass-through, and
 * code matching only for inputs the caller supplied in UPPERCASE — so English
 * words like "in", "was", "gdp" never resolve to India/WAS/GDP.
 */
export function resolveCountry(input: string, opts: { strict?: boolean } = {}): Country | null {
  const raw = input.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const codeAllowed = !opts.strict || raw === upper;
  if (codeAllowed && /^[A-Z0-9]{2,3}$/.test(upper) && byCode.has(upper)) return byCode.get(upper)!;
  const n = norm(raw);
  if (byName.has(n)) return byName.get(n)!;
  // Unambiguous substring match ("republic of ireland" -> ireland).
  if (n.length >= 4) {
    const hits = NORM_NAMES.filter(({ n: cn }) => cn.includes(n) || n.includes(cn));
    if (hits.length === 1) return hits[0].c;
  }
  // Pass through plausible ISO codes the map may not know — the upstream validates.
  if (!opts.strict && /^[A-Z]{3}$/.test(upper)) return { iso3: upper, iso2: upper.slice(0, 2), name: upper };
  return null;
}

/** Suggestions for error messages when a country string fails to resolve. */
export function suggestCountries(input: string, limit = 5): string[] {
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
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((x) => `${x.c.name} (${x.c.iso3})`);
}
