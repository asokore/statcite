// Minimal XLSX reader tests.
//
// The fixture is built here as a STORED (uncompressed) zip, so the test is
// self-contained: no binary fixture in the repo, no redistribution of a bank's
// file to test our own parser, and no dependency on either side. The reader
// handles stored and deflated entries identically, so this exercises the real
// container path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { unzip, parseSharedStrings, parseSheet, readXlsx, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES } from "./xlsx.mjs";

/** Build a one-entry DEFLATED zip whose central directory declares `declared`
 * as the uncompressed size, which may be a lie, as in a zip bomb. */
function makeDeflatedZip(name, data, declared = data.length) {
  const nameBuf = Buffer.from(name, "utf8");
  const comp = deflateRawSync(data);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(declared, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(declared, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(0, 42);
  const localPart = Buffer.concat([lh, nameBuf, comp]);
  const centralPart = Buffer.concat([ch, nameBuf]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

/** Build a stored-only zip from { name: string-content } pairs. */
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 8); // stored
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  }
  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

const SHARED = `<?xml version="1.0"?><sst count="4" uniqueCount="4">
  <si><t>January 2012</t></si>
  <si><t>Loans &amp; Deposits</t></si>
  <si><r><t>Net </t></r><r><t>Foreign Assets</t></r></si>
  <si><t>Caf&#233;</t></si>
</sst>`;

const SHEET = `<?xml version="1.0"?><worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c><c r="D1"><v>-416.19</v></c></row>
  <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>534.0104575816428</v></c><c r="C2" t="inlineStr"><is><t>inline text</t></is></c></row>
  <row r="4"><c r="A4" t="s"><v>3</v></c><c r="B4"><v>0</v></c></row>
</sheetData></worksheet>`;

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns:r="x">
  <sheets><sheet name="Loans&amp;Deposits" sheetId="1" r:id="rId7"/><sheet name="Second" sheetId="2" r:id="rId3"/></sheets>
</workbook>`;

const RELS = `<?xml version="1.0"?><Relationships>
  <Relationship Id="rId7" Target="worksheets/sheetA.xml"/>
  <Relationship Id="rId3" Target="/xl/worksheets/sheetB.xml"/>
</Relationships>`;

const BOOK = makeZip({
  "xl/workbook.xml": WORKBOOK,
  "xl/_rels/workbook.xml.rels": RELS,
  "xl/sharedStrings.xml": SHARED,
  "xl/worksheets/sheetA.xml": SHEET,
  "xl/worksheets/sheetB.xml": `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>`,
});

test("unzips a container and finds every entry", () => {
  const z = unzip(BOOK);
  assert.equal(z.size, 5);
  assert.ok(z.get("xl/sharedStrings.xml").toString("utf8").includes("January 2012"));
});

test("a non-zip buffer fails loudly rather than returning nothing", () => {
  assert.throws(() => unzip(Buffer.from("this is not a zip file at all")), /not a zip file/);
});

test("shared strings decode entities and concatenate formatting runs", () => {
  const s = parseSharedStrings(SHARED);
  assert.equal(s[0], "January 2012");
  assert.equal(s[1], "Loans & Deposits", "&amp; must decode once, not stay escaped");
  assert.equal(s[2], "Net Foreign Assets", "runs split by formatting must rejoin into one string");
  assert.equal(s[3], "Café", "numeric character references decode");
});

test("cells resolve by column reference, not by position", () => {
  // Row 1 skips column C entirely. Reading positionally would slide D's value
  // into C and silently misalign an entire column of the table.
  const rows = parseSheet(SHEET, parseSharedStrings(SHARED));
  assert.equal(rows[0][0], "January 2012");
  assert.equal(rows[0][1], "Net Foreign Assets");
  assert.equal(rows[0][2], null, "the skipped column must be a gap");
  assert.equal(rows[0][3], -416.19, "the value must stay in column D");
});

test("numbers, inline strings and a real zero are distinguished", () => {
  const rows = parseSheet(SHEET, parseSharedStrings(SHARED));
  assert.equal(rows[1][1], 534.0104575816428, "full float precision is preserved");
  assert.equal(rows[1][2], "inline text");
  assert.equal(rows[3][1], 0, "a published zero is a value");
  assert.notEqual(rows[3][1], null, "zero must never be flattened to a gap");
});

test("missing rows become empty rows, keeping row numbers aligned", () => {
  const rows = parseSheet(SHEET, parseSharedStrings(SHARED));
  assert.deepEqual(rows[2], [], "row 3 is absent in the XML and must not shift row 4 up");
  assert.equal(rows[3][0], "Café");
});

test("sheets resolve through r:id, preserving workbook order and names", () => {
  // The parts are named sheetA/sheetB and the rels are out of numeric order —
  // resolving by filename or by rId sort would mislabel the sheets.
  const wb = readXlsx(BOOK);
  assert.deepEqual(wb.sheets.map((s) => s.name), ["Loans&Deposits", "Second"]);
  assert.equal(wb.sheets[0].rows[0][0], "January 2012");
  assert.equal(wb.sheets[1].rows[0][0], 7, "a leading-slash rel target must resolve too");
});

// --- Inflation caps (zip-bomb defence) -------------------------------------

test("a deflated entry with an honest declared size inflates intact", () => {
  const data = Buffer.from("<x>" + "1,".repeat(5000) + "</x>");
  const z = unzip(makeDeflatedZip("a.xml", data));
  assert.equal(z.get("a.xml").toString(), data.toString());
});

test("an entry that inflates past its declared size is refused", () => {
  const bomb = Buffer.alloc(4 * 1024 * 1024); // 4 MiB of zeros, a few KB deflated
  const zip = makeDeflatedZip("bomb.xml", bomb, 1024);
  assert.ok(zip.length < 64 * 1024, "the fixture should be small on disk");
  assert.throws(() => unzip(zip), /inflates past its declared 1024 bytes/);
});

test("an entry declaring more than the per-entry cap is refused before inflating", () => {
  const data = Buffer.alloc(2048);
  assert.throws(() => unzip(makeDeflatedZip("big.xml", data), { maxEntryBytes: 1024 }), /declares 2048 bytes, over the 1024-byte cap/);
  assert.equal(unzip(makeDeflatedZip("big.xml", data), { maxEntryBytes: 4096 }).get("big.xml").length, 2048);
});

test("the archive total is capped across entries", () => {
  const zip = makeZip({ "a.xml": "x".repeat(600), "b.xml": "y".repeat(600) });
  assert.throws(() => unzip(zip, { maxTotalBytes: 1000 }), /inflates past the 1000-byte cap at entry b\.xml/);
  assert.equal(unzip(zip, { maxTotalBytes: 1200 }).size, 2);
});

test("the default caps are far above the largest real workbook measured", () => {
  // Measured 2026-11-14: largest entry 16,126,072 bytes, largest archive 24,960,684.
  assert.ok(MAX_ENTRY_BYTES >= 16_126_072 * 4);
  assert.ok(MAX_TOTAL_BYTES >= 24_960_684 * 4);
});

const SAMPLE_DIR = new URL("../reference/sample/", import.meta.url);
test("every local sample workbook still opens under the default caps", { skip: !existsSync(SAMPLE_DIR) && "samples are local-only (gitignored)" }, () => {
  const files = readdirSync(SAMPLE_DIR).filter((f) => f.endsWith(".xlsx"));
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(unzip(readFileSync(new URL(f, SAMPLE_DIR))).size > 0, f);
});
