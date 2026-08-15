// One sheet, one period format.
//
// These cover a defect that sat in three live sheets at once — tourism, an
// inflation table and the investments sheet — without tripping anything,
// because every individual label was defensible on its own. Only the SHAPE OF
// THE SERIES was wrong. Each case below is the real data, verified against the
// workbook's own number formats rather than inferred from the values.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalisePeriod } from "./tables.mjs";
import { validateTable } from "./ingest.mjs";
import { isMonthYearFormat, parseStyles } from "../xlsx.mjs";

// --- reading the format, not the value ------------------------------------

test("a month-and-year format is recognised, with locale prefix and escapes", () => {
  // The two real codes: tourism and the inflation tables.
  assert.equal(isMonthYearFormat("[$-409]mmmm\\-yy;@"), true);
  assert.equal(isMonthYearFormat("mmmm\\ yyyy"), true);
  assert.equal(isMonthYearFormat("mmm-yy"), true);
});

test("a format carrying a day is NOT month-only", () => {
  // The investments sheet's real code. Getting this wrong would throw away a
  // genuine day component that the bank does display.
  assert.equal(isMonthYearFormat("[$-409]d\\-mmm\\-yyyy;@"), false);
  assert.equal(isMonthYearFormat("m/d/yyyy"), false);
  assert.equal(isMonthYearFormat("d-mmm"), false);
});

test("a quoted literal 'd' does not count as a day token", () => {
  assert.equal(isMonthYearFormat('mmmm "d" yyyy'), true);
});

test("a time format is not a month format, even though it contains m", () => {
  assert.equal(isMonthYearFormat("h:mm"), false);
  assert.equal(isMonthYearFormat("[h]:mm:ss"), false);
});

test("an accounting or general format is not a month format", () => {
  assert.equal(isMonthYearFormat("_(* #,##0_);_(* (#,##0);_(* \"-\"??_);_(@_)"), false);
  assert.equal(isMonthYearFormat(""), false);
  assert.equal(isMonthYearFormat(undefined), false);
});

test("styles resolve from cellXfs, NOT from cellStyleXfs", () => {
  // styles.xml carries both blocks and cellStyleXfs comes FIRST. Reading the
  // wrong one reported the tourism period column as an accounting number
  // format when it is really a date format, which pointed the whole
  // investigation at the wrong cause for a while.
  const xml = `<styleSheet>
    <numFmts count="1"><numFmt numFmtId="164" formatCode="[$-409]mmmm\\-yy;@"/></numFmts>
    <cellStyleXfs count="2"><xf numFmtId="0"/><xf numFmtId="43"/></cellStyleXfs>
    <cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs>
  </styleSheet>`;
  const formats = parseStyles(xml);
  assert.equal(formats.length, 2, "should read the two cellXfs entries, not the two cellStyleXfs entries");
  assert.equal(formats[1], "[$-409]mmmm\\-yy;@");
  assert.equal(isMonthYearFormat(formats[1]), true);
});

test("a built-in month-year format id resolves without a custom numFmt", () => {
  assert.equal(isMonthYearFormat(parseStyles(`<cellXfs count="1"><xf numFmtId="17"/></cellXfs>`)[0]), true);
  assert.equal(isMonthYearFormat(parseStyles(`<cellXfs count="1"><xf numFmtId="15"/></cellXfs>`)[0]), false);
});

// --- folding the day when the format says the day is not shown -------------

test("a mid-month serial folds to YYYY-MM when its format shows no day", () => {
  // 45661 is 2025-01-04, displayed by the tourism workbook as "January-25".
  assert.equal(normalisePeriod(45661, { monthOnly: true }).period, "2025-01");
  assert.equal(normalisePeriod(45812, { monthOnly: true }).period, "2025-06");
});

test("the same serial keeps its day when the format DOES show one", () => {
  // Without the format saying otherwise, a 4th-of-the-month date is a date.
  // This is the guard against folding arbitrary days by default.
  assert.equal(normalisePeriod(45661).period, "2025-01-04");
});

test("the tourism column's drift from the 1st to the 4th all folds to months", () => {
  // The real sequence: month-start, then drifting, then the 4th forever. Read
  // as dates this is a wandering day; read through the format it is 6 months.
  const serials = [44805, 44836, 44868, 44899, 44930, 44961];
  const got = serials.map((s) => normalisePeriod(s, { monthOnly: true }).period);
  assert.deepEqual(got, ["2022-09", "2022-10", "2022-11", "2022-12", "2023-01", "2023-02"]);
});

test("28 February is month-end even in a leap year", () => {
  // 45350 is 2024-02-28. February 2024 ended on the 29th, so the plain
  // month-end rule missed it and left one label in 148 as a full date.
  assert.equal(normalisePeriod(45350).period, "2024-02");
  // The surrounding real month-ends must keep working.
  assert.equal(normalisePeriod(45322).period, "2024-01");
  assert.equal(normalisePeriod(45473).period, "2024-06");
});

test("a genuine mid-month date with no month-only format is still not folded", () => {
  // 45351 is 2024-02-29, the real last day, and folds. 45338 is 2024-02-16 and
  // must NOT: nothing here says it means the month.
  assert.equal(normalisePeriod(45351).period, "2024-02");
  assert.equal(normalisePeriod(45338).period, "2024-02-16");
});

test("the bare-year guard still wins over the serial path", () => {
  // Serial 2010 really is 1905, and this collision corrupted the GDP sheet
  // before. A year in range stays a year.
  assert.equal(normalisePeriod(2010).period, "2010");
});

// --- the sentinel ----------------------------------------------------------

const tableWith = (periods) => ({
  periods,
  series: [{ label: "x", observations: periods.map((p) => ({ period: p, value: 1 })) }],
});

test("SENTINEL fires when one series carries two period formats", () => {
  const problems = validateTable(tableWith(["2022-01", "2022-02", "2025-01-04"]), "2025-09-16");
  assert.equal(problems.length > 0, true, "the sentinel must fire");
  assert.match(problems.join(" "), /different formats/);
  assert.match(problems.join(" "), /2025-01-04/, "should name the odd label so the cause is findable");
});

test("SENTINEL passes a series that uses one format throughout", () => {
  // Proving the check is not simply always-on: the fixed tourism shape passes.
  assert.deepEqual(validateTable(tableWith(["2022-01", "2022-02", "2025-01"]), "2025-09-16"), []);
  assert.deepEqual(validateTable(tableWith(["2019", "2020", "2021"]), "2025-09-16"), []);
  assert.deepEqual(validateTable(tableWith(["2024-Q1", "2024-Q2"]), "2025-09-16"), []);
});

test("SENTINEL still reports the 1900s collision it already guarded", () => {
  // The new check must not have displaced the old one.
  const problems = validateTable(tableWith(["1905-07-02", "1905-08-02"]), "2025-09-16");
  assert.match(problems.join(" "), /1900s/);
});
