// CBB workbook -> series extraction.
//
// The three workbook families inspected live on 2026-08-13 share no layout:
//
//   GDP        header at row 5, "Period" in column 0, sectors to the right,
//              period labels like "2006R" (R = REVISED)
//   Tourism    header at row 5 but shifted one column right, "Period" in
//              column 1, period labels as EXCEL SERIAL NUMBERS (44562)
//   Inflation  a TOC sheet plus 13 data sheets, dates as serials in some
//              columns and as text ("1Q 1965") in others
//
// So extraction is ANCHORED, never positional: find the cell that says
// "Period", and read the table relative to it. A fixed row/column offset would
// work on GDP and silently shear tourism by one column — the failure mode that
// produces plausible numbers under the wrong headings.

/** Excel serial date -> ISO. Epoch is 1899-12-30 because Excel wrongly treats
 * 1900 as a leap year and the offset absorbs it. Values below 1000 are far more
 * likely to be counts or index values than dates in the 1900s, so they are left
 * alone rather than silently turned into Edwardian timestamps. */
export function excelSerialToISO(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1000 || n > 80000) return undefined;
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * Normalise a CBB period cell.
 * Returns { period, raw, revised } — `raw` always preserves what the sheet
 * said, and `revised` records the R suffix rather than discarding it, because
 * "2006R" is the bank telling you the figure has been revised and dropping
 * that turns a qualified number into an unqualified one.
 */
export function normalisePeriod(cell) {
  if (cell == null || cell === "") return undefined;
  if (typeof cell === "number") {
    // A BARE YEAR IS ALSO A VALID EXCEL SERIAL, and that collision silently
    // corrupts data: the GDP sheet's 2010 was being rendered as "1905-07-02"
    // (serial 2010 really is 1905). Anything in a plausible calendar-year range
    // is a year — no statistical table published today carries daily
    // observations from 1905, whereas annual tables labelled 2006-2023 are
    // everywhere. Found live 2026-08-13.
    if (Number.isInteger(cell) && cell >= 1900 && cell <= 2100) {
      return { period: String(cell), raw: cell, revised: false };
    }
    const iso = excelSerialToISO(cell);
    if (!iso) return undefined;
    // Monthly/quarterly publications land on the 1st; keep YYYY-MM for those.
    return { period: iso.endsWith("-01") ? iso.slice(0, 7) : iso, raw: cell, revised: false };
  }
  const s = String(cell).trim();
  if (!s) return undefined;
  const revised = /[RP]$/.test(s) && /\d/.test(s);
  const bare = revised ? s.slice(0, -1).trim() : s;
  // "1Q 1965" / "Q1 1965" -> 1965-Q1
  const q = /^(?:(\d)Q\s*(\d{4})|Q(\d)\s*(\d{4}))$/i.exec(bare);
  if (q) return { period: `${q[2] ?? q[4]}-Q${q[1] ?? q[3]}`, raw: s, revised };
  if (/^\d{4}$/.test(bare)) return { period: bare, raw: s, revised };
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(bare)) return { period: bare, raw: s, revised };
  if (/^\d{4}-Q[1-4]$/i.test(bare)) return { period: bare.toUpperCase(), raw: s, revised };
  // REJECT anything that is not recognisably a period. Passing free text
  // through silently admitted metadata rows as observations — CBB's inflation
  // sheets carry "Basket Weights" and "BASE YEAR" rows between the header and
  // the data, and those were being recorded as periods with real numbers
  // attached. A row we cannot date is not an observation, and inventing one is
  // worse than skipping it. Skips are counted by the caller so they stay visible.
  return undefined;
}

/** Locate the header row by the label cell that starts the period column.
 * ECCB-style "Period" is not universal: CBB's inflation sheets say "Period
 * Ended", and a Period-only matcher silently found NO table in a 2.3MB
 * workbook of 13 data sheets — reported as "0 tables" rather than as an error,
 * which is exactly the kind of quiet nothing this project treats as a bug. */
export function findHeaderAnchor(rows, { labelWords = ["period", "period ended", "date", "year", "month", "quarter"] } = {}) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (typeof v === "string" && labelWords.includes(v.trim().toLowerCase())) {
        // Require at least two named columns to the right, or this is a stray
        // "Period" in prose rather than a table header.
        const named = row.slice(c + 1).filter((x) => typeof x === "string" && x.trim() !== "").length;
        if (named >= 2) return { row: r, col: c, headers: row.slice(c + 1).map((x) => (x == null ? "" : String(x).trim())) };
      }
    }
  }
  return undefined;
}

/**
 * Fallback anchor for sheets with NO period label at all.
 *
 * CBB's wages index simply starts a column of years (1970, 1971, …) under a
 * blank header, and its series names sit on an earlier row. A label-only
 * matcher finds nothing and the whole publication is reported as "no data
 * tables" — a quiet nothing.
 *
 * The rule is deliberately strict rather than clever: a column must contain a
 * RUN OF AT LEAST 5 CONSECUTIVE parseable periods before it is believed to be
 * a period axis. Five consecutive dates in one column is a time series; one or
 * two is a coincidence, and guessing from a coincidence is how a parser
 * invents a table that was never there.
 */
export function findPeriodRunAnchor(rows, { minRun = 5, maxScanCols = 12 } = {}) {
  let best;
  for (let c = 0; c < maxScanCols; c++) {
    let run = 0;
    let start = -1;
    for (let r = 0; r < rows.length; r++) {
      // A period is only believed here if it is PLAUSIBLE for a modern
      // statistical publication. Without this the fallback happily adopts a
      // column of ordinary numbers (2135, 2989) as a period axis, converts
      // them as Excel serials and yields 1905-11-05 — which the sentinel then
      // rejects, losing the whole sheet. Declining to anchor is better than
      // anchoring on the wrong column.
      const p = normalisePeriod((rows[r] ?? [])[c]);
      const ok = Boolean(p) && !/^19[0-4]\d/.test(String(p.period));
      if (ok) {
        if (run === 0) start = r;
        run++;
        if (run >= minRun && (!best || run > best.run)) best = { col: c, firstDataRow: start, run };
      } else if (run > 0 && run < minRun) {
        run = 0;
      }
    }
  }
  if (!best) return undefined;
  // Header row: the nearest row ABOVE the data with two or more text labels to
  // the right of the period column.
  for (let r = best.firstDataRow - 1; r >= 0 && r >= best.firstDataRow - 8; r--) {
    const row = rows[r] ?? [];
    const named = row.slice(best.col + 1).filter((x) => typeof x === "string" && x.trim() !== "").length;
    if (named >= 2) {
      return { row: r, col: best.col, headers: row.slice(best.col + 1).map((x) => (x == null ? "" : String(x).trim())) };
    }
  }
  return undefined;
}

/**
 * Extract series from one sheet.
 * Returns { anchor, periods, series[] } or undefined when no table is found —
 * undefined is an honest "this sheet is not a data table", not an empty table.
 */
export function extractSheet(sheet) {
  // Labelled anchor first; the period-run fallback only when there is no label.
  const anchor = findHeaderAnchor(sheet.rows) ?? findPeriodRunAnchor(sheet.rows);
  if (!anchor) return undefined;

  const periods = [];
  const rawPeriods = [];
  const revisedFlags = [];
  const valueRows = [];
  const skippedRows = [];

  for (let r = anchor.row + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const p = normalisePeriod(row[anchor.col]);
    if (!p) {
      // Only count a skip when the cell had content — blank spacer rows are
      // not anomalies worth reporting.
      if (row[anchor.col] != null && String(row[anchor.col]).trim() !== "") skippedRows.push(String(row[anchor.col]).slice(0, 40));
      continue;
    }
    // A row whose value cells are all empty is a spacer, not an observation.
    const values = anchor.headers.map((_, i) => {
      const v = row[anchor.col + 1 + i];
      return typeof v === "number" ? v : null;
    });
    if (values.every((v) => v === null)) continue;
    periods.push(p.period);
    rawPeriods.push(p.raw);
    revisedFlags.push(p.revised);
    valueRows.push(values);
  }
  if (periods.length === 0) return undefined;

  const series = anchor.headers
    .map((label, i) => ({
      label,
      observations: periods.map((p, r) => ({ period: p, value: valueRows[r][i] })),
    }))
    // Drop columns with no header AND no data — trailing spacer columns.
    .filter((s) => s.label !== "" || s.observations.some((o) => o.value !== null));

  return {
    anchor: { row: anchor.row, col: anchor.col },
    periods,
    periods_raw: rawPeriods,
    // Which periods the bank marked revised/provisional. Carried, not dropped.
    revised_periods: periods.filter((_, i) => revisedFlags[i]),
    // Label cells that looked like data rows but could not be dated. Surfaced
    // rather than silently dropped, so a real period format we failed to
    // recognise shows up as a number instead of vanishing.
    unparsed_labels: skippedRows,
    series,
  };
}

/**
 * TRANSPOSED extraction: periods across a header ROW, series down the rows.
 *
 * CBB is not internally consistent about orientation. GDP, tourism, inflation
 * and labour put periods down a column; the balance-of-payments workbook puts
 * years across row 2 (1967, 1968, …) with line items down the side — the same
 * orientation ECCB uses. Reading that sheet with the column-oriented parser
 * finds no period column and reports "no data tables", losing 15 sheets of
 * balance-of-payments history back to 1967.
 *
 * Requires FIVE consecutive parseable periods in a row before believing it is
 * a period header, for the same reason the column fallback does: five is a
 * series, two is a coincidence.
 */
export function extractTransposed(sheet, { minRun = 5 } = {}) {
  const rows = sheet.rows ?? [];
  // Build period -> DATA COLUMN, honouring merged header cells.
  //
  // CBB's balance-of-payments sheets anchor a merged year header at the LEFT of
  // its span: row 2 reads 1967, blank, 1968, 1969... while the values for 1967
  // sit in column 1, not column 0. Reading the header column as the data column
  // shifts the first year's figures onto the label column and drops a year off
  // the end. Treating the blank as "no period here" instead loses 11 of 15
  // sheets. The span rule handles both: a period's data column is the LAST
  // column of its merge span (itself plus any blanks up to the next period).
  let header;
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] ?? [];
    const found = [];
    for (let c = 0; c < row.length; c++) {
      const p = normalisePeriod(row[c]);
      if (p && !/^19[0-4]\d-/.test(String(p.period))) found.push({ c, p });
    }
    if (found.length < minRun) continue;
    const cols = [];
    for (let i = 0; i < found.length; i++) {
      const { c, p } = found[i];
      const next = found[i + 1]?.c ?? row.length;
      // Extend across trailing blanks in the header up to the next period.
      let end = c;
      while (end + 1 < next && (row[end + 1] == null || String(row[end + 1]).trim() === "")) end++;
      cols.push({ dataCol: end, period: p.period, raw: p.raw });
    }
    const labelCol = Math.min(...cols.map((x) => x.dataCol)) - 1;
    if (labelCol < 0) continue;
    header = { row: r, cols, labelCol };
    break;
  }
  if (!header) return undefined;

  const labelCol = header.labelCol;
  const series = [];
  for (let r = header.row + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const label = row[labelCol];
    if (typeof label !== "string" || label.trim() === "") continue;
    const observations = header.cols.map(({ period, dataCol }) => {
      const v = row[dataCol];
      return { period, value: typeof v === "number" ? v : null };
    });
    if (observations.every((o) => o.value === null)) continue;
    series.push({ label: label.trim(), observations });
  }
  if (series.length === 0) return undefined;

  return {
    anchor: { row: header.row, col: labelCol, orientation: "transposed" },
    periods: header.cols.map((x) => x.period),
    periods_raw: header.cols.map((x) => x.raw),
    revised_periods: [],
    unparsed_labels: [],
    series,
  };
}

/** Extract every data sheet in a workbook. Sheets with no table are reported
 * as skipped WITH their name, so a silently-missing sheet is visible. */
export function extractWorkbook(wb) {
  const sheets = [];
  const skipped = [];
  for (const s of wb.sheets) {
    // Column-oriented first (the common CBB shape), then transposed.
    const t = extractSheet(s) ?? extractTransposed(s);
    if (t) sheets.push({ name: s.name, ...t });
    else skipped.push(s.name);
  }
  return { sheets, skipped };
}
