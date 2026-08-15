// Country / economy resolver: ISO2, ISO3, names, and common aliases.
// The World Bank API accepts ISO2 or ISO3 codes; we resolve free-text names to codes
// and pass unknown 2/3-letter codes through (the upstream validates them).

export interface Country {
  iso3: string;
  iso2: string;
  name: string;
  aggregate?: boolean;
  /**
   * True when this was NOT matched against the known-economy table and is only
   * a syntactically plausible three-letter code passed through for the upstream
   * to adjudicate. Downstream code must not describe such a code as an economy:
   * saying "the World Bank does not publish GDP growth for XYZ, some economies
   * are not reporting economies" asserts a coverage fact about a country that
   * does not exist, which is precisely the fabrication this service exists to
   * prevent.
   */
  unverified?: boolean;
}

/**
 * Economies that are constitutionally part of another state and are reported
 * inside that state's national accounts rather than under their own code.
 *
 * WHY THIS EXISTS. A Caribbean coverage check on 2026-08-14 found Guadeloupe
 * and Martinique returning a bare "No snapshot data available", which reads as
 * a lookup failure and invites the caller to retry with a different spelling.
 * The truth is more useful and more final: these are French overseas
 * departments, the World Bank and the IMF carry them inside France, and the
 * department-level figures exist but are published by the national statistical
 * institute. Saying so turns a dead end into a working referral.
 *
 * Every URL below was fetched on 2026-08-14 and confirmed to return that
 * department's own "Dossier complet" page rather than a generic search page.
 * An earlier candidate URL (insee.fr/fr/statistiques?geo=REG-nn) returned an
 * identical byte-for-byte page for four different regions, because the filter
 * is applied in the browser, so it was rejected.
 */
export interface IntegratedTerritory {
  parentIso3: string;
  parentName: string;
  publisher: string;
  publisherUrl: string;
}

const INSEE = (dep: string): Omit<IntegratedTerritory, "parentIso3" | "parentName"> => ({
  publisher: "INSEE, the French national statistical institute",
  publisherUrl: `https://www.insee.fr/fr/statistiques/2011101?geo=DEP-${dep}`,
});
const FRANCE = { parentIso3: "FRA", parentName: "France" };

export const INTEGRATED_TERRITORIES: Record<string, IntegratedTerritory> = {
  GLP: { ...FRANCE, ...INSEE("971") },
  MTQ: { ...FRANCE, ...INSEE("972") },
  GUF: { ...FRANCE, ...INSEE("973") },
  REU: { ...FRANCE, ...INSEE("974") },
  MYT: { ...FRANCE, ...INSEE("976") },
};

/**
 * One sentence explaining why an international source holds nothing for this
 * code, and where the figures actually live. Returns undefined for everywhere
 * else, so callers can append it without knowing the special cases.
 */
export function integratedTerritoryNote(iso3: string, name: string): string | undefined {
  const t = INTEGRATED_TERRITORIES[iso3.toUpperCase()];
  if (!t) return undefined;
  return (
    `${name} is an overseas department of ${t.parentName}, so the international ` +
    `sources this service draws on report it inside ${t.parentName} rather than as a ` +
    `separate economy. This is a coverage fact, not a lookup failure. Figures for ` +
    `${name} itself are published by ${t.publisher}, at ${t.publisherUrl}. ` +
    `A snapshot for the parent state is available with country="${t.parentName}".`
  );
}

type Row = [string, string, string, ...string[]]; // iso3, iso2, name, aliases

const ROWS: Row[] = [
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
  ["REU", "RE", "Reunion", "réunion"],
  ["GLP", "GP", "Guadeloupe"],
  ["MTQ", "MQ", "Martinique"],
  ["GUF", "GF", "French Guiana", "guyane"],
  ["MYT", "YT", "Mayotte"],
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
  // Single-typo tolerance (edit distance 1, unique hit only): catches
  // "Jamiaca"/"Barbadoss" without ever guessing between near-neighbours —
  // an ambiguous fuzzy match returns null and the caller's error path
  // surfaces suggestCountries instead. Only runs after every exact route
  // failed, and only for inputs long enough that one edit is a typo rather
  // than a different word (>= 5 chars).
  if (n.length >= 5) {
    const hits = NORM_NAMES.filter(({ n: cn }) => Math.abs(cn.length - n.length) <= 1 && editDistanceLeq1(n, cn));
    const uniq = [...new Set(hits.map((h) => h.c.iso3))];
    if (uniq.length === 1) return hits[0].c;
  }
  // Pass through plausible ISO codes the map may not know — the upstream validates.
  if (!opts.strict && /^[A-Z]{3}$/.test(upper)) {
    return { iso3: upper, iso2: upper.slice(0, 2), name: upper, unverified: true };
  }
  return null;
}

/** True when a and b are within one insertion, deletion, substitution, or
 * adjacent transposition of each other (Damerau-Levenshtein <= 1), without
 * building a full DP matrix — O(n) for the only case we need. */
function editDistanceLeq1(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];
  if (t.length - s.length > 1) return false;
  if (s.length === t.length) {
    // substitution or adjacent transposition
    let i = 0;
    while (i < s.length && s[i] === t[i]) i++;
    if (i === s.length) return true;
    if (s.slice(i + 1) === t.slice(i + 1)) return true; // one substitution
    return s[i] === t[i + 1] && s[i + 1] === t[i] && s.slice(i + 2) === t.slice(i + 2); // transposition
  }
  // one insertion in t
  let i = 0;
  while (i < s.length && s[i] === t[i]) i++;
  return s.slice(i) === t.slice(i + 1);
}

/** The UN OHRLLS Small Island Developing States list (39 states, as published
 * at un.org/ohrlls/content/small-island-developing-states; verified 2026-08-08).
 * StatCite groups these for the SIDS coverage surfaces — a data-availability
 * grouping only, never a ranking. Note Cook Islands and Niue appear on the
 * OHRLLS list; upstream data coverage varies by source. */
export const SIDS_ISO3: ReadonlySet<string> = new Set([
  "ATG", "BHS", "BRB", "BLZ", "CPV", "COM", "COK", "CUB", "DMA", "DOM",
  "FJI", "GRD", "GNB", "GUY", "HTI", "JAM", "KIR", "MDV", "MHL", "FSM",
  "MUS", "NRU", "NIU", "PLW", "PNG", "WSM", "STP", "SGP", "KNA", "LCA",
  "VCT", "SYC", "SLB", "SUR", "TLS", "TON", "TTO", "TUV", "VUT",
]);

/** SIDS members that resolve in the country table, with names — powers the
 * statcite://registry/sids resource and the site's coverage page build. */
export function sidsCountries(): Country[] {
  return [...SIDS_ISO3].map((iso3) => byCode.get(iso3)).filter((c): c is Country => Boolean(c));
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
