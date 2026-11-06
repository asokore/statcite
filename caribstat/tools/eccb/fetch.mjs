// ECCB fetcher — session handshake + per-geography table retrieval.
//
// Access mechanics, all verified live (2026-07-26 recon, re-verified 2026-08-10):
//
//   1. The site 403s a default user-agent and 200s a browser one. That is the
//      ONLY bot control observed — no headless browser is needed, which is why
//      this is a plain fetch module and not a Playwright job.
//   2. Tables are server-rendered HTML at
//      /statistics-category/{category}/{table}/{a|q|m}. The bare GET renders
//      the ECCU aggregate at the default frequency.
//   3. Any other geography/frequency/period is a Laravel POST to the table URL
//      (no /{freq} suffix) carrying a CSRF `_token` plus the session cookie
//      from the GET. Without both, Laravel answers 419, not 403 — a distinct
//      status worth checking for, because it means "handshake wrong", never
//      "blocked" or "no data".
//   4. The CSRF token is published in a <meta name="csrf-token"> tag. It is
//      NOT reliably present as a bare `name="_token" value="..."` input, so
//      matching only the input silently yields an empty token and every POST
//      419s. That exact mistake cost a debugging cycle on 2026-08-10.
//
// Licence: ingestion is permitted here only because the operator obtained
// permission from the ECCB (2026-08-10). Until the grant text is recorded in
// StatCite's licence ledger with its scope and attribution wording, output of
// this module must not be published or served.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const BASE = "https://www.eccb-centralbank.org";

/** Geography codes as the site's own select publishes them. Enumerated from
 * the live form, never guessed — the same discipline BIS_POLICY_RATE_AREAS
 * exists for in StatCite, after a guessed provider code served wrong data.
 * ISO3 is our mapping; ECCB has no ISO codes of its own. Anguilla and
 * Montserrat have no World Bank series at all, which is the whole point. */
export const ECCB_GEOGRAPHIES = [
  { code: "1", iso3: "AIA", name: "Anguilla" },
  { code: "2", iso3: "ATG", name: "Antigua and Barbuda" },
  { code: "3", iso3: "DMA", name: "Dominica" },
  { code: "4", iso3: "GRD", name: "Grenada" },
  { code: "5", iso3: "MSR", name: "Montserrat" },
  { code: "6", iso3: "KNA", name: "Saint Christopher (St Kitts) and Nevis" },
  { code: "7", iso3: "LCA", name: "Saint Lucia" },
  { code: "8", iso3: "VCT", name: "Saint Vincent and the Grenadines" },
  { code: "9", iso3: "XCU", name: "ECCU" },
];

/** Parse Set-Cookie headers into a single Cookie request header. */
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

/** CSRF token, from the meta tag first and the hidden input as a fallback.
 * Returns undefined rather than "" so a caller cannot POST an empty token and
 * misread the resulting 419 as a block. */
export function extractCsrfToken(html) {
  const meta = /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (meta) return meta[1];
  const input = /<input[^>]+name=["']_token["'][^>]*value=["']([^"']+)["']/i.exec(html);
  if (input) return input[1];
  const reversed = /<input[^>]+value=["']([^"']+)["'][^>]*name=["']_token["']/i.exec(html);
  return reversed ? reversed[1] : undefined;
}

/** The bank's own "Data as at DD Month YYYY" stamp. This is the provenance
 * StatCite cites — it is the SOURCE's freshness claim, not our retrieval time,
 * and the two must never be conflated in a citation.
 *
 * WITHDRAWN BY THE BANK. The 2026-09-20 deep run read it on every table. By
 * the 2026-09-30 run it was gone from every table at every frequency, and not
 * relocated: not in the server HTML, the browser-rendered page, the CSV export
 * or the Excel export, whose only date is its own generation time. So
 * undefined is now the normal answer, and the caller must record the stamp as
 * absent rather than borrow the last one it saw.
 *
 * Read from the page's visible text (tags and &nbsp; removed), so a restored
 * stamp wrapped in markup or written "Data as at: ..." is still recognised.
 * Any OTHER restored shape must not pass as "absent": see mentionsDataAsAt. */
const visibleText = (html) =>
  String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;| /gi, " ")
    .replace(/\s+/g, " ");

export function extractDataAsAt(html) {
  const m = /Data\s+as\s+at:?\s+([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})\b/i.exec(visibleText(html));
  return m ? m[1].trim() : undefined;
}

/** Does the page print a currency phrase at all, recognised or not?
 *
 * Accepting an absent stamp (September 2026) removed the sentinel that used to
 * fail every unrecognised one. Review then showed that a stamp restored as
 * "30th September 2026", "30/09/2026" or "Data as of ..." would have been
 * read as absent, and the Worker would have told every consumer that the bank
 * prints no stamp while it did. So "absent" is only accepted when no such
 * phrase appears anywhere in the visible text. */
export function mentionsDataAsAt(html) {
  return /\bdata\s+(?:as\s+(?:at|of)|current\s+(?:as|to))\b/i.test(visibleText(html));
}

/** Which geography the bare GET rendered, as the page itself declares it in
 * its hidden `hdnUtrCountry` field. Read rather than assumed: the stampless
 * skip compares this rendering against one stored document, and comparing it
 * against the wrong geography's file would be a false "unchanged". */
export function extractDefaultCountryCode(html) {
  const tag = /<input[^>]*\bid=["']hdnUtrCountry["'][^>]*>/i.exec(html)?.[0];
  const v = tag ? /\bvalue=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
  return v && /^\d+$/.test(v) ? v : undefined;
}

const stripTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Does this cell look like a period column header? */
function isPeriodLabel(c) {
  if (/^\d{4}$/.test(c)) return true; // annual: "2024"
  if (/^\d{4}[-/](Q[1-4]|\d{2})$/i.test(c)) return true; // already normalised
  return /^[A-Za-z]{3,9}\s+\d{4}$/.test(c); // "Mar 2024", "January 2024"
}

/**
 * Normalise a period label to StatCite's conventions so downstream verification
 * can match on period without knowing which bank produced it:
 *   annual    "2024"      -> "2024"
 *   quarterly "Mar 2024"  -> "2024-Q1"   (ECCB labels quarters by their END month)
 *   monthly   "Jan 2024"  -> "2024-01"
 *
 * The raw label is preserved separately by the caller — normalising without
 * keeping the original would destroy the ability to prove what the source said.
 */
export function normalisePeriod(label, freq = "a") {
  const s = String(label).trim();
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{4}[-/](Q[1-4]|\d{2})$/i.test(s)) return s.replace("/", "-").toUpperCase();
  const m = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(s);
  if (!m) return s;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!month) return s;
  const year = m[2];
  if (String(freq).toLowerCase() === "q") return `${year}-Q${Math.ceil(month / 3)}`;
  if (String(freq).toLowerCase() === "m") return `${year}-${String(month).padStart(2, "0")}`;
  return s;
}

/** One cell's text as a number, or null for the bank's missing-value marks. */
function parseValue(v) {
  const cleaned = v.replace(/,/g, "").replace(/[()]/g, (m2) => (m2 === "(" ? "-" : ""));
  if (cleaned === "" || /^[-–—]$/.test(cleaned) || /^n\.?a\.?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** The bank's class for a shaded value cell. It shades the last column of every
 * annual table and no quarterly or monthly one (measured across 29 captured
 * tables on 2026-11-06). The page calls it future data and never defines it,
 * so it is carried as the bank's marking and not read as a projection method. */
const FUTURE_CELL = /\bbg-future-data\b/;

/** What the bank prints for "no figure", as opposed to something unreadable. */
const MISSING_MARK = /^(?:[-–—]*|n[./]?a\.?)$/i;

const spanOf = (attrs, name) => Number(new RegExp(`(?:^|\\s)${name}=["']?(\\d+)`, "i").exec(attrs)?.[1] ?? 1);

/**
 * Lay header rows out on a grid, so a cell is found by its column and never by
 * how many cells came before it. colspan and rowspan repeat a cell across what
 * it covers, and an empty cell keeps its place.
 */
function gridOf(section) {
  const grid = [];
  const carried = [];
  for (const tr of section.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const row = [];
    let col = 0;
    const skipCarried = () => {
      while (carried[col]?.left > 0) {
        row[col] = carried[col].text;
        carried[col].left -= 1;
        col += 1;
      }
    };
    for (const m of tr.matchAll(/<t[hd]\b([^>]*)>[\s\S]*?<\/t[hd]>/gi)) {
      skipCarried();
      const across = spanOf(m[1], "colspan");
      const down = spanOf(m[1], "rowspan");
      const text = stripTags(m[0]);
      for (let i = 0; i < across; i++) {
        row[col] = text;
        if (down > 1) carried[col] = { text, left: down - 1 };
        col += 1;
      }
    }
    // A row that stops short still owes the cells carried past its end, or
    // they would leak into the next row and shift it.
    for (; col < carried.length; col++) {
      if (carried[col]?.left > 0) {
        row[col] = carried[col].text;
        carried[col].left -= 1;
      }
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Read a table whose periods split into sub-columns, as one row per source row
 * and sub-column, each with one value per period. Trade in Services splits
 * every year into imports and exports, then total, ECCU and other CARICOM.
 *
 * Each column's meaning comes from the header cells above it, and the columns
 * under every period must be exactly `split.columns`, in order. Anything this
 * reader cannot place with certainty goes in `problems`, so the sentinel refuses
 * the table rather than guessing. Reading "the last N cells" is what put 2026's
 * sub-columns under 2015 to 2026 on the first attempt.
 */
export function parseSplitTable(html, { freq = "a", split }) {
  // A commented-out row is not one the bank publishes.
  const table = /<table[\s\S]*?<\/table>/i.exec(html.replace(/<!--[\s\S]*?-->/g, ""))?.[0];
  const head = table && /<thead[\s\S]*?<\/thead>/i.exec(table);
  if (!head) return undefined;
  const headGrid = gridOf(head[0]);
  if (!headGrid[0]?.length) return undefined;
  // Label, then unit, then values, as on every table here. Fixed rather than
  // inferred from the first period-like cell, which a mark on the first year
  // would have moved, dropping that year and every unit in silence.
  const firstValue = 2;
  const width = headGrid[0].length;
  const problems = [];
  if (!/^unit$/i.test(headGrid[0][1] ?? "")) problems.push(`second column is "${headGrid[0][1]}", expected the unit`);
  const columns = [];
  for (let c = firstValue; c < width; c++) {
    const tiers = headGrid.map((r) => (r[c] ?? "").replace(/:\s*$/, ""));
    const path = tiers.filter((t, i) => t !== "" && t !== tiers[i - 1]);
    columns.push({ raw: path[0] ?? "", sub: path.slice(1).join(": ") });
  }
  const periodsRaw = [...new Set(columns.map((c) => c.raw))];
  for (const p of periodsRaw) {
    const subs = columns.filter((c) => c.raw === p).map((c) => c.sub);
    if (!isPeriodLabel(p)) problems.push(`header cell "${p}" is not a period`);
    if (subs.join(" | ") !== split.columns.join(" | ")) {
      problems.push(`sub-columns under ${p} are "${subs.join(" | ")}", expected "${split.columns.join(" | ")}"`);
    }
  }
  if (problems.length) return { periods: [], periodsRaw, rows: [], problems };
  const periods = periodsRaw.map((p) => normalisePeriod(p, freq));
  const at = new Map(columns.map((c, i) => [`${c.raw}|${c.sub}`, firstValue + i]));
  const shaded = new Set();
  const rows = [];
  for (const tr of table.slice(head.index + head[0].length).match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const parts = [...tr.matchAll(/<t[hd]\b([^>]*)>[\s\S]*?<\/t[hd]>/gi)];
    const cells = parts.map((m) => stripTags(m[0]));
    if (cells.every((c) => c === "")) continue;
    const base = cells[0];
    if (!base) {
      problems.push(`a row has no label: "${cells.filter(Boolean).slice(0, 3).join(" | ")}"`);
      continue;
    }
    // A merged cell cannot be one value under two headings, and a full-width
    // note is not a row of figures.
    if (parts.some((m) => spanOf(m[1], "colspan") > 1 || spanOf(m[1], "rowspan") > 1)) {
      problems.push(`row "${base}" has a merged cell`);
      continue;
    }
    if (cells.length !== width) {
      problems.push(`row "${base}" has ${cells.length} cells, the header has ${width}`);
      continue;
    }
    const unit = cells[1];
    for (const sub of split.columns) {
      const values = periodsRaw.map((p) => {
        const col = at.get(`${p}|${sub}`);
        const value = parseValue(cells[col]);
        if (value === null && !MISSING_MARK.test(cells[col])) problems.push(`"${base}: ${sub}" ${p}: cannot read "${cells[col]}"`);
        if (FUTURE_CELL.test(parts[col][1])) shaded.add(p);
        return value;
      });
      rows.push({ label: `${base}: ${sub}`, unit, values, base, sub });
    }
  }
  return { periods, periodsRaw, rows, problems, futurePeriods: periods.filter((_, i) => shaded.has(periodsRaw[i])) };
}

/**
 * Parse the rendered statistics table into { periods, periodsRaw, rows }.
 * Row shape on this site is: label | unit | value-per-period.
 *
 * `freq` matters: the same table renders annual columns as "2024" but
 * quarterly as "Mar 2024" and monthly as "Jan 2024". A parser that only
 * recognised 4-digit years returned NO TABLE at q and m — caught loudly by the
 * sentinel rather than silently, which is the system working as intended.
 *
 * A table the catalogue declares as `split` goes to parseSplitTable. Every
 * other table is held to one value per period.
 */
export function parseTable(html, { freq = "a", split } = {}) {
  if (split) return parseSplitTable(html, { freq, split });
  const table = /<table[\s\S]*?<\/table>/i.exec(html);
  if (!table) return undefined;
  const trs = table[0].match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  let periods;
  let periodsRaw;
  const rows = [];
  const future = new Set();
  for (const tr of trs) {
    const raw = (tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? []).filter((c) => stripTags(c) !== "");
    const cells = raw.map(stripTags);
    if (cells.length === 0) continue;
    // Header: the row whose trailing cells all look like period labels.
    if (!periods && cells.length > 1 && cells.every((c, i) => i === 0 || isPeriodLabel(c))) {
      periodsRaw = cells.slice(1);
      periods = periodsRaw.map((p) => normalisePeriod(p, freq));
      continue;
    }
    if (!periods) continue;
    const label = cells[0];
    const unit = cells.length === periods.length + 2 ? cells[1] : undefined;
    const valueCells = cells.slice(cells.length - periods.length);
    const values = valueCells.map(parseValue);
    raw.slice(raw.length - periods.length).forEach((c, i) => {
      if (FUTURE_CELL.test(/<t[hd][^>]*>/i.exec(c)?.[0] ?? "")) future.add(periods[i]);
    });
    // A row with more cells than label, unit and one per period means the
    // columns are split below the period, as Trade in Services' are. Taking
    // the last cells would file the final year's sub-columns as whole years,
    // so the row is flagged and the sentinel refuses the table until the
    // catalogue declares it `split`.
    rows.push(cells.length > periods.length + 2 ? { label, unit, values, wide: cells.length } : { label, unit, values });
  }
  return periods ? { periods, periodsRaw, rows, futurePeriods: periods.filter((p) => future.has(p)) } : undefined;
}

/** ECCB's date inputs take DD/MM/YYYY. A bare year is accepted here for
 * convenience and expanded to the year's first/last day. */
export function toEccbDate(v, edge = "start") {
  const s = String(v);
  if (/^\d{4}$/.test(s)) return edge === "start" ? `01/01/${s}` : `31/12/${s}`;
  return s;
}

async function get(url, cookies = "") {
  const res = await fetch(url, {
    headers: { "user-agent": UA, ...(cookies ? { cookie: cookies } : {}) },
    signal: AbortSignal.timeout(45000),
  });
  const html = await res.text();
  return { res, html, cookies: cookieHeader(res, cookies) };
}

/**
 * Open a session on a table page: returns the CSRF token, cookies, and the
 * default (ECCU) rendering so a caller can use it without a second request.
 */
export async function openTableSession(tableUrl, freq = "a") {
  const { res, html, cookies } = await get(`${tableUrl}/${freq}`);
  if (!res.ok) throw new Error(`ECCB GET ${res.status} for ${tableUrl}/${freq}`);
  const token = extractCsrfToken(html);
  if (!token) {
    throw new Error(
      `ECCB session: no CSRF token found on ${tableUrl}/${freq}. The page shape changed — do NOT POST with an empty token, it returns 419 and reads like a block.`,
    );
  }
  return {
    token, cookies, html,
    dataAsAt: extractDataAsAt(html),
    stampPhrase: mentionsDataAsAt(html),
    defaultCountryCode: extractDefaultCountryCode(html),
  };
}

/**
 * Fetch one geography/frequency/period window. Requires an open session.
 * A 419 is reported as a handshake failure explicitly, because it is the one
 * status here that means "our request was malformed", not "source refused".
 */
export async function fetchGeography(tableUrl, { token, cookies }, { countryCode, freq = "a", startDate, endDate, split }) {
  // Field shapes read off the live form, not assumed (each of these was wrong
  // on the first attempt and produced an opaque HTTP 500, not a validation
  // message):
  //   - the geography field is `country_code[]`, an ARRAY, not `country_code`
  //   - dates are DD/MM/YYYY strings ("31/12/2021"), not bare years
  const body = new URLSearchParams();
  body.append("_token", token);
  body.append("country_code[]", countryCode);
  // UPPERCASE. The URL path suffix is lowercase (/a, /q, /m) but the form field
  // is "A"/"Q"/"M", and posting the lowercase form returns an opaque HTTP 500
  // with no validation message. Confirmed by serialising the page's own
  // FormData in a browser rather than by guessing (2026-08-10).
  body.append("frequency", String(freq).toUpperCase());
  if (startDate) body.append("start_date", toEccbDate(startDate, "start"));
  if (endDate) body.append("end_date", toEccbDate(endDate, "end"));
  const res = await fetch(tableUrl, {
    method: "POST",
    headers: {
      "user-agent": UA,
      cookie: cookies,
      "content-type": "application/x-www-form-urlencoded",
      referer: `${tableUrl}/${freq}`,
    },
    body,
    signal: AbortSignal.timeout(60000),
  });
  const html = await res.text();
  if (res.status === 419) {
    throw new Error(
      `ECCB POST 419 (CSRF/session mismatch) for country_code=${countryCode}. Re-open the session; this is a handshake fault, not a block or an absence of data.`,
    );
  }
  if (!res.ok) throw new Error(`ECCB POST ${res.status} for country_code=${countryCode}`);
  return { html, table: parseTable(html, { freq, split }), dataAsAt: extractDataAsAt(html), stampPhrase: mentionsDataAsAt(html) };
}
