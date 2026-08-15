// CBB table extraction tests.
//
// Every case here is a real defect found while running this against live CBB
// workbooks on 2026-08-13, not a hypothetical. Three of them produced
// plausible-looking output rather than an error, which is the class that
// actually reaches a published number.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalisePeriod,
  excelSerialToISO,
  findHeaderAnchor,
  extractSheet,
  extractTransposed,
  composeGroupedHeaders,
  fillBlankHeadersFromAbove,
  isDateColumn,
} from "./tables.mjs";

// --- the year/serial collision --------------------------------------------

test("A BARE YEAR IS NOT AN EXCEL SERIAL", () => {
  // The GDP sheet stores 2010 as the number 2010. Read as a serial it becomes
  // 1905-07-02, and the whole annual table silently reports Edwardian dates
  // against modern values. Caught live.
  assert.equal(normalisePeriod(2010).period, "2010");
  assert.equal(normalisePeriod(2023).period, "2023");
  assert.equal(normalisePeriod(1999).period, "1999");
});

test("a real Excel serial still converts", () => {
  // 44562 is 2022-01-01 — the tourism sheet's first monthly observation.
  assert.equal(excelSerialToISO(44562), "2022-01-01");
  assert.equal(normalisePeriod(44562).period, "2022-01", "a month-start collapses to YYYY-MM");
});

test("small numbers are not dates", () => {
  assert.equal(excelSerialToISO(12), undefined, "an index value must not become 1900");
  assert.equal(excelSerialToISO(0), undefined);
});

// --- metadata rows must not become observations ---------------------------

test("UNPARSEABLE LABELS ARE REJECTED, not passed through", () => {
  // CBB's inflation sheets carry "Basket Weights" and "BASE YEAR" rows between
  // the header and the data, WITH numbers alongside. Passing the label through
  // recorded them as periods and their weights as observations.
  assert.equal(normalisePeriod("Basket Weights"), undefined);
  assert.equal(normalisePeriod("BASE YEAR"), undefined);
  assert.equal(normalisePeriod("Source: Barbados Statistical Service"), undefined);
  assert.equal(normalisePeriod("Note:"), undefined);
});

test("recognised period formats survive", () => {
  assert.equal(normalisePeriod("2006").period, "2006");
  assert.equal(normalisePeriod("1Q 1965").period, "1965-Q1");
  assert.equal(normalisePeriod("Q3 1980").period, "1980-Q3");
  assert.equal(normalisePeriod("2024-07").period, "2024-07");
  assert.equal(normalisePeriod("2024-Q2").period, "2024-Q2");
});

// --- the revision flag -----------------------------------------------------

test("a revision suffix is RECORDED, not silently stripped", () => {
  // "2006R" is the bank saying the figure has been revised. Dropping the R
  // turns a qualified number into an unqualified one.
  const r = normalisePeriod("2006R");
  assert.equal(r.period, "2006");
  assert.equal(r.revised, true);
  assert.equal(r.raw, "2006R", "the source's own label survives");
  const p = normalisePeriod("2023P");
  assert.equal(p.revised, true, "P for provisional counts too");
  assert.equal(normalisePeriod("2006").revised, false);
});

// --- anchoring -------------------------------------------------------------

const GDP_LIKE = [
  ["REAL GROSS DOMESTIC PRODUCT"], [], [],
  ["Period", "Agriculture", "Mining", "Manufacturing"],
  ["2006R", 119.18, 31.53, 709.09],
  ["2007R", 120.79, 29.8, 680.51],
  ["Source: Barbados Statistical Service"],
];

const TOURISM_LIKE = [
  [null, "BARBADOS' TOURIST ARRIVALS"], [],
  [null, "Period", "U.S.A", "Canada"],
  [null, 44562, 8762, 3565],
  [null, 44593, 10068, 5128],
];

test("the anchor finds the period column wherever it sits", () => {
  // Tourism's table starts in column 1, GDP's in column 0. A fixed offset
  // would shear one of them by a column and file U.S.A arrivals under Canada.
  assert.deepEqual({ ...findHeaderAnchor(GDP_LIKE) }.col, 0);
  assert.deepEqual({ ...findHeaderAnchor(TOURISM_LIKE) }.col, 1);
});

test('"Period Ended" anchors too', () => {
  // CBB's inflation sheets use "Period Ended". A Period-only matcher found NO
  // table in a 2.3MB workbook of 13 data sheets and reported "0 tables" — a
  // quiet nothing rather than an error.
  const rows = [["Period Ended", "12 MONTH MA", "POINT TO POINT"], [27364, 39.05, 39.05]];
  const a = findHeaderAnchor(rows);
  assert.ok(a, "Period Ended must anchor");
  assert.equal(a.col, 0);
});

test("a stray 'Period' in prose does not anchor a table", () => {
  const rows = [["Period", "of review"], ["some prose"]];
  assert.equal(findHeaderAnchor(rows), undefined, "one named column to the right is not a table");
});

// --- end to end ------------------------------------------------------------

test("extracts series, flags revisions, and reports what it skipped", () => {
  const t = extractSheet({ name: "GDP", rows: GDP_LIKE });
  assert.deepEqual(t.periods, ["2006", "2007"]);
  assert.deepEqual(t.revised_periods, ["2006", "2007"]);
  assert.equal(t.series.length, 3);
  assert.equal(t.series[0].label, "Agriculture");
  assert.equal(t.series[0].observations[0].value, 119.18);
  assert.ok(t.unparsed_labels.some((l) => /Source/.test(l)), "the footnote is reported, not silently dropped");
});

test("the tourism shape extracts from its offset column", () => {
  const t = extractSheet({ name: "H1", rows: TOURISM_LIKE });
  assert.deepEqual(t.periods, ["2022-01", "2022-02"]);
  assert.equal(t.series[0].label, "U.S.A");
  assert.equal(t.series[0].observations[0].value, 8762, "values must not slide across columns");
  assert.equal(t.series[1].label, "Canada");
  assert.equal(t.series[1].observations[0].value, 3565);
});

test("a sheet with no table returns undefined, not an empty table", () => {
  assert.equal(extractSheet({ name: "TOC", rows: [["Table", "Description"], ["I1", "INFLATION"]] }), undefined);
});

// --- transposed sheets and merged year headers -----------------------------
//
// CBB is not internally consistent about orientation: balance of payments runs
// years ACROSS a header row with line items down the side, the opposite of GDP
// and tourism. Worse, it anchors a merged year header at the LEFT of its span,
// so 1967 sits in column 0 while its values sit in column 1.

const BOP_LIKE = [
  ["TABLE 1: STANDARD SUMMARY"],
  ["BDS$Millions"],
  // 1967 is a merged cell spanning columns 0-1; the rest are single columns.
  [1967, null, 1968, 1969, 1970, 1971],
  ["1. CURRENT ACCOUNT", -31.74, -52.77, -79.16, -92.40, -83.86],
  ["   a. Goods", -58.01, -85.49, -112.16, -143.09, -156.91],
];

test("TRANSPOSED: years across the header, line items down the side", () => {
  const t = extractTransposed(BOP_LIKE.length ? { name: "Standard Summary", rows: BOP_LIKE } : null, { minRun: 5 });
  assert.ok(t, "a transposed sheet must extract; the column parser finds nothing here");
  assert.equal(t.anchor.orientation, "transposed");
  assert.deepEqual(t.periods, ["1967", "1968", "1969", "1970", "1971"]);
});

test("MERGED HEADER: a left-anchored year maps to its OWN values, not its neighbour's", () => {
  // This is the off-by-one that would have shifted every balance-of-payments
  // series by a year while looking perfectly healthy. 1967's value is in
  // column 1 even though its label is in column 0.
  const t = extractTransposed({ name: "Standard Summary", rows: BOP_LIKE }, { minRun: 5 });
  const ca = t.series.find((s) => s.label.startsWith("1. CURRENT ACCOUNT"));
  assert.equal(ca.observations[0].period, "1967");
  assert.equal(ca.observations[0].value, -31.74, "1967 must carry -31.74, not 1968's -52.77");
  assert.equal(ca.observations[1].value, -52.77);
  assert.equal(ca.observations.at(-1).period, "1971");
  assert.equal(ca.observations.at(-1).value, -83.86, "the last year must not fall off the end");
});

test("TRANSPOSED: the label column is derived, not assumed to be column 0", () => {
  const t = extractTransposed({ name: "Standard Summary", rows: BOP_LIKE }, { minRun: 5 });
  assert.equal(t.anchor.col, 0);
  assert.equal(t.series.length, 2, "both line items extract");
});

test("a sheet with too few periods is not force-fit as transposed", () => {
  const rows = [["Table of Contents"], ["Table 1", "Standard Summary"], ["Table 2", "Analytical Summary"]];
  assert.equal(extractTransposed({ name: "TOC", rows }, { minRun: 5 }), undefined);
});

// --- republished vs our-query-changed --------------------------------------

test("a source that did not republish is not reported as changed data", async () => {
  const { classifyChange, sourceStamp } = await import("../changed.mjs");
  const { writeFile, mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = (await import("node:path")).default;

  const dir = await mkdtemp(path.join(tmpdir(), "caribstat-"));
  const file = path.join(dir, "doc.json");
  const base = {
    data_as_at: "2026-07-28",
    retrieved_at: "2026-08-13T10:00:00Z",
    periods: ["2024", "2025"],
    series: [{ label: "Total", observations: [{ period: "2024", value: 1 }, { period: "2025", value: 2 }] }],
  };
  await writeFile(file, JSON.stringify(base), "utf8");

  // Same content, later fetch: our bookkeeping is not news.
  assert.equal(await classifyChange(file, { ...base, retrieved_at: "2026-08-14T10:00:00Z" }), "unchanged");

  // Wider window, SAME bank stamp: our query changed, the source did not.
  // This is the exact case that reported 135 ECCB series as changed.
  const wider = { ...base, periods: ["2024", "2025", "2026"],
    series: [{ label: "Total", observations: [...base.series[0].observations, { period: "2026", value: 3 }] }] };
  assert.equal(await classifyChange(file, wider), "our-query-changed");

  // New bank stamp: the source genuinely republished.
  assert.equal(await classifyChange(file, { ...wider, data_as_at: "2026-08-28" }), "republished");

  assert.equal(sourceStamp({ published_at: "2025-03-31" }), "2025-03-31", "CBB uses published_at");
});


// --- the statistics category: monthly investments, 2014 to date -----------
//
// This is the freshest series CBB publishes and it was reported as "no data
// tables found" for three separate reasons, each of which hid the next.

test("a month-end date is a monthly period, however it is stored", () => {
  // The sheet writes its early dates as text and its later ones as Excel
  // serials. Folding only one of them gave a series whose last observation was
  // labelled 2026-04-30 while every other read 2026-04.
  assert.equal(normalisePeriod("31-Jan-2014").period, "2014-01");
  assert.equal(normalisePeriod("28-Feb-2014").period, "2014-02");
  assert.equal(normalisePeriod("29-Feb-2024").period, "2024-02", "leap year");
  assert.equal(normalisePeriod("1-Feb-2014").period, "2014-02", "month start folds too");
  assert.equal(normalisePeriod(46142).period, "2026-04", "the serial form must agree with the text form");
});

test("a mid-month date stays a full date and an impossible one is refused", () => {
  // Collapsing an arbitrary day to YYYY-MM would relabel a daily series as
  // monthly, which is a quiet lie about frequency.
  assert.equal(normalisePeriod("15-Mar-2020").period, "2020-03-15");
  assert.equal(normalisePeriod("31-Feb-2014"), undefined);
  assert.equal(normalisePeriod("Basket Weights"), undefined, "metadata rows must still be refused");
});

test("repeated column labels are qualified by their group heading", () => {
  // Row 4 spans the country groups, row 5 repeats the same three instruments
  // under each. Read flat, five series share a name and none can be selected.
  const rows = [
    [null, null, "TOTAL", null, "BARBADOS", null],
    [null, null, "Fixed Income", "Derivatives", "Fixed Income", "Derivatives"],
  ];
  const out = composeGroupedHeaders(rows, 1, 2, ["Fixed Income", "Derivatives", "Fixed Income", "Derivatives"]);
  assert.deepEqual(out, [
    "TOTAL: Fixed Income",
    "TOTAL: Derivatives",
    "BARBADOS: Fixed Income",
    "BARBADOS: Derivatives",
  ]);
});

test("labels that are already unique are left exactly alone", () => {
  // The guard that stops this change renaming every existing CBB series.
  const rows = [
    [null, null, "SOMETHING", null],
    [null, null, "Imports", "Exports"],
  ];
  const headers = ["Imports", "Exports"];
  assert.deepEqual(composeGroupedHeaders(rows, 1, 2, headers), headers);
});

test("a group row that cannot disambiguate is not applied", () => {
  // One group covering everything adds a prefix without resolving anything,
  // so the labels would still collide. Better to leave them and let the
  // sentinel complain than to invent distinctions that are not there.
  const rows = [
    [null, null, "ALL", null],
    [null, null, "Fixed Income", "Fixed Income"],
  ];
  const headers = ["Fixed Income", "Fixed Income"];
  assert.deepEqual(composeGroupedHeaders(rows, 1, 2, headers), headers);
});

test("a parenthesised revision marker is a period, not an unparseable row", () => {
  // The wages sheet ends "2016 (R)", "2017 (P)", "2018 (P)". Only a trailing
  // bare R/P was handled, so those three rows were refused and dropped — the
  // three most recent observations in a series that stops in 2018.
  for (const [raw, period] of [["2016 (R)", "2016"], ["2017 (P)", "2017"], ["2018 (p)", "2018"]]) {
    const p = normalisePeriod(raw);
    assert.equal(p?.period, period, raw);
    assert.equal(p?.revised, true, `${raw} must be flagged revised, not silently cleaned`);
    assert.equal(p?.raw, raw, "the bank's own label is carried, not rewritten");
  }
});

test("blank header cells are filled from the row above", () => {
  // CBB's wages header spans two rows: the upper names most sectors, the lower
  // names the Manufacturing sub-columns. Taking only the nearest row left
  // eleven series with an empty label, and an empty label cannot be selected.
  const rows = [
    [null, null, "Hotels", "Distribution", "Manufacturing"],
    [null, null, null, null, "Garments"],
  ];
  assert.deepEqual(
    fillBlankHeadersFromAbove(rows, 1, 2, ["", "", "Garments"]),
    ["Hotels", "Distribution", "Garments"],
    "a row that names its own column wins; only blanks are filled",
  );
});

test("filling a header does not resurrect an empty spacer column", () => {
  // The regression this guard exists for: giving a data-less trailing column a
  // borrowed name would keep it as a series of nulls.
  const sheet = {
    name: "S",
    rows: [
      [null, "Period", "Real", "Also Real", "Spacer"],
      [null, 2020, 1, 10, null],
      [null, 2021, 2, 20, null],
      [null, 2022, 3, 30, null],
      [null, 2023, 4, 40, null],
      [null, 2024, 5, 50, null],
    ],
  };
  const t = extractSheet(sheet);
  assert.deepEqual(t.series.map((s) => s.label), ["Real", "Also Real", "Spacer"], "a column the sheet itself named is kept");
  const sheet2 = JSON.parse(JSON.stringify(sheet));
  sheet2.rows[0] = [null, "Period", "Real", "Also Real", null];
  const t2 = extractSheet(sheet2);
  assert.deepEqual(t2.series.map((s) => s.label), ["Real", "Also Real"], "an unnamed, data-less column stays dropped");
});

// --- a date column is not a statistic -------------------------------------
//
// The depository-corporations sheets put an "End of Period" column of Excel
// date serials beside the month labels. Served as data it became a series of
// five-figure numbers indistinguishable from statistics. CBB's own serials are
// MISALIGNED with their month labels (the row reading "January 2007" carries a
// serial for January 2012), so comparing the column against the period axis
// does not identify it.

const monthly = (start, n, step = 30.4) =>
  Array.from({ length: n }, (_, i) => ({ period: `2012-${String((i % 12) + 1).padStart(2, "0")}`, value: Math.round(start + i * step) }));

test("a date column is dropped by its header", () => {
  assert.equal(isDateColumn("End of Period", monthly(40909, 24)), true);
  assert.equal(isDateColumn("Period", monthly(40909, 24)), true);
  assert.equal(isDateColumn("date", monthly(40909, 24)), true);
});

test("an unlabelled date column is caught by its calendar step", () => {
  // Loans&Deposits carries this column with no header at all.
  assert.equal(isDateColumn("", monthly(42705, 170)), true);
});

test("a real statistic in the same numeric range is NOT dropped", () => {
  // The guard must not eat a monetary series that happens to sit in the
  // 40,000s. Real series do not advance by one month of days every month.
  const jumpy = monthly(41000, 40).map((o, i) => ({ ...o, value: o.value + (i % 7) * 900 }));
  assert.equal(isDateColumn("Total Deposits", jumpy), false);
  // A steady series with the wrong step size is also safe.
  assert.equal(isDateColumn("Reserves", monthly(41000, 40, 120)), false);
  // And anything outside the modern serial range.
  assert.equal(isDateColumn("Debt EC$M", monthly(900, 40)), false);
});

test("a short column is never guessed at", () => {
  assert.equal(isDateColumn("", monthly(42705, 6)), false, "six points is not a calendar");
});

test("Month YYYY labels parse, prose does not", () => {
  assert.equal(normalisePeriod("January 2007").period, "2007-01");
  assert.equal(normalisePeriod("Feb 2026").period, "2026-02");
  assert.equal(normalisePeriod("Source: Central Bank of Barbados"), undefined);
  assert.equal(normalisePeriod("Basket Weights"), undefined);
});

test("the extractor records how much of the sheet its axis accounts for", () => {
  // The wrong-axis failure is invisible in the values (real numbers, real
  // labels, invented dates). Coverage is the one signal that shows it, so it
  // has to be recorded for the ingest sentinel to test.
  const sheet = {
    name: "S",
    rows: [
      [null, "Period", "A", "B"],
      ...Array.from({ length: 20 }, (_, i) => [null, `January ${2000 + i}`, i, i * 2]),
    ],
  };
  const t = extractSheet(sheet);
  assert.equal(t.periods.length, 20);
  assert.equal(t.axis_coverage, 1, "every numeric row is dated");
});
