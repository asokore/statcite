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
export function parseSheet(xml, shared = []) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = Number(rm[1]) - 1;
    const cells = [];
    for (const cm of rm[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1];
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const body = cm[2];
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
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    rows[rowIdx] = cells;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** Read a whole workbook: { sheets: [{ name, rows }] }, in workbook order. */
export function readXlsx(buf) {
  const zip = unzip(buf);
  const dec = (name) => {
    const b = zip.get(name);
    return b ? b.toString("utf8") : undefined;
  };
  const shared = parseSharedStrings(dec("xl/sharedStrings.xml"));
  const workbook = dec("xl/workbook.xml") ?? "";
  const rels = dec("xl/_rels/workbook.xml.rels") ?? "";

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
    sheets.push({ name: decodeEntities(name), rows: parseSheet(xml, shared) });
  }
  return { sheets };
}
