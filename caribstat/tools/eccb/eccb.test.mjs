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
import { validateTable, parseDataAsAt, buildDocument } from "./ingest.mjs";
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

