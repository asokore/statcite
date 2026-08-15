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
export function normalisePeriod(cell, { monthOnly = false } = {}) {
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
    // Monthly/quarterly publications land on the 1st OR on the month end; keep
    // YYYY-MM for both. The month-end half matters: the CBB investments sheet
    // writes its early dates as text ("31-Jan-2014") and its later ones as
    // Excel serials, so folding only one of them left a single series whose
    // final observation was labelled 2026-04-30 while every other read 2026-04.
    // A period format that changes partway through a series is worse than
    // either format on its own.
    const [yy, mm, dd] = iso.split("-").map(Number);
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    // The cell's own number format says month-and-year with no day, so the day
    // component is not something the bank ever shows and must not become part
    // of the period. This is the ONLY rule here that folds an arbitrary day,
    // and it is allowed to because the format is evidence rather than a guess:
    // the tourism column drifts 1st -> 2nd -> 3rd -> 4th while every cell
    // displays as "January-22". See isMonthYearFormat in tools/xlsx.mjs.
    if (monthOnly) return { period: iso.slice(0, 7), raw: cell, revised: false };
    // 28 February counts as month-end even in a leap year. The CBB investments
    // sheet (B2F) is a month-end series whose neighbours are 2024-01-31 and
    // 2024-03-31, and it writes February 2024 as the 28th although that year's
    // last day is the 29th. Without this, one observation in 148 kept a
    // YYYY-MM-DD label while the rest were months.
    const monthEnd = dd === lastDay || (mm === 2 && dd === 28);
    return { period: dd === 1 || monthEnd ? iso.slice(0, 7) : iso, raw: cell, revised: false };
  }
  const s = String(cell).trim();
  if (!s) return undefined;
  // Revision markers come in two forms and only one was handled. The wages
  // sheet writes "2016 (R)", "2017 (P)", "2018 (P)", and those three rows were
  // being refused as unparseable and dropped — silently losing the three most
  // recent observations in the series, which are the ones anyone asking about
  // wages actually wants.
  const paren = /^(.*?)\s*\(([RP])\)$/i.exec(s);
  const revised = paren ? true : /[RP]$/.test(s) && /\d/.test(s);
  const bare = paren ? paren[1].trim() : revised ? s.slice(0, -1).trim() : s;
  // "1Q 1965" / "Q1 1965" -> 1965-Q1
  const q = /^(?:(\d)Q\s*(\d{4})|Q(\d)\s*(\d{4}))$/i.exec(bare);
  if (q) return { period: `${q[2] ?? q[4]}-Q${q[1] ?? q[3]}`, raw: s, revised };
  if (/^\d{4}$/.test(bare)) return { period: bare, raw: s, revised };
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(bare)) return { period: bare, raw: s, revised };
  if (/^\d{4}-Q[1-4]$/i.test(bare)) return { period: bare.toUpperCase(), raw: s, revised };
  // "31-Jan-2014" / "1-Feb-2014". The CBB investments workbook (statistics
  // category, the freshest series this source publishes) stamps each MONTHLY
  // observation with its month-end date, and without this the sheet has no
  // recognisable period column at all and the whole 2014-to-date table was
  // reported as "no data tables found".
  //
  // A month-end or month-start stamp is folded to YYYY-MM, matching the rule
  // the numeric branch already applies to serial dates landing on the 1st. Any
  // other day is kept as a full date rather than being silently collapsed,
  // because a genuinely daily series must not be relabelled monthly.
  // "January 2007" / "Feb 2026". The depository-corporations workbook labels
  // every month this way down column 0. Without it that column parsed to
  // NOTHING, the period-run search fell through to a neighbouring column of
  // Excel serials that is not a period axis at all (it repeats values and has
  // no header), and the sheet was served with 87 invented periods attached to
  // real numbers instead of its actual 230 months. Fabricated periods on real
  // figures is the worst failure this pipeline can produce, so this format is
  // covered by tests both ways.
  const my = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(bare);
  if (my) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mi = months.indexOf(my[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return { period: `${my[2]}-${String(mi + 1).padStart(2, "0")}`, raw: s, revised };
  }
  const dmy = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/.exec(bare);
  if (dmy) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mi = months.indexOf(dmy[2].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const year = Number(dmy[3]);
      const day = Number(dmy[1]);
      const lastDay = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
      const mm = String(mi + 1).padStart(2, "0");
      if (day < 1 || day > lastDay) return undefined;
      const period = day === 1 || day === lastDay ? `${year}-${mm}` : `${year}-${mm}-${String(day).padStart(2, "0")}`;
      return { period, raw: s, revised };
    }
  }
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
/**
 * Qualify repeated column labels with the group heading above them.
 *
 * The CBB investments sheet is two-level: row 4 reads TOTAL, BARBADOS, USA,
 * CARICOM AND WIDER CARIBBEAN across the span of each block, and row 5 repeats
 * "Fixed Income Securities / Shares & Other Equity / Derivatives" underneath
 * every one. Read flat, the sheet yields five identically named series and no
 * way to tell a Barbados holding from a US one — and StatCite's row selector
 * refuses an ambiguous prefix, so the series become unreachable rather than
 * merely confusing.
 *
 * Applied ONLY when the flat labels actually repeat. A sheet whose labels are
 * already unique is left exactly as it was, so no existing series is renamed.
 */
export function composeGroupedHeaders(rows, headerRow, firstHeaderCol, headers) {
  const named = headers.filter((h) => h !== "");
  if (new Set(named).size === named.length) return headers;
  // A heading runs rightwards until the next heading ON ITS OWN ROW, and NOT
  // past a heading on a row above it. The second half matters: the
  // trade-in-goods sheet is three levels deep, with CONSUMER GOODS and
  // INTERMEDIATE GOODS on one row and NON-DURABLE / DURABLE / TOTAL CONSUMER
  // on the next. A plain forward fill carried "TOTAL CONSUMER" across the
  // intermediate and capital columns and produced "TOTAL CONSUMER: TOTAL
  // CAPITAL", filing capital goods under consumer goods. The independent
  // auditor caught that before it was published.
  const fillRow = (r) => {
    const row = rows[r] ?? [];
    const breaks = new Set();
    for (let above = r - 1; above >= 0 && above >= r - 3; above--) {
      const ar = rows[above] ?? [];
      for (let i = 0; i < headers.length; i++) {
        const cell = ar[firstHeaderCol + i];
        if (typeof cell === "string" && cell.trim() !== "") breaks.add(i);
      }
    }
    const out = [];
    let current = "";
    for (let i = 0; i < headers.length; i++) {
      const cell = row[firstHeaderCol + i];
      if (typeof cell === "string" && cell.trim() !== "") current = cell.trim();
      else if (breaks.has(i)) current = "";
      out.push(current);
    }
    return out;
  };

  // Nearest row wins; a column it does not cover falls back to the row above,
  // so "Fuel" is grouped by INTERMEDIATE GOODS rather than left bare.
  const groups = new Array(headers.length).fill("");
  for (let r = headerRow - 1; r >= 0 && r >= headerRow - 3; r--) {
    const filled = fillRow(r);
    for (let i = 0; i < groups.length; i++) if (!groups[i] && filled[i]) groups[i] = filled[i];
  }
  if (new Set(groups.filter(Boolean)).size < 2) return headers;
  const composed = headers.map((h, i) => (h && groups[i] ? `${groups[i]}: ${h}` : h));
  const c = composed.filter((h) => h !== "");
  if (new Set(c).size === c.length) return composed;
  return headers;
}

/**
 * Fill blank header cells from the nearest row above that names them.
 *
 * CBB's wages sheet splits one header across two rows: row 4 names most
 * sectors, row 5 names the Manufacturing sub-columns. The anchor search takes
 * the NEAREST row with two or more labels, which is row 5, so eleven columns
 * arrived with an empty name. Empty-named series are not merely untidy, they
 * are unselectable: StatCite picks a row by label, so those eleven were served
 * as anonymous numbers.
 *
 * Only blanks are filled, so a row that names its own column always wins.
 */
export function fillBlankHeadersFromAbove(rows, headerRow, firstCol, headers) {
  const out = [...headers];
  for (let r = headerRow - 1; r >= 0 && r >= headerRow - 3; r--) {
    const row = rows[r] ?? [];
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== "") continue;
      const cell = row[firstCol + i];
      if (typeof cell === "string" && cell.trim() !== "") out[i] = cell.trim();
    }
  }
  return out;
}

/**
 * Is this column a DATE column rather than an observation series?
 *
 * The depository-corporations sheets carry an "End of Period" column of Excel
 * date serials (40909, 42705 …) beside the month labels. Read as data it
 * becomes a series of five-figure numbers that look like statistics and are
 * not.
 *
 * Two independent signatures, because one alone is not enough here:
 *
 *  - the header names a date concept. Cheap and exact.
 *  - the values step like a calendar. Consecutive differences of roughly 28
 *    to 31 across a long run, inside the modern serial range, is a month
 *    ticking over. A monetary series does not advance by almost exactly one
 *    month's worth of days every month for fourteen years.
 *
 * The second matters because one of these columns is UNLABELLED, and the
 * first because CBB's own serial column is misaligned with its month labels
 * (the row reading "January 2007" carries a serial for January 2012), so
 * comparing the column against the period axis does not identify it.
 */
const DATE_HEADERS = new Set(["end of period", "period", "period ended", "date", "month", "year", "quarter"]);

export function isDateColumn(label, observations) {
  if (DATE_HEADERS.has(String(label ?? "").trim().toLowerCase())) return true;
  const vals = observations.map((o) => o.value).filter((v) => typeof v === "number");
  if (vals.length < 12) return false;
  // Modern Excel serials only: 36526 is 2000-01-01, 49309 is 2035-01-01.
  if (!vals.every((v) => v >= 36526 && v <= 49309)) return false;
  const steps = [];
  for (let i = 1; i < vals.length; i++) steps.push(vals[i] - vals[i - 1]);
  const nonDecreasing = steps.every((d) => d >= 0);
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return nonDecreasing && median >= 27 && median <= 32;
}

export function extractSheet(sheet) {
  // Labelled anchor first; the period-run fallback only when there is no label.
  const anchor = findHeaderAnchor(sheet.rows) ?? findPeriodRunAnchor(sheet.rows);
  if (!anchor) return undefined;
  // Remember which columns the sheet itself named, so a filled-in label
  // cannot resurrect an empty spacer column as an all-null series.
  const namedBySheet = anchor.headers.map((h) => h !== "");
  anchor.headers = fillBlankHeadersFromAbove(sheet.rows, anchor.row, anchor.col + 1, anchor.headers);
  anchor.headers = composeGroupedHeaders(sheet.rows, anchor.row, anchor.col + 1, anchor.headers);

  const periods = [];
  const rawPeriods = [];
  const revisedFlags = [];
  const valueRows = [];
  const skippedRows = [];

  for (let r = anchor.row + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const p = normalisePeriod(row[anchor.col], { monthOnly: sheet.monthOnly?.has(`${r}:${anchor.col}`) });
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
    // Drop columns with no data unless the sheet itself named them. Without
    // the namedBySheet test, a label filled in from the row above would keep a
    // trailing spacer column alive as a series of nulls.
    .filter((s, i) => (s.label !== "" && namedBySheet[i]) || s.observations.some((o) => o.value !== null))
    // A date column is not an observation series, however it is labelled.
    .filter((s) => !isDateColumn(s.label, s.observations));

  // How much of the sheet the chosen axis actually accounts for.
  //
  // The wrong-axis failure is invisible in the values: they are real numbers
  // under real labels, only the dates are invented. What it DOES show is
  // coverage — the bad read of the depository-corporations sheet dated 87 of
  // its 230 numeric rows, a coverage of 0.38, while every correctly-read CBB
  // sheet measured 0.87 to 1.00. That gap is the detectable signature.
  // Count only rows carrying a number OUTSIDE the period column. Counting the
  // period cell itself would treat a fully-empty row as data whenever the
  // sheet stamps a date on it: the industrial-production sheet carries 158
  // dated rows whose every value is the string "NA", and those made a
  // correctly-read sheet measure 0.56 and fail this gate.
  let numericRows = 0;
  for (let r = anchor.row + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    if (row.some((c, i) => i !== anchor.col && typeof c === "number")) numericRows++;
  }

  return {
    anchor: { row: anchor.row, col: anchor.col },
    axis_coverage: numericRows ? periods.length / numericRows : undefined,
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
      const p = normalisePeriod(row[c], { monthOnly: sheet.monthOnly?.has(`${r}:${c}`) });
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
