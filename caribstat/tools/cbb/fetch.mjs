// Central Bank of Barbados fetcher — listing discovery + attachment resolution.
//
// Access mechanics, all verified live 2026-08-13:
//
//  1. A listing page (e.g. /news/statistics) renders PAGE 1 SERVER-SIDE, so the
//     first batch of items needs no handshake at all. The July recon recorded
//     that the static HTML contains no data links; that is true of the
//     ATTACHMENTS but not of the item links, which are there.
//  2. Further pages come from POST /news/fetchdata with an X-CSRF-TOKEN header
//     (token from the <meta name="csrf-token"> tag) and the session cookie.
//     The body must carry page + HidtagFilter + category + start_date +
//     end_date + contains, with every filter EMPTY. Supplying a category slug
//     (the obvious guess) returns HTTP 500 with no validation message.
//     The handshake itself lives in cdn.../assets/js/packages/news/news.js —
//     grepping the page HTML for "fetchdata" finds nothing and is the wrong
//     test, which cost a wrong conclusion once already.
//  3. Each item page carries the real attachment on cdn.centralbank.org.bb,
//     alongside SIX SITE-WIDE FOOTER PDFs that appear on every page of the site
//     (bond FAQ, pensioner form, prospectus, three sandbox documents). A naive
//     "first document link" rule downloads a pensioner declaration form and
//     treats it as statistics.
//
// The attachment rule here is by FILE TYPE, not by a hardcoded exclusion list:
// the statistical publications are spreadsheets and every boilerplate document
// is a PDF. A list of six filenames would rot the moment the site changed its
// footer; "is it a spreadsheet" stays true.
//
// LICENCE: CBB publishes no data-reuse terms. Ingestion proceeds only on the
// operator's obtained permission, and output stays unserved until that grant
// is recorded in StatCite's licence ledger with its scope.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const BASE = "https://www.centralbank.org.bb";
export const CDN = "https://cdn.centralbank.org.bb";

/** Listing pages that carry statistical publications, from the live sitemap. */
/**
 * `families` is how many DISTINCT publications a listing carries, as opposed
 * to how many editions of one publication.
 *
 * Every listing here but one is a run of the same table republished: tourism
 * is ten editions of Long Stay & Cruise Arrivals, labour is nine of Labour
 * Statistics. For those, the newest item is the answer and `families: 1` is
 * right. The `statistics` listing is different — its two items are DIFFERENT
 * tables (commercial bank investments, and selected indicators of depository
 * corporations), so taking only the newest silently discarded the other one
 * entirely. That is a whole publication missing, not a stale edition.
 *
 * Found 2026-08-14 by listing the item slugs per category rather than assuming
 * every listing behaved like tourism.
 *
 * Balance of payments is deliberately left at 1 even though its fifteen items
 * DO split into several slug families ("…private-foreign-capital…-table-13",
 * "…yincome-table-8"). Those are 2010 and 2011 vintages of individual tables,
 * superseded by the comprehensive 1967-2017 workbook that is now ingested.
 * Pulling them in would serve older figures alongside newer ones for the same
 * series with no rule saying which wins, which is the overlap-precedence
 * problem this project has not yet solved. Left out on purpose, recorded here
 * so the next session does not read it as an oversight.
 */
export const CBB_LISTINGS = [
  { id: "statistics", path: "/news/statistics", title: "Statistics", families: 2 },
  { id: "gross-domestic-product", path: "/news/gross-domestic-product", title: "Gross Domestic Product" },
  { id: "inflation-and-retail-price-index", path: "/news/inflation-and-retail-price-index", title: "Inflation and Retail Price Index" },
  { id: "labour-statistics", path: "/news/labour-statistics", title: "Labour Statistics" },
  { id: "the-wages-index", path: "/news/the-wages-index", title: "The Wages Index" },
  { id: "index-of-industrial-production", path: "/news/index-of-industrial-production", title: "Index of Industrial Production" },
  { id: "tourism", path: "/news/tourism", title: "Tourism" },
  { id: "balance-of-payments-reports", path: "/news/balance-of-payments-reports", title: "Balance of Payments" },
];

/**
 * Category pages that exist but yielded ZERO items when probed 2026-08-13:
 * deposit-taking-financial-system, interest-rates-and-exchange-rates,
 * trade-in-goods-tables, summary-of-government-operations, securities-tables.
 *
 * Recorded rather than dropped. They are almost certainly hubs of further
 * sub-categories — exactly what
 * /news/gdp-inflation-labour-and-other-general-statistics turned out to be
 * (it links 60 sub-paths and lists no items of its own). Treating an
 * unexplored hub as "this category has no data" would be the same
 * absence-versus-coverage confusion this project keeps guarding against, so
 * they stay listed here as UNRESOLVED, not as empty.
 */
/**
 * Categories whose newest publication does not yet extract, with the reason.
 * Recorded because "we have not solved this sheet yet" and "this category has
 * no data" are different claims, and only the first is true here.
 *
 * Empty as of 2026-08-14: "statistics" (sheets B2F/B3F, which previously had
 * no period label and no plausible period column) was resolved in the same
 * pass that fixed the xlsx.mjs self-closing-cell bug — it now ingests 148
 * monthly periods to April 2026. balance-of-payments-reports was here until
 * the transposed reader and the merged-header span rule landed earlier; it
 * now extracts 14 of 15 sheets (see CBB_PARTIAL below).
 *
 * If a future run FAILs a category, that is a regression against this list,
 * not a rediscovery of a known gap — investigate rather than assuming it is
 * expected.
 */
export const CBB_UNEXTRACTED = [];

/**
 * Partially extracted, with the reason. The balance-of-payments workbook has
 * 15 sheets and 14 now extract; the 15th is the Table of Contents, which is
 * correctly not read as data. Nothing here is left unextracted.
 *
 * Historically only 4 extracted. The other 10 use a MERGED-CELL HEADER: the
 * year label sits one column to the LEFT of the values it heads (row 2 reads
 * 1967, blank, 1968, 1969...), so a strict period-run match broke on the gap,
 * and an offset guess would have silently shifted every series by one year.
 * They were left unextracted rather than guessed, until the transposed reader
 * and the merged-header span rule landed and read the span correctly instead
 * of guessing at it. Both rules are covered by tests — see the MERGED HEADER
 * and TRANSPOSED cases in the suite — because an off-by-one year on a
 * balance-of-payments figure is exactly the kind of wrong-but-plausible
 * number this pipeline exists to prevent.
 */
export const CBB_PARTIAL = {
  "balance-of-payments-reports":
    "14 of 15 sheets; the 15th is the workbook's Table of Contents, which is correctly not a data table",
};

export const CBB_UNRESOLVED_CATEGORIES = [
  "deposit-taking-financial-system",
  "interest-rates-and-exchange-rates",
  "trade-in-goods-tables",
  "summary-of-government-operations",
  "securities-tables",
];

const SPREADSHEET = /\.(xlsx|xls|csv)(?:\?|$)/i;

function cookieHeader(res, previous = "") {
  const jar = new Map();
  for (const part of previous.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k && v.length) jar.set(k, v.join("="));
  }
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const [k, ...v] = pair.split("=");
    if (k && v.length) jar.set(k.trim(), v.join("="));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function extractCsrfToken(html) {
  const m = /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i.exec(html);
  return m ? m[1] : undefined;
}

/** Item page links for one listing page's HTML. */
export function extractItemLinks(html, listingPath) {
  const esc = listingPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const abs = new RegExp(`https://www\\.centralbank\\.org\\.bb${esc}/[^"'#?<> ]+`, "g");
  return [...new Set([...html.matchAll(abs)].map((m) => m[0]))];
}

/**
 * The publication title, taken from the page's <h1> rather than its <title>.
 *
 * WHY NOT <title>. On 2026-08-14 the item page for the JUNE 2025 tourism
 * release carried `<title>Long Stay & Cruise Arrivals December 2023</title>`
 * and an og:title to match, while its <h1> and its attachment
 * (H1LongStayCruiseJune2025.xlsx) both said June 2025. CBB's CMS had carried
 * the previous release's title forward. Reading <title> made StatCite cite
 * eighteen-month-old provenance for current data, which is a worse failure
 * than serving nothing.
 *
 * <title> is kept as a fallback for pages with no <h1>, with the site-name
 * suffix stripped in BOTH forms the site uses: "… | Central Bank of Barbados"
 * and "… - Central Bank of Barbados". Only the pipe form was handled before,
 * so every dash-form title carried the site name into the citation's dataset
 * field.
 */
export function extractTitle(html) {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const clean = (t) =>
    t
      ?.replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s*[|-]\s*Central Bank of Barbados\s*$/i, "")
      .trim();
  const fromH1 = clean(h1);
  if (fromH1) return fromH1;
  return clean(/<title>([^<]+)<\/title>/i.exec(html)?.[1]) || undefined;
}

/**
 * Does the title agree with the file it describes?
 *
 * Both carry a year, and when they disagree one of them is describing a
 * different publication. This is the check that would have caught the December
 * 2023 title on the June 2025 workbook, so it is a hard failure rather than a
 * warning: a citation that names the wrong publication is the specific harm
 * this project exists to prevent.
 */
export function titleAgreesWithAttachment(title, attachmentUrl) {
  const years = (s) => [...String(s ?? "").matchAll(/(?:19|20)\d{2}/g)].map((m) => m[0]);
  // Drop the CDN's own date prefix, which is the publication timestamp and
  // says nothing about the period the workbook covers.
  const file = String(attachmentUrl ?? "").split("/").pop()?.replace(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-/, "");
  const t = years(title);
  const f = years(file);
  if (!t.length || !f.length) return { ok: true };
  if (t[t.length - 1] === f[f.length - 1]) return { ok: true };
  return {
    ok: false,
    problem: `title "${title}" ends at ${t[t.length - 1]} but the attachment ${file} ends at ${f[f.length - 1]} — the page title may be a stale carry-over from the previous release`,
  };
}

/**
 * The publication a slug belongs to, with its edition stamp removed.
 *
 *   long-stay-cruise-arrivals-june-2025      -> long-stay-cruise-arrivals
 *   long-stay-cruise-arrivals-december-2023  -> long-stay-cruise-arrivals
 *   investments-provisional-2014-april-2026  -> investments-provisional
 *
 * Trailing years, month names and quarter markers are edition stamps, so they
 * come off. Anything earlier in the slug is the publication's identity and
 * stays, which is what keeps "investments" and "selected indicators of
 * depository corporations" apart.
 */
export function publicationFamily(slugOrUrl) {
  const slug = String(slugOrUrl ?? "").split("/").filter(Boolean).pop() ?? "";
  const MONTHS = /^(january|february|march|april|may|june|july|august|september|october|november|december)$/i;
  const parts = slug.split("-");
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (/^\d{4}$/.test(last) || MONTHS.test(last) || /^q[1-4]$/i.test(last) || /^\d{1,2}$/.test(last)) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join("-");
}

/** The spreadsheet attachment on an item page, or undefined. */
export function extractAttachment(html) {
  const docs = [...new Set([...html.matchAll(/https:\/\/cdn\.centralbank\.org\.bb\/documents\/[^"'<> ]+/g)].map((m) => m[0]))];
  return docs.find((d) => SPREADSHEET.test(d));
}

async function get(url, cookies = "") {
  const res = await fetch(url, {
    headers: { "user-agent": UA, ...(cookies ? { cookie: cookies } : {}) },
    signal: AbortSignal.timeout(45000),
  });
  const html = await res.text();
  return { res, html, cookies: cookieHeader(res, cookies) };
}

/** Open a session on a listing page: token, cookies, and page 1's HTML. */
export async function openListing(listingPath) {
  const { res, html, cookies } = await get(`${BASE}${listingPath}`);
  if (!res.ok) throw new Error(`CBB GET ${res.status} for ${listingPath}`);
  const token = extractCsrfToken(html);
  if (!token) throw new Error(`CBB: no CSRF token on ${listingPath}; the page shape changed`);
  return { token, cookies, html };
}

/** One further page of items. Returns the fragment HTML. */
export async function fetchPage(session, page, listingPath) {
  const body = new URLSearchParams({
    page: String(page),
    // ALL filters empty. A category slug here is an HTTP 500.
    HidtagFilter: "",
    category: "",
    start_date: "",
    end_date: "",
    contains: "",
  });
  const res = await fetch(`${BASE}/news/fetchdata`, {
    method: "POST",
    headers: {
      "user-agent": UA,
      cookie: session.cookies,
      "content-type": "application/x-www-form-urlencoded",
      "x-csrf-token": session.token,
      "x-requested-with": "XMLHttpRequest",
      referer: `${BASE}${listingPath}`,
    },
    body,
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`CBB fetchdata HTTP ${res.status} (page ${page}) — check that every filter field is present and EMPTY`);
  const json = await res.json();
  return typeof json?.html === "string" ? json.html : "";
}

/** Discover item pages for one listing, following pagination. */
export async function discoverItems(listingPath, { maxPages = 3, gapMs = 800 } = {}) {
  const session = await openListing(listingPath);
  const items = new Set(extractItemLinks(session.html, listingPath));
  for (let page = 2; page <= maxPages; page++) {
    await new Promise((r) => setTimeout(r, gapMs));
    let frag;
    try {
      frag = await fetchPage(session, page, listingPath);
    } catch {
      break;
    }
    const found = extractItemLinks(frag, listingPath);
    if (found.length === 0) break;
    const before = items.size;
    for (const f of found) items.add(f);
    if (items.size === before) break; // pagination looped; stop rather than spin
  }
  return { session, items: [...items] };
}

/** Resolve one item page to its spreadsheet attachment. */
export async function resolveAttachment(itemUrl, cookies = "") {
  const { res, html } = await get(itemUrl, cookies);
  if (!res.ok) throw new Error(`CBB item GET ${res.status} for ${itemUrl}`);
  const url = extractAttachment(html);
  const title = extractTitle(html);
  return { itemUrl, attachmentUrl: url, title };
}

/** Download a spreadsheet as a Buffer. */
export async function downloadAttachment(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(90000), redirect: "follow" });
  if (!res.ok) throw new Error(`CBB attachment HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** CBB stamps currency in the CDN filename prefix: 2026-05-03-15-36-54-Name.xlsx.
 * That is the PUBLICATION time, which is the closest thing this source gives to
 * ECCB's explicit "Data as at" stamp — and it is not our retrieval time. */
export function publicationDateFromUrl(url) {
  const m = /\/documents\/(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}-\d{2}-/.exec(url ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}
