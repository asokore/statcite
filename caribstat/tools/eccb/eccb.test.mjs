// ECCB parser and sentinel tests.
//
// The fixture is an ABRIDGED COPY of a real ECCB response captured 2026-08-10,
// preserving the exact markup shape the parser depends on: a label column, a
// unit column, comma-grouped thousands, parenthesised negatives, and an em-dash
// for a missing value.
//
// The sentinel tests matter more than the parser tests. A shape sentinel that
// cannot reject anything is decoration, so each one here is checked against a
// payload that SHOULD fail it — not merely against a good payload that passes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable, extractCsrfToken, extractDataAsAt, mentionsDataAsAt, extractDefaultCountryCode, toEccbDate, normalisePeriod } from "./fetch.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateTable, parseDataAsAt, buildDocument, splitProblems, crossCheckProblems, storedContentAgrees } from "./ingest.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tableById, tableUrl, isPerCountry, COUNTRY_SLUGS } from "./catalogue.mjs";

const FIXTURE = `
<p>Data as at 28 July 2026</p>
<table>
  <tr><th></th><th>Unit</th><th>2023</th><th>2024</th><th>2025</th></tr>
  <tr><td>Total Revenue and Grants</td><td>EC$M</td><td>7,338.30</td><td>8,422.29</td><td>8,093.70</td></tr>
  <tr><td>Current Revenue</td><td>EC$M</td><td>6,947.50</td><td>7,915.58</td><td>7,621.44</td></tr>
  <tr><td>Tax Revenue</td><td>EC$M</td><td>4,811.62</td><td>5,320.15</td><td>5,637.32</td></tr>
  <tr><td>Overall Balance</td><td>EC$M</td><td>(120.45)</td><td>15.20</td><td>&mdash;</td></tr>
</table>`;

const FISCAL = tableById.get("central-government-fiscal-accounts");

test("parses periods, labels, units and values", () => {
  const t = parseTable(FIXTURE);
  assert.deepEqual(t.periods, ["2023", "2024", "2025"]);
  assert.equal(t.rows.length, 4);
  const rev = t.rows[0];
  assert.equal(rev.label, "Total Revenue and Grants");
  assert.equal(rev.unit, "EC$M");
  assert.deepEqual(rev.values, [7338.3, 8422.29, 8093.7], "commas must be stripped, not treated as decimals");
});

test("parenthesised negatives and dashes are handled", () => {
  const t = parseTable(FIXTURE);
  const bal = t.rows.find((r) => r.label === "Overall Balance");
  assert.equal(bal.values[0], -120.45, "(120.45) is negative, not positive");
  assert.equal(bal.values[1], 15.2);
  assert.equal(bal.values[2], null, "an em-dash is a missing value, never zero");
});

test("a dash must not become 0 — that would invent a data point", () => {
  const t = parseTable(FIXTURE);
  const bal = t.rows.find((r) => r.label === "Overall Balance");
  assert.notEqual(bal.values[2], 0);
});

test("CSRF token comes from the meta tag, and from the input as a fallback", () => {
  assert.equal(extractCsrfToken('<meta name="csrf-token" content="ABC123">'), "ABC123");
  assert.equal(extractCsrfToken('<input name="_token" value="XYZ789">'), "XYZ789");
  // The failure that cost a cycle: neither present must be undefined, NOT "",
  // so a caller cannot POST an empty token and misread the 419 as a block.
  assert.equal(extractCsrfToken("<html>nothing</html>"), undefined);
});

test("provenance stamp is extracted and parsed to an ISO date", () => {
  assert.equal(extractDataAsAt(FIXTURE), "28 July 2026");
  assert.equal(parseDataAsAt("28 July 2026"), "2026-07-28");
  assert.equal(parseDataAsAt("not a date"), undefined, "an unparseable stamp must not become an invented date");
  assert.equal(parseDataAsAt(undefined), undefined);
});

test("the stamp parser is strict: a garbled month or an impossible day is not a date", () => {
  // V8's Date() read "Julember" as July. Every raw stamp held on 2026-09-30
  // (504 documents, 11 distinct stamps) parses identically under this rule.
  assert.equal(parseDataAsAt("28 Julember 2026"), undefined);
  assert.equal(parseDataAsAt("31 June 2026"), undefined, "June has 30 days; Date() would roll it to 1 July");
  assert.equal(parseDataAsAt("28 July 2026 extra"), undefined);
  assert.equal(parseDataAsAt("01 September 2026"), "2026-09-01");
  assert.equal(parseDataAsAt("8 Jun 2026"), "2026-06-08", "three-letter months are still accepted");
  assert.equal(parseDataAsAt("28 Ju 2026"), undefined, "a two-letter prefix is ambiguous (June or July) and is refused");
  assert.equal(parseDataAsAt("5 Sept 2026"), undefined, "only the three-letter form or the full name");
  assert.equal(parseDataAsAt("1 Ma 2026"), undefined);
  assert.equal(parseDataAsAt("29 February 2028"), "2028-02-29");
});

test("dates convert to the DD/MM/YYYY the form requires", () => {
  assert.equal(toEccbDate(2021, "start"), "01/01/2021");
  assert.equal(toEccbDate(2025, "end"), "31/12/2025");
  assert.equal(toEccbDate("15/06/2024"), "15/06/2024", "an explicit date passes through");
});

// --- sentinels: each checked against a payload that should FAIL it ----------

test("SENTINEL passes a healthy payload", () => {
  assert.deepEqual(validateTable(FISCAL, parseTable(FIXTURE), "28 July 2026"), []);
});

test("SENTINEL fires when an expected row disappears (source redesign)", () => {
  const redesigned = FIXTURE.replace("Total Revenue and Grants", "Revenue, Total");
  const problems = validateTable(FISCAL, parseTable(redesigned), "28 July 2026");
  assert.ok(problems.some((p) => /Total Revenue and Grants/.test(p)), `expected a missing-row problem, got: ${problems.join("; ")}`);
});

test("SENTINEL fires when the columns are split below the period (Trade in Services shape)", () => {
  // Trimmed from the live table of 2026-11-03: each year spans imports and
  // exports, each of those total, ECCU and other CARICOM.
  const years = ["2025", "2026"];
  const sub = ["1,153.66", "52.42", "48.53", "2,561.74", "199.48", "250.68"];
  const html = `<table><tr><th></th><th>Unit</th>${years.map((y) => `<th colspan="6">${y}</th>`).join("")}</tr>` +
    `<tr>${years.map(() => "<th colspan=\"3\">Imports</th><th colspan=\"3\">Exports</th>").join("")}</tr>` +
    `<tr><td>Total EBOPS Services</td><td>EC$M</td>${years.map(() => sub.map((v) => `<td>${v}</td>`).join("")).join("")}</tr></table>`;
  const t = parseTable(html);
  assert.equal(t.periods.length, 2);
  const problems = validateTable({ sentinelRows: [] }, t, undefined);
  assert.ok(problems.some((p) => /split below the period/.test(p)), `expected a split-column problem, got: ${problems.join("; ")}`);
  assert.deepEqual(validateTable(FISCAL, parseTable(FIXTURE), "28 July 2026"), [], "a one-cell-per-period table is not flagged");
});

test("SENTINEL fires when every value fails to parse (number format changed)", () => {
  const weird = FIXTURE.replace(/7,338\.30|8,422\.29|8,093\.70|6,947\.50|7,915\.58|7,621\.44|4,811\.62|5,320\.15|5,637\.32|\(120\.45\)|15\.20/g, "n/a");
  const problems = validateTable(FISCAL, parseTable(weird), "28 July 2026");
  assert.ok(problems.some((p) => /parsed to null/.test(p)), `expected an all-null problem, got: ${problems.join("; ")}`);
});

test("SENTINEL fires when a stamp is printed but will not parse", () => {
  const problems = validateTable(FISCAL, parseTable(FIXTURE), "28 Julember 2026");
  assert.ok(problems.some((p) => /Data as at/.test(p)), `a garbled stamp is a shape change, got: ${problems.join("; ")}`);
});

test("an ABSENT stamp is accepted, because ECCB no longer prints one", () => {
  // Found 2026-09-30: every ECCB table lost its "Data as at" line, and this
  // sentinel then failed 153 of 153 series whose tables parsed perfectly.
  const stampless = FIXTURE.replace("<p>Data as at 28 July 2026</p>", "");
  assert.equal(extractDataAsAt(stampless), undefined);
  assert.deepEqual(validateTable(FISCAL, parseTable(stampless), undefined), []);
  // Relaxing the stamp must not have relaxed the table sentinels with it.
  assert.ok(validateTable(FISCAL, undefined, undefined).length > 0, "no table still fails");
  const redesigned = stampless.replace("Total Revenue and Grants", "Revenue, Total");
  assert.ok(validateTable(FISCAL, parseTable(redesigned), undefined).some((p) => /Total Revenue and Grants/.test(p)));
});

test("a stamp restored in markup or with a colon is recognised, not lost", () => {
  assert.equal(extractDataAsAt("<p>Data as at <span>30 September 2026</span></p>"), "30 September 2026");
  assert.equal(extractDataAsAt("<p>Data as at: 30 September 2026</p>"), "30 September 2026");
  assert.equal(extractDataAsAt("<p>Data as at&nbsp;30 September 2026</p>"), "30 September 2026");
  assert.equal(extractDataAsAt("<script>var x='Data as at 1 January 2020';</script><p>none here</p>"), undefined, "script text is not the page");
});

test("SENTINEL fires on a currency phrase in any shape it cannot read, never accepts it as absent", () => {
  // Found in round-2 review: relaxing the absent-stamp rule had silenced these.
  const stampless = FIXTURE.replace("<p>Data as at 28 July 2026</p>", "");
  for (const line of [
    "Data as at 30th September 2026",
    "Data as at 30/09/2026",
    "Data as of 30 September 2026",
    "Data as at 30 Sept 2026",
    "DATA AS AT 2026-09-30",
    "Data current as at 30 September 2026",
  ]) {
    const html = `<p>${line}</p>${stampless}`;
    const dataAsAt = extractDataAsAt(html);
    const problems = validateTable(FISCAL, parseTable(html), dataAsAt, { stampPhrase: mentionsDataAsAt(html) });
    assert.ok(problems.length > 0, `"${line}" must fail loudly, got extracted=${dataAsAt} and no problem`);
  }
  // Control: today's page, with no phrase at all, is accepted as stampless.
  assert.equal(mentionsDataAsAt(stampless), false);
  assert.deepEqual(validateTable(FISCAL, parseTable(stampless), undefined, { stampPhrase: false }), []);
});

test("a stampless document carries NO stamp, never a borrowed or invented one", () => {
  const doc = buildDocument({
    def: FISCAL, iso3: "AIA", name: "Anguilla", freq: "a",
    url: "https://example.test", table: parseTable(FIXTURE),
    dataAsAt: undefined, retrievedAt: "2026-09-30T12:00:00.000Z",
  });
  const written = JSON.parse(JSON.stringify(doc));
  assert.ok(!("data_as_at" in written), "our fetch date must not appear as the bank's currency claim");
  assert.ok(!("data_as_at_raw" in written));
  assert.equal(written.retrieved_at, "2026-09-30T12:00:00.000Z");
});

test("the default rendering's geography is read from the page, not assumed", () => {
  assert.equal(extractDefaultCountryCode('<input type="hidden" id="hdnUtrCountry" name="hdnUtrCountry" value="9">'), "9");
  assert.equal(extractDefaultCountryCode('<input value="3" name="hdnUtrCountry" id="hdnUtrCountry" type="hidden">'), "3", "attribute order varies");
  assert.equal(extractDefaultCountryCode('<input id="hdnUtrCountry" value="">'), undefined, "empty is unknown, not a code");
  assert.equal(extractDefaultCountryCode("<html>no field</html>"), undefined);
});

test("SENTINEL fires when there is no table at all", () => {
  assert.deepEqual(validateTable(FISCAL, undefined, "28 July 2026"), ["no table element found in the response"]);
});

// --- document shape --------------------------------------------------------

test("the published document keeps the source's stamp and ours apart", () => {
  const doc = buildDocument({
    def: FISCAL, iso3: "AIA", name: "Anguilla", freq: "a",
    url: "https://example.test", table: parseTable(FIXTURE),
    dataAsAt: "28 July 2026", retrievedAt: "2026-08-10T12:00:00.000Z",
  });
  assert.equal(doc.data_as_at, "2026-07-28", "the SOURCE's currency claim");
  assert.equal(doc.retrieved_at, "2026-08-10T12:00:00.000Z", "OUR fetch time");
  assert.notEqual(doc.data_as_at, doc.retrieved_at.slice(0, 10), "conflating these is a lie by formatting");
  assert.equal(doc.source, "Eastern Caribbean Central Bank");
  assert.equal(doc.country.iso3, "AIA");
  assert.equal(doc.series[0].observations[0].period, "2023");
  assert.equal(doc.series[0].observations[0].value, 7338.3);
});

test("the runner refuses a real run without both window ends, before any request", () => {
  // Without them the bank's default window would replace, and narrow, the
  // stored series. The check runs before any network call, so this is offline.
  const runner = fileURLToPath(new URL("./run.mjs", import.meta.url));
  for (const args of [["--freq", "a"], ["--freq", "a", "--start", "2015"], ["--freq", "a", "--end", "2026", "--deep"]]) {
    const r = spawnSync(process.execPath, [runner, ...args], { encoding: "utf8", timeout: 20000 });
    assert.equal(r.status, 2, `${args.join(" ")} should exit 2, got ${r.status}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /--start and --end are required/);
  }
  const dry = spawnSync(process.execPath, [runner, "--freq", "a", "--dry-run"], { encoding: "utf8", timeout: 20000 });
  assert.equal(dry.status, 0, "a dry run needs no window");
});

// --- catalogue -------------------------------------------------------------

test("CPI is modelled as per-country tables, not a geography selector", () => {
  const cpi = tableById.get("consumer-price-index");
  assert.ok(isPerCountry(cpi), "assuming the common shape would fetch ECCU CPI and label it as every country");
  assert.match(tableUrl(cpi, "MSR"), /consumer-price-index-montserrat$/);
  assert.match(tableUrl(cpi, "KNA"), /consumer-price-index-st-kitts-and-nevis$/, "URL slug differs from the display name");
  assert.ok(!isPerCountry(FISCAL), "fiscal accounts DO use the geography selector");
});

test("every catalogued geography has a URL slug", () => {
  for (const iso3 of ["AIA", "ATG", "DMA", "GRD", "MSR", "KNA", "LCA", "VCT", "XCU"]) {
    assert.ok(COUNTRY_SLUGS[iso3], `missing slug for ${iso3}`);
  }
});

// --- period normalisation (quarterly/monthly) ------------------------------
//
// ECCB renders the SAME table with different column labels per frequency:
// "2024" annually, "Mar 2024" quarterly, "Jan 2024" monthly. The first parser
// only recognised 4-digit years, so q and m returned NO TABLE — loudly, via
// the sentinel, which is how this was found rather than by shipping empty
// series.

const Q_HEADER = `
<p>Data as at 28 July 2026</p>
<table>
  <tr><th></th><th>Unit</th><th>Mar 2024</th><th>Jun 2024</th><th>Sep 2024</th><th>Dec 2024</th></tr>
  <tr><td>Total Revenue and Grants</td><td>EC$M</td><td>1,000.00</td><td>1,100.00</td><td>1,200.00</td><td>1,300.00</td></tr>
  <tr><td>Current Revenue</td><td>EC$M</td><td>900.00</td><td>950.00</td><td>975.00</td><td>1,000.00</td></tr>
  <tr><td>Tax Revenue</td><td>EC$M</td><td>800.00</td><td>810.00</td><td>820.00</td><td>830.00</td></tr>
</table>`;

const M_HEADER = Q_HEADER
  .replace("Mar 2024", "Jan 2024").replace("Jun 2024", "Feb 2024")
  .replace("Sep 2024", "Mar 2024").replace("Dec 2024", "Apr 2024");

test("quarterly labels normalise to YYYY-Qn by the quarter they fall in", () => {
  assert.equal(normalisePeriod("Mar 2024", "q"), "2024-Q1");
  assert.equal(normalisePeriod("Jun 2024", "q"), "2024-Q2");
  assert.equal(normalisePeriod("Sep 2024", "q"), "2024-Q3");
  assert.equal(normalisePeriod("Dec 2024", "q"), "2024-Q4");
});

test("monthly labels normalise to YYYY-MM with a zero-padded month", () => {
  assert.equal(normalisePeriod("Jan 2024", "m"), "2024-01");
  assert.equal(normalisePeriod("Sep 2024", "m"), "2024-09");
  assert.equal(normalisePeriod("December 2025", "m"), "2025-12", "full month names too");
});

test("annual labels pass through untouched, and unknown labels are not invented", () => {
  assert.equal(normalisePeriod("2024", "a"), "2024");
  assert.equal(normalisePeriod("2024-Q3", "q"), "2024-Q3", "already-normalised input is idempotent");
  assert.equal(normalisePeriod("Fiscal Year", "a"), "Fiscal Year", "an unrecognised label is returned as-is, never guessed into a date");
});

test("a quarterly table parses and keeps BOTH the normalised and raw labels", () => {
  const t = parseTable(Q_HEADER, { freq: "q" });
  assert.deepEqual(t.periods, ["2024-Q1", "2024-Q2", "2024-Q3", "2024-Q4"]);
  assert.deepEqual(t.periodsRaw, ["Mar 2024", "Jun 2024", "Sep 2024", "Dec 2024"],
    "the source's own labels must survive normalisation as evidence of what it printed");
  assert.equal(t.rows[0].values[3], 1300);
});

test("a monthly table parses to YYYY-MM", () => {
  const t = parseTable(M_HEADER, { freq: "m" });
  assert.deepEqual(t.periods, ["2024-01", "2024-02", "2024-03", "2024-04"]);
});

test("the same markup at the wrong declared frequency does NOT silently mislabel", () => {
  // Parsing quarterly columns as annual leaves the raw labels rather than
  // inventing years — a wrong-but-plausible "2024" four times would be worse.
  const t = parseTable(Q_HEADER, { freq: "a" });
  assert.deepEqual(t.periods, ["Mar 2024", "Jun 2024", "Sep 2024", "Dec 2024"]);
});

test("the published document preserves the source's raw period labels", () => {
  // A corpus-wide integrity check found the annual files missing this after
  // periods_raw was added for q/m — two schemas in one dataset. Regenerated,
  // and asserted here so the field cannot be dropped again silently.
  const doc = buildDocument({
    def: FISCAL, iso3: "XCU", name: "ECCU", freq: "q",
    url: "https://example.test", table: parseTable(Q_HEADER, { freq: "q" }),
    dataAsAt: "28 July 2026", retrievedAt: "2026-08-10T12:00:00.000Z",
  });
  assert.deepEqual(doc.periods, ["2024-Q1", "2024-Q2", "2024-Q3", "2024-Q4"]);
  assert.deepEqual(doc.periods_raw, ["Mar 2024", "Jun 2024", "Sep 2024", "Dec 2024"],
    "without the raw labels a reader cannot check the normalisation against the source");
});


// --- split columns: Trade in Services ------------------------------------
//
// Figures are Anguilla's, as the bank printed them. The rows carry one
// category, so that category equals the headline and the sum check has work to
// do. A first ingest read the last 12 cells of each row and filed one year's
// sub-columns as twelve years, and a checker reading the same way agreed.
const TIS = tableById.get("trade-in-services");
const YEARS = ["2015", "2016"];
const headSplit = ({ years = YEARS, dirs = ["Imports", "Exports"], eccu = "ECCU" } = {}) => [
  '<tr role="row"><th width="400px" rowspan="4"></th><th rowspan="4">Unit</th>',
  ...years.map((y) => '<th class="text-center" colspan="6">' + y + "</th>"),
  '</tr><tr role="row">',
  ...years.flatMap(() => dirs.map((d) => '<th class="text-center" colspan="3">' + d + "</th>")),
  '</tr><tr role="row">',
  ...years.flatMap(() => dirs.flatMap(() => ['<th class="text-center align-middle" rowspan="2">TOTAL</th>', '<th class="text-center" colspan="2">Of Which:</th>'])),
  '</tr><tr role="row">',
  ...years.flatMap(() => dirs.flatMap(() => ['<th class="text-center">' + eccu + "</th>", '<th class="text-center">Other CARICOM Countries</th>'])),
  "</tr>",
].join("");
const TOTAL_2015_16 = ["219.69", "25.75", "20.67", "423.47", "20.53", "9.67", "206.45", "26.41", "19.38", "432.99", "18.66", "8.41"];
const tisRow = (label, cells) => "<tr><td>" + label + "</td><td>EC$M</td>" + cells.map((c) => "<td>" + c + "</td>").join("") + "</tr>";
const tisPage = (head, rows) => '<table id="reportTable"><thead>' + head + "</thead><tbody>" + rows.join("") + "</tbody></table>";
const TIS_PAGE = tisPage(headSplit(), [tisRow("Total EBOPS Services", TOTAL_2015_16), tisRow("4. Travel", TOTAL_2015_16)]);
const splitRead = (html) => parseTable(html, { freq: "a", split: TIS.split });
const valueOf = (t, label, year) => t.rows.find((r) => r.label === label).values[t.periods.indexOf(year)];

test("split columns: each value lands under its own year, direction and partner", () => {
  const t = splitRead(TIS_PAGE);
  assert.deepEqual(t.periods, ["2015", "2016"]);
  assert.equal(t.rows.length, 12, "two source rows times six sub-columns");
  assert.equal(valueOf(t, "Total EBOPS Services: Imports: TOTAL", "2015"), 219.69);
  assert.equal(valueOf(t, "Total EBOPS Services: Imports: Of Which: ECCU", "2015"), 25.75);
  assert.equal(valueOf(t, "Total EBOPS Services: Imports: Of Which: Other CARICOM Countries", "2015"), 20.67);
  assert.equal(valueOf(t, "Total EBOPS Services: Exports: TOTAL", "2015"), 423.47);
  assert.equal(valueOf(t, "Total EBOPS Services: Exports: Of Which: Other CARICOM Countries", "2015"), 9.67);
  assert.equal(valueOf(t, "Total EBOPS Services: Imports: TOTAL", "2016"), 206.45);
  assert.equal(valueOf(t, "Total EBOPS Services: Exports: TOTAL", "2016"), 432.99);
  assert.equal(valueOf(t, "4. Travel: Exports: Of Which: ECCU", "2016"), 18.66);
  assert.equal(t.rows[0].unit, "EC$M");
  assert.deepEqual(validateTable(TIS, t, undefined), []);
});

test("split columns: a blank or a missing mark keeps its place, so the next cell stays in its column", () => {
  const cells = [...TOTAL_2015_16];
  cells[1] = "";
  cells[6] = "---";
  const t = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", cells)]));
  assert.equal(valueOf(t, "Total EBOPS Services: Imports: Of Which: ECCU", "2015"), null);
  assert.equal(valueOf(t, "Total EBOPS Services: Imports: Of Which: Other CARICOM Countries", "2015"), 20.67, "the cell after a blank has not moved left");
  assert.equal(valueOf(t, "Total EBOPS Services: Imports: TOTAL", "2016"), null);
  assert.equal(valueOf(t, "Total EBOPS Services: Exports: TOTAL", "2016"), 432.99);
});

test("split columns: the sentinel refuses a header it does not recognise", () => {
  const renamed = splitRead(tisPage(headSplit({ eccu: "OECS" }), [tisRow("Total EBOPS Services", TOTAL_2015_16)]));
  assert.ok(validateTable(TIS, renamed, undefined).some((p) => /sub-columns under 2015/.test(p)), "a renamed partner");
  const swapped = splitRead(tisPage(headSplit({ dirs: ["Exports", "Imports"] }), [tisRow("Total EBOPS Services", TOTAL_2015_16)]));
  assert.ok(validateTable(TIS, swapped, undefined).some((p) => /sub-columns under 2015/.test(p)), "the bank swapping imports and exports must not read as the old order");
  assert.equal(renamed.rows.length, 0, "no rows are offered from a header that failed");
});

test("split columns: the sentinel refuses a row of the wrong width", () => {
  const t = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", TOTAL_2015_16), tisRow("4. Travel", TOTAL_2015_16.slice(1))]));
  assert.ok(validateTable(TIS, t, undefined).some((p) => /"4\. Travel" has 13 cells, the header has 14/.test(p)));
  assert.ok(!t.rows.some((r) => r.base === "4. Travel"), "the short row is not published");
});

test("split columns: a column read one place out fails the arithmetic even under a good header", () => {
  // The ECCU share swapped with the total, which a header check cannot see.
  const cells = [...TOTAL_2015_16];
  [cells[0], cells[1]] = [cells[1], cells[0]];
  const t = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", cells), tisRow("4. Travel", cells)]));
  assert.ok(validateTable(TIS, t, undefined).some((p) => /parts sum to 240\.36, above the total of 25\.75/.test(p)));
});

test("split columns: the categories must sum to the headline, within rounding", () => {
  const cells = [...TOTAL_2015_16];
  cells[3] = "423.60";
  const off = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", TOTAL_2015_16), tisRow("4. Travel", cells)]));
  assert.ok(validateTable(TIS, off, undefined).some((p) => /Exports: TOTAL" 2015: the categories sum to 423\.60, the headline is 423\.47/.test(p)));
  const within = [...TOTAL_2015_16];
  within[3] = "423.53";
  const ok = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", TOTAL_2015_16), tisRow("4. Travel", within)]));
  assert.deepEqual(validateTable(TIS, ok, undefined), [], "0.06 is rounding across thirteen printed values");
});

test("split columns: a missing headline is a failure, never a sum skipped", () => {
  const t = splitRead(tisPage(headSplit(), [tisRow("4. Travel", TOTAL_2015_16)]));
  assert.ok(splitProblems(TIS.split, t).some((p) => /no "Total EBOPS Services" row under "Imports: TOTAL"/.test(p)));
});

test("split columns: a merged data cell is refused, never read as one value under two headings", () => {
  const merged = tisRow("Total EBOPS Services", TOTAL_2015_16).replace("<td>25.75</td><td>20.67</td>", '<td colspan="2">25.75</td>');
  const t = splitRead(tisPage(headSplit(), [merged]));
  assert.ok(validateTable(TIS, t, undefined).some((p) => /"Total EBOPS Services" has a merged cell/.test(p)));
  assert.equal(t.rows.length, 0);
  const lookalike = tisRow("Total EBOPS Services", TOTAL_2015_16).replace("<td>25.75</td>", '<td data-colspan="2">25.75</td>');
  assert.equal(valueOf(splitRead(tisPage(headSplit(), [lookalike])), "Total EBOPS Services: Imports: Of Which: ECCU", "2015"), 25.75, "only a real colspan counts");
});

test("split columns: a full-width note and a row with no label are refused, not published or dropped", () => {
  const note = '<tr><td colspan="14">Note: figures are provisional</td></tr>';
  assert.ok(validateTable(TIS, splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", TOTAL_2015_16), note])), undefined).some((p) => /merged cell/.test(p)));
  const blank = "<tr><td></td><td>EC$M</td>" + TOTAL_2015_16.map((c) => "<td>" + c + "</td>").join("") + "</tr>";
  assert.ok(validateTable(TIS, splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", TOTAL_2015_16), blank])), undefined).some((p) => /a row has no label/.test(p)));
  const spacer = "<tr><td></td><td></td></tr>";
  assert.deepEqual(splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", TOTAL_2015_16), spacer])).problems, [], "a wholly empty row is only spacing");
});

test("split columns: an unreadable cell is refused, while the bank's own missing marks are not", () => {
  for (const bad of ["29.02*", "\u221212.5", "29.02<sup>r</sup>", "1.2.3"]) {
    const cells = [...TOTAL_2015_16];
    cells[1] = bad;
    const t = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", cells)]));
    assert.ok(validateTable(TIS, t, undefined).some((p) => /cannot read/.test(p)), bad);
  }
  for (const mark of ["", "-", "---", "\u2014", "n/a", "N.A."]) {
    const cells = [...TOTAL_2015_16];
    cells[1] = mark;
    assert.deepEqual(splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", cells)])).problems, [], JSON.stringify(mark));
  }
});

test("split columns: a lost headline fails while its categories hold figures", () => {
  const gone = TOTAL_2015_16.map(() => "---");
  const t = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", gone), tisRow("4. Travel", TOTAL_2015_16)]));
  assert.ok(validateTable(TIS, t, undefined).some((p) => /is missing while its categories sum to 219\.69/.test(p)));
  const empty = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", gone), tisRow("4. Travel", gone)]));
  assert.ok(!splitProblems(TIS.split, empty).some((p) => /is missing/.test(p)), "nothing printed on either side is not a lost headline");
});

test("split columns: a mark on the first year is refused, never a dropped year and unit", () => {
  const t = splitRead(tisPage(headSplit({ years: ["2015p", "2016"] }), [tisRow("Total EBOPS Services", TOTAL_2015_16)]));
  assert.ok(validateTable(TIS, t, undefined).some((p) => /header cell "2015p" is not a period/.test(p)));
  const noUnit = headSplit().replace("<th rowspan=\"4\">Unit</th>", "<th rowspan=\"4\">Notes</th>");
  assert.ok(validateTable(TIS, splitRead(tisPage(noUnit, [tisRow("Total EBOPS Services", TOTAL_2015_16)])), undefined).some((p) => /expected the unit/.test(p)));
});

test("split columns: a row commented out in the source is not read", () => {
  const t = splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", TOTAL_2015_16), "<!-- " + tisRow("4. Travel", TOTAL_2015_16) + " -->"]));
  assert.ok(!t.rows.some((r) => r.base === "4. Travel"));
});

test("split columns: a rowspan that outruns a short header row does not leak into the next row", () => {
  // Year 2015 carries down past a row that stops short, so the next row must
  // still see the carried cell in its own column.
  const head = '<tr><th rowspan="2">X</th><th rowspan="2">Unit</th><th colspan="6">2015</th></tr><tr></tr>';
  const t = parseTable('<table><thead>' + head + "</thead><tbody></tbody></table>", { freq: "a", split: TIS.split });
  assert.ok(t.problems.some((p) => /sub-columns under 2015/.test(p)), "the short row reads as a header mismatch, not a shifted one");
});

test("split columns: a cell carried past a row's end still drains, so the row after it stays in place", () => {
  // "A" spans two rows from the last column, so the third row stops short of it.
  // Left undrained it would take the column in the fourth row and push "E" out.
  const head = '<tr><th rowspan="4"></th><th rowspan="4">Unit</th><th colspan="2">2015</th></tr>' +
    '<tr><th>B</th><th rowspan="2">A</th></tr><tr><th>C</th></tr><tr><th>D</th><th>E</th></tr>';
  const page = "<table><thead>" + head + "</thead><tbody><tr><td>Row</td><td>EC$M</td><td>1.00</td><td>2.00</td></tr></tbody></table>";
  const t = parseTable(page, { freq: "a", split: { columns: ["B: C: D", "A: E"] } });
  assert.deepEqual(t.problems, []);
  assert.equal(valueOf(t, "Row: A: E", "2015"), 2);
});

test("split columns: the totals must agree with the Balance of Payments, in both directions", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tis-"));
  try {
    const put = (iso3, credit, balance) => {
      mkdirSync(path.join(dir, "balance-of-payments", "a"), { recursive: true });
      const obs = (a) => [{ period: "2015", value: a[0] }, { period: "2016", value: a[1] }];
      writeFileSync(path.join(dir, "balance-of-payments", "a", iso3 + ".json"), JSON.stringify({ series: [
        { label: "Services Credit (Exports)", observations: obs(credit) },
        { label: "Balance on Services", observations: obs(balance) },
      ] }));
    };
    const t = splitRead(TIS_PAGE);
    const check = (iso3) => crossCheckProblems(TIS.split, t, iso3, "a", dir);
    put("AIA", [423.47, 432.99], [203.78, 226.54]);
    assert.deepEqual(await check("AIA"), []);
    put("AIA", [219.69, 206.45], [-203.78, -226.54]);
    assert.ok((await check("AIA")).some((p) => /Exports: TOTAL" 2015 is 423\.47, balance-of-payments implies 219\.69/.test(p)), "imports and exports the wrong way round");
    put("AIA", [432.99, 423.47], [226.54, 203.78]);
    assert.ok((await check("AIA")).some((p) => /Exports: TOTAL" 2015/.test(p)), "years the wrong way round");
    put("AIA", [423.47, 432.99], [203.78, 230]);
    assert.ok((await check("AIA")).some((p) => /Imports: TOTAL" 2016 is 206\.45/.test(p)), "imports are checked as well as exports");
    put("AIA", [423.47, null], [203.78, 226.54]);
    assert.deepEqual(await check("AIA"), [], "a year the other table does not hold is not compared");
    put("AIA", [null, null], [203.78, 226.54]);
    assert.ok((await check("AIA")).some((p) => /no period could be compared/.test(p)), "nothing compared is a failure, never a pass");
    assert.ok((await check("KNA")).some((p) => /could not be read/.test(p)), "no file is a failure, never a pass");
    put("AIA", [423.47, 432.99], [203.78, 226.54]);
    const gone = JSON.stringify({ series: [{ label: "Something else", observations: [] }] });
    writeFileSync(path.join(dir, "balance-of-payments", "a", "AIA.json"), gone);
    assert.ok((await check("AIA")).some((p) => /has no "Services Credit/.test(p)), "a renamed row is a failure, never a pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("split columns: partner columns swapped show in the union aggregate", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tis-"));
  try {
    mkdirSync(path.join(dir, "balance-of-payments", "a"), { recursive: true });
    writeFileSync(path.join(dir, "balance-of-payments", "a", "XCU.json"), JSON.stringify({ series: [
      { label: "Services Credit (Exports)", observations: [{ period: "2015", value: 423.47 }, { period: "2016", value: 432.99 }] },
      { label: "Balance on Services", observations: [{ period: "2015", value: 203.78 }, { period: "2016", value: 226.54 }] },
    ] }));
    const nonzero = await crossCheckProblems(TIS.split, splitRead(TIS_PAGE), "XCU", "a", dir);
    assert.ok(nonzero.some((p) => /Imports: Of Which: ECCU" should be zero/.test(p)));
    const zeroed = [...TOTAL_2015_16];
    for (const i of [1, 4, 7, 10]) zeroed[i] = "0.00";
    const fine = await crossCheckProblems(TIS.split, splitRead(tisPage(headSplit(), [tisRow("Total EBOPS Services", zeroed)])), "XCU", "a", dir);
    assert.deepEqual(fine, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the bank's future-data shading is carried by both readers, and only for the shaded period", () => {
  const shade = (html, value) => html.replaceAll("<td>" + value + "</td>", '<td class="text-right bg-future-data">' + value + "</td>");
  let split = TIS_PAGE;
  for (const v of TOTAL_2015_16.slice(6)) split = shade(split, v);
  assert.deepEqual(splitRead(split).futurePeriods, ["2016"]);
  assert.deepEqual(splitRead(TIS_PAGE).futurePeriods, []);
  const plain = "<table><tr><th></th><th>Unit</th><th>2025</th><th>2026</th></tr><tr><td>Debt</td><td>EC$M</td><td>1.00</td><td class=\"bg-future-data\">2.00</td></tr></table>";
  assert.deepEqual(parseTable(plain).futurePeriods, ["2026"]);
  assert.deepEqual(parseTable(plain.replace("bg-future-data", "bg-other")).futurePeriods, []);
  const doc = (table) => buildDocument({ def: { id: "x", title: "X" }, iso3: "AIA", name: "Anguilla", freq: "a", url: "https://example.test", table, dataAsAt: undefined, retrievedAt: "2026-11-06T00:00:00.000Z" });
  assert.deepEqual(doc(parseTable(plain)).future_periods, ["2026"]);
  assert.ok(!("future_periods" in doc(parseTable(plain.replace("bg-future-data", "bg-other")))), "an unshaded table carries no field");
});

test("a content skip is refused when the shading has moved, with every value unchanged", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "future-"));
  try {
    const at = "2026-11-06T00:00:00.000Z";
    const page = (shaded) => "<table><tr><th></th><th>Unit</th><th>2025</th><th>2026</th></tr><tr><td>Debt</td><td>EC$M</td><td" + (shaded === "2025" ? ' class="bg-future-data"' : "") + ">1.00</td><td" + (shaded === "2026" ? ' class="bg-future-data"' : "") + ">2.00</td></tr></table>";
    const def = { id: "x", title: "X" };
    const g = [{ iso3: "AIA", code: "1", name: "Anguilla" }];
    const held = buildDocument({ def, iso3: "AIA", name: "Anguilla", freq: "a", url: "https://example.test", table: parseTable(page("2025")), dataAsAt: undefined, retrievedAt: at });
    mkdirSync(path.join(dir, "x", "a"), { recursive: true });
    writeFileSync(path.join(dir, "x", "a", "AIA.json"), JSON.stringify(held));
    const agrees = (html) => storedContentAgrees(def, "a", g, dir, { liveTable: parseTable(html), defaultCountryCode: "1", lastFullFetchAt: at });
    assert.equal((await agrees(page("2025"))).ok, true);
    const moved = await agrees(page("2026"));
    assert.equal(moved.ok, false);
    assert.match(moved.why, /shades/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("split columns: only a table the catalogue declares split is read this way", () => {
  const t = parseTable(TIS_PAGE, { freq: "a" });
  assert.ok(t.rows.some((r) => r.wide), "without the declaration the real rows are flagged wide");
  assert.ok(validateTable({ sentinelRows: [] }, t, undefined).length > 0);
});

test("split columns: the published document carries one value per period, labelled in full", () => {
  const doc = buildDocument({
    def: TIS, iso3: "AIA", name: "Anguilla", freq: "a",
    url: "https://example.test", table: splitRead(TIS_PAGE), dataAsAt: undefined,
    retrievedAt: "2026-11-06T00:00:00.000Z",
  });
  const s = doc.series.find((x) => x.label === "4. Travel: Exports: TOTAL");
  assert.deepEqual(s.observations, [{ period: "2015", value: 423.47 }, { period: "2016", value: 432.99 }]);
  assert.equal(s.unit, "EC$M");
  assert.equal(doc.periods.length, 2);
  assert.ok(!("sub" in s) && !("base" in s), "reader bookkeeping stays out of the published file");
});
