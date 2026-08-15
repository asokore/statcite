// Minimal XLSX reader — zero dependencies.
//
// An .xlsx is a ZIP of XML parts. Node ships zlib but no ZIP reader, so this
// implements just enough of the format to get cell values out:
//
//   1. Locate the End Of Central Directory record (EOCD) by scanning backwards
//      for its signature.
//   2. Walk the central directory for entry names, compression methods and
//      local-header offsets.
//   3. For each wanted entry, skip its local header and inflate (method 8) or
//      copy (method 0) the bytes.
//
// Deliberately dependency-free. This pipeline's whole value is that a number
// can be traced to a bank's own published table; adding an opaque third-party
// parser to the trust chain for the sake of ~120 lines is a poor trade, and it
// is one more supply-chain surface on a machine that already had one API key
// quietly drained.
//
// SCOPE: reads values. It does not evaluate formulas — a cached formula result
// is read as the value, which is what the bank published. It does not apply
// number formats, so dates arrive as Excel serial numbers and the caller
// converts if it needs to.

import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

/** Parse the ZIP container into a Map of entry name -> raw bytes. */
export function unzip(buf) {
  // EOCD is at the end, but a trailing comment can push it back up to 64KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file: no end-of-central-directory record found");

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const out = new Map();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== CEN_SIG) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);

    // The local header repeats name/extra lengths, and its extra field can
    // differ in length from the central one — always read the LOCAL values.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decodeEntities = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
   .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
   .replace(/&amp;/g, "&"); // last: an escaped &amp;lt; must not become <

/** Shared strings table. Runs (<r><t>) are concatenated, which is how Excel
 * renders a cell whose text carries mixed formatting. */
export function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeEntities(t[1])).join(""),
  );
}

const colToIndex = (ref) => {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/**
 * Parse one worksheet into a dense array of rows of cell values.
 * Strings come back as strings, numbers as numbers, blanks as null.
 */
export function parseSheet(xml, shared = [], { monthOnlyStyles, monthOnly } = {}) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = Number(rm[1]) - 1;
    const cells = [];
    // A cell may be self-closing (`<c r="A9" s="14"/>`), which Excel emits for
    // a blank cell that still carries formatting. Requiring `</c>` made such a
    // cell swallow the NEXT one: the match ran on to the following cell's
    // closing tag, so the empty cell took its neighbour's <v> as its own value
    // and the neighbour disappeared. On the CBB investments workbook that put
    // raw shared-string indices (15, 16, 17 …) in the label column and deleted
    // every date, which is why the whole sheet read as having no data table.
    for (const cm of rm[2].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const body = cm[2] ?? "";
      let value = null;
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeEntities(t[1])).join("");
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (v != null) {
          if (type === "s") value = shared[Number(v)] ?? null;
          else if (type === "str" || type === "e") value = decodeEntities(v);
          else {
            const n = Number(v);
            value = Number.isFinite(n) ? n : decodeEntities(v);
          }
        }
      }
      const ci = ref ? colToIndex(ref) : cells.length;
      cells[ci] = value === "" ? null : value;
      // Record cells whose FORMAT says month-and-year. Only numbers qualify:
      // a serial is the only thing whose displayed month can differ from what
      // a naive date conversion would produce.
      if (monthOnly && typeof value === "number") {
        const sIdx = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? -1);
        if (sIdx >= 0 && monthOnlyStyles?.has(sIdx)) monthOnly.add(`${rowIdx}:${ci}`);
      }
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    rows[rowIdx] = cells;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** Excel's built-in number formats that matter here. Only 17 is month-and-year
 * with no day; the rest are listed so a day-bearing builtin is not mistaken for
 * one. Anything not listed resolves to "" and is treated as not-a-month-format,
 * which fails toward keeping the full date rather than inventing a month. */
const BUILTIN_FORMATS = {
  14: "m/d/yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
  18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm",
};

/**
 * Does this number-format code display a month and a year but NO day?
 *
 * This is the question that decides whether an Excel serial is a MONTH or a
 * DATE, and it has to be asked of the format rather than of the value. The CBB
 * tourism sheet stores its period column as serials that drift from the 1st to
 * the 4th of the month (2022-09-01, 2022-10-02, 2022-11-03, 2022-12-04, then
 * the 4th forever). Read as dates that is a series with a wandering day; read
 * through its format, `[$-409]mmmm\-yy;@`, every one of them displays to a
 * human as "January-22" and the day is never shown at all. The drift is an
 * artefact of however the column was generated, and the bank means months.
 *
 * Literals are stripped before looking for a day token, because a format like
 * `mmmm "d" yyyy` prints a letter d without dating anything.
 */
export function isMonthYearFormat(code) {
  if (!code) return false;
  let s = String(code).split(";")[0]; // positive section only
  s = s.replace(/\[[^\]]*\]/g, ""); // [$-409], [Red]
  s = s.replace(/"[^"]*"/g, ""); // quoted literals
  s = s.replace(/\\./g, ""); // escaped single chars, e.g. \-
  s = s.toLowerCase();
  if (/[hs]/.test(s)) return false; // a time format; `m` there means minutes
  return /y/.test(s) && /m/.test(s) && !/d/.test(s);
}

/**
 * Map each cellXfs index to its format code.
 *
 * Reads the cellXfs block ONLY. styles.xml also contains a cellStyleXfs block
 * of identically-shaped <xf> elements that appears FIRST, and a regex that
 * grabs whichever it finds returns a confidently wrong answer: during the
 * investigation that produced this function it reported the tourism period
 * column as an accounting number format when it is in fact a date format.
 */
export function parseStyles(xml = "") {
  const custom = new Map();
  for (const m of xml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/>/g)) {
    custom.set(Number(m[1]), decodeEntities(m[2]));
  }
  const start = xml.indexOf("<cellXfs");
  const end = xml.indexOf("</cellXfs>");
  if (start < 0 || end < 0) return [];
  return [...xml.slice(start, end).matchAll(/<xf\b[^>]*?>/g)].map((m) => {
    const id = Number(/numFmtId="(\d+)"/.exec(m[0])?.[1] ?? 0);
    return custom.get(id) ?? BUILTIN_FORMATS[id] ?? "";
  });
}

/** Read a whole workbook: { sheets: [{ name, rows, monthOnly }] }, in workbook
 * order. `monthOnly` is a Set of "row:col" keys for numeric cells whose format
 * shows a month and year but no day. */
export function readXlsx(buf) {
  const zip = unzip(buf);
  const dec = (name) => {
    const b = zip.get(name);
    return b ? b.toString("utf8") : undefined;
  };
  const shared = parseSharedStrings(dec("xl/sharedStrings.xml"));
  const workbook = dec("xl/workbook.xml") ?? "";
  const rels = dec("xl/_rels/workbook.xml.rels") ?? "";
  const formats = parseStyles(dec("xl/styles.xml"));
  const monthOnlyStyles = new Set(formats.flatMap((code, i) => (isMonthYearFormat(code) ? [i] : [])));

  // Sheet name -> target part, resolved through r:id so sheet ORDER and NAME
  // stay correct even when the parts are not numbered in display order.
  const relMap = new Map(
    [...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2].replace(/^\/?xl\//, "")]),
  );
  const sheets = [];
  for (const m of workbook.matchAll(/<sheet[^>]*\/>/g)) {
    const name = /name="([^"]+)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!name || !rid) continue;
    const target = relMap.get(rid);
    const xml = target ? dec(`xl/${target}`) : undefined;
    if (!xml) continue;
    const monthOnly = new Set();
    sheets.push({ name: decodeEntities(name), rows: parseSheet(xml, shared, { monthOnlyStyles, monthOnly }), monthOnly });
  }
  return { sheets };
}
