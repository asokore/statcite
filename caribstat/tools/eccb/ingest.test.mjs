// Wiring tests for ingestTable against a stubbed bank.
//
// The helper functions each have their own tests. What those cannot see is
// the wiring: which skip path a page is routed to, which geography's file is
// compared, which windows reach classifyChange, and what a partial failure
// leaves behind. A review on 2026-09-30 showed every one of those could be
// broken with the unit suite still green, so each test here drives the real
// ingestTable end to end. Nothing touches the network: globalThis.fetch is
// replaced for the duration of each test and restored after.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingestTable } from "./ingest.mjs";
import { tableById } from "./catalogue.mjs";

const TABLE = "central-government-fiscal-accounts";
const GEOS = [
  { code: "1", iso3: "AIA", name: "Anguilla" },
  { code: "9", iso3: "XCU", name: "ECCU" },
];
const ROWS = [["Total Revenue and Grants", "EC$M"], ["Current Revenue", "EC$M"], ["Tax Revenue", "EC$M"]];

/**
 * A fake ECCB. `bank` is mutable between runs: per-geography values by year,
 * the stamp it prints (or not), the geography its bare GET renders, the
 * default window of that GET, and any geography whose POST should fail.
 * Like the real site, a POST returns every year of the requested window and
 * prints a dash where it has no value.
 */
function fakeBank(bank) {
  const requests = [];
  const cell = (iso3, row, year) => {
    const v = bank.values[iso3]?.[row]?.[year];
    return v === undefined || v === null ? "---" : String(v);
  };
  const table = (iso3, years) =>
    `<table><tr><th></th><th>Unit</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr>` +
    ROWS.map(([label, unit], i) => `<tr><td>${label}</td><td>${unit}</td>${years.map((y) => `<td>${cell(iso3, i, y)}</td>`).join("")}</tr>`).join("") +
    "</table>";
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
  const iso = (code) => GEOS.find((g) => g.code === code)?.iso3;
  const stub = async (url, opts = {}) => {
    const method = opts.method ?? "GET";
    requests.push(method);
    const stamp = bank.stamp ? `<p>Data as at ${bank.stamp}</p>` : "";
    if (method === "GET") {
      const [a, b] = bank.defaultYears;
      const html = `<meta name="csrf-token" content="tok"><input type="hidden" id="hdnUtrCountry" value="${bank.defaultCode}">${stamp}${table(iso(bank.defaultCode), range(a, b))}`;
      return new Response(html, { status: 200 });
    }
    const body = new URLSearchParams(String(opts.body));
    const target = iso(body.get("country_code[]"));
    if (bank.failing?.includes(target)) return new Response("boom", { status: 500 });
    if (bank.empty?.includes(target)) return new Response(`${stamp}<table><tr><th></th><th>Unit</th></tr></table>`, { status: 200 });
    const start = Number(body.get("start_date").slice(-4));
    const end = Number(body.get("end_date").slice(-4));
    return new Response(`${stamp}${table(target, range(start, end))}`, { status: 200 });
  };
  return { stub, requests };
}

function initialBank() {
  const series = (base) => ROWS.map((_, i) => Object.fromEntries([2022, 2023, 2024, 2025].map((y) => [y, base + i * 10 + (y - 2022)])));
  return { stamp: undefined, defaultCode: "9", defaultYears: [2023, 2025], values: { AIA: series(100), XCU: series(1000) } };
}

async function withBank(bank, fn) {
  const real = globalThis.fetch;
  const fake = fakeBank(bank);
  globalThis.fetch = fake.stub;
  try {
    return await fn(fake);
  } finally {
    globalThis.fetch = real;
  }
}

async function run(dir, bank, opts) {
  return withBank(bank, async (fake) => {
    const r = await ingestTable(TABLE, { freq: "a", geographies: GEOS, dataDir: dir, gapMs: 0, startDate: 2022, endDate: 2026, ...opts });
    return { ...r, requests: fake.requests };
  });
}

const DAY1 = "2026-09-27T06:00:00.000Z";
const DAY4 = "2026-09-30T06:00:00.000Z";

async function scratch(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "cs-ingest-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const readDoc = async (dir, iso3) => JSON.parse(await readFile(path.join(dir, TABLE, "a", `${iso3}.json`), "utf8"));

test("stampless incremental run skips on content, with one GET and no POSTs", () => scratch(async (dir) => {
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: DAY1 });
  const r = await run(dir, bank, { now: DAY4 });
  assert.equal(r.skipped, true, r.reason);
  assert.equal(r.basis, "content");
  assert.deepEqual(r.requests, ["GET"]);
  const doc = await readDoc(dir, "XCU");
  assert.ok(!("data_as_at" in doc), "no stamp is invented for a stampless source");
}));

test("a moved query window routes the stampless run to a full fetch", () => scratch(async (dir) => {
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: DAY1 });
  const r = await run(dir, bank, { now: DAY4, endDate: 2027 });
  assert.equal(r.skipped, false);
  assert.ok(r.requests.includes("POST"));
}));

test("a printed stamp takes the stamp path, even when the content matches", () => scratch(async (dir) => {
  // With identical content the content path would skip. The stamp path must
  // not: the ledger saw no stamp, so the live one is a change of claim.
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: DAY1 });
  bank.stamp = "30 September 2026";
  const r = await run(dir, bank, { now: DAY4 });
  assert.equal(r.skipped, false);
  const doc = await readDoc(dir, "XCU");
  assert.equal(doc.data_as_at, "2026-09-30");
  assert.equal(r.results.find((x) => x.iso3 === "XCU").state, "stamp-restored");
}));

test("an unchanged printed stamp skips on the stamp, not on content", () => scratch(async (dir) => {
  // Pins the routing: the content path refuses any page that prints a currency
  // phrase, so only the stamp path can skip here.
  const bank = initialBank();
  bank.stamp = "30 September 2026";
  await run(dir, bank, { deep: true, now: DAY1 });
  const r = await run(dir, bank, { now: DAY4 });
  assert.equal(r.skipped, true, r.reason);
  assert.equal(r.basis, "stamp");
  assert.deepEqual(r.requests, ["GET"]);
}));

test("the page's declared geography decides which file is compared", () => scratch(async (dir) => {
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: DAY1 });
  // Revise ECCU in the default window only. If the page renders Anguilla, the
  // content check compares Anguilla (unchanged) and skips. If it renders ECCU,
  // it must see the revision and fetch.
  bank.values.XCU[0][2024] = 5555;
  bank.defaultCode = "1";
  assert.equal((await run(dir, bank, { now: DAY4 })).skipped, true);
  bank.defaultCode = "9";
  const r = await run(dir, bank, { now: DAY4 });
  assert.equal(r.skipped, false);
  assert.equal(r.results.find((x) => x.iso3 === "XCU").state, "republished");
}));

test("our window move is our query; the bank adding a value in the same window is news", () => scratch(async (dir) => {
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: DAY1, endDate: 2025 });
  const widened = await run(dir, bank, { deep: true, now: DAY4, endDate: 2026 });
  assert.deepEqual([...new Set(widened.results.map((x) => x.state))], ["our-query-changed"]);
  bank.values.AIA[1][2026] = 7;
  const published = await run(dir, bank, { deep: true, now: "2026-10-04T06:00:00.000Z", endDate: 2026 });
  assert.equal(published.results.find((x) => x.iso3 === "AIA").state, "republished");
}));

test("a partly failed fetch cannot be skipped past on the next run", () => scratch(async (dir) => {
  // Reproduced in review: MSR's POST failed, ECCU was rewritten with a
  // revision, the ledger stayed on the old fetch, and the next incremental
  // run skipped on the fresh ECCU file while the failed geography went stale.
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: DAY1 });
  bank.values.XCU[0][2025] = 9999;
  bank.values.AIA[0][2025] = 8888;
  bank.failing = ["AIA"];
  const partial = await run(dir, bank, { now: "2026-09-28T06:00:00.000Z" });
  assert.equal(partial.results.find((x) => x.iso3 === "AIA").ok, false);
  bank.failing = [];
  const retry = await run(dir, bank, { now: DAY4 });
  assert.equal(retry.skipped, false, retry.reason);
  const aia = await readDoc(dir, "AIA");
  assert.equal(aia.series[0].observations.find((o) => o.period === "2025").value, 8888);
}));

test("the first stampless run after a stamped one rebuilds rather than skips", () => scratch(async (dir) => {
  const bank = initialBank();
  bank.stamp = "01 September 2026";
  await run(dir, bank, { deep: true, now: DAY1 });
  bank.stamp = undefined;
  const snapsBefore = await readdir(path.join(dir, TABLE, "a", "snapshots"));
  const r = await run(dir, bank, { now: DAY4 });
  assert.equal(r.skipped, false, "the stored files still carry the withdrawn stamp");
  assert.deepEqual([...new Set(r.results.map((x) => x.state))], ["stamp-withdrawn"]);
  assert.ok(!("data_as_at" in (await readDoc(dir, "AIA"))));
  assert.deepEqual(await readdir(path.join(dir, TABLE, "a", "snapshots")), snapsBefore, "identical values are not a new vintage");
  const again = await run(dir, bank, { now: "2026-09-30T07:00:00.000Z" });
  assert.equal(again.skipped, true, "once rebuilt, the content skip applies");
}));

test("an unrecognised currency phrase blocks the content skip and fails every series", () => scratch(async (dir) => {
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: DAY1 });
  bank.stamp = "30th September 2026"; // printed, but not in the shape the extractor reads
  const r = await run(dir, bank, { now: DAY4 });
  assert.equal(r.skipped, false, "a content skip would have hidden the restored stamp");
  assert.ok(r.results.length > 0 && r.results.every((x) => !x.ok), "every series fails loudly");
  assert.match(r.results[0].problems.join(" "), /does not recognise/);
}));

test("stampless vintages are named by full retrieval time and never overwritten", () => scratch(async (dir) => {
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: DAY1 });
  bank.values.XCU[0][2024] = 1;
  await run(dir, bank, { deep: true, now: "2026-09-30T06:00:00.000Z" });
  bank.values.XCU[0][2024] = 2;
  await run(dir, bank, { deep: true, now: "2026-09-30T09:00:00.000Z" });
  const snaps = (await readdir(path.join(dir, TABLE, "a", "snapshots"))).filter((f) => f.startsWith("XCU."));
  assert.ok(snaps.includes("XCU.retrieved-2026-09-30T06-00-00-000Z.json"), snaps.join(", "));
  assert.ok(snaps.includes("XCU.retrieved-2026-09-30T09-00-00-000Z.json"), "a second revision the same day is a second vintage");
  assert.ok(!snaps.some((f) => /^XCU\.\d{4}-\d{2}-\d{2}\.json$/.test(f)), "a bare day would read as a bank date");
  const first = JSON.parse(await readFile(path.join(dir, TABLE, "a", "snapshots", "XCU.retrieved-2026-09-30T06-00-00-000Z.json"), "utf8"));
  assert.equal(first.series[0].observations.find((o) => o.period === "2024").value, 1);
}));

test("a stampless run past the seven-day bound re-reads instead of skipping", () => scratch(async (dir) => {
  const bank = initialBank();
  await run(dir, bank, { deep: true, now: "2026-09-20T06:00:00.000Z" });
  const r = await run(dir, bank, { now: DAY4 });
  assert.equal(r.skipped, false);
  assert.ok(r.requests.includes("POST"));
}));

test("per-country tables never let our window excuse the bank's new period", () => scratch(async (dir) => {
  // The CPI extract is the bank's bare GET; --start/--end never reach it.
  const base = { AIA: {}, XCU: [{ 2024: 100, 2025: 101 }, {}, {}] };
  const cpiPage = (years) => `<meta name="csrf-token" content="tok"><table><tr><th></th><th>Unit</th>${years.map((y) => `<th>${y}</th>`).join("")}</tr><tr><td>All Items</td><td>Index</td>${years.map((y) => `<td>${base.XCU[0][y]}</td>`).join("")}</tr></table>`;
  let years = [2024, 2025];
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(cpiPage(years), { status: 200 });
  try {
    const geos = [{ code: "9", iso3: "XCU", name: "ECCU" }];
    await ingestTable("consumer-price-index", { freq: "a", geographies: geos, dataDir: dir, gapMs: 0, startDate: 2015, endDate: 2025, now: DAY1 });
    base.XCU[0][2026] = 102;
    years = [2024, 2025, 2026];
    const r = await ingestTable("consumer-price-index", { freq: "a", geographies: geos, dataDir: dir, gapMs: 0, startDate: 2015, endDate: 2026, now: DAY4 });
    assert.equal(r.results[0].state, "republished");
  } finally {
    globalThis.fetch = real;
  }
}));

test("a withheld geography is not ingested, and the deep run fails the day it shows rows", () => scratch(async (dir) => {
  const def = tableById.get(TABLE);
  const before = def.withheld;
  def.withheld = ["XCU"];
  try {
    const bank = { ...initialBank(), empty: ["XCU"] };
    const r = await run(dir, bank, { deep: true, now: DAY1 });
    assert.deepEqual(r.results.map((x) => [x.iso3, x.ok]), [["AIA", true]], "only the published geography is ingested");
    assert.ok(!(await readdir(path.join(dir, TABLE, "a"))).includes("XCU.json"), "no file is written for a withheld geography");
    bank.empty = [];
    const later = await run(dir, bank, { deep: true, now: DAY4 });
    const xcu = later.results.find((x) => x.iso3 === "XCU");
    assert.equal(xcu?.ok, false, "rows on a withheld geography are a loud failure");
    assert.match(xcu.problems[0], /declared withheld/);
  } finally {
    def.withheld = before;
  }
}));

// --- a split table, end to end --------------------------------------------

const TIS_CELLS = ["219.69", "25.75", "20.67", "423.47", "20.53", "9.67"];
const tisHtml = (shadedClass = "") => {
  const cells = TIS_CELLS.map((c) => `<td${shadedClass}>${c}</td>`).join("");
  return '<meta name="csrf-token" content="tok"><input type="hidden" id="hdnUtrCountry" value="1">' +
    '<table><thead><tr><th rowspan="4"></th><th rowspan="4">Unit</th><th colspan="6">2015</th></tr>' +
    '<tr><th colspan="3">Imports</th><th colspan="3">Exports</th></tr>' +
    '<tr><th rowspan="2">TOTAL</th><th colspan="2">Of Which:</th><th rowspan="2">TOTAL</th><th colspan="2">Of Which:</th></tr>' +
    "<tr><th>ECCU</th><th>Other CARICOM Countries</th><th>ECCU</th><th>Other CARICOM Countries</th></tr></thead><tbody>" +
    `<tr><td>Total EBOPS Services</td><td>EC$M</td>${cells}</tr><tr><td>4. Travel</td><td>EC$M</td>${cells}</tr></tbody></table>`;
};
async function ingestTis(dir, { credit, balance, shadedClass }) {
  await mkdir(path.join(dir, "balance-of-payments", "a"), { recursive: true });
  const obs = (value) => [{ period: "2015", value }];
  await writeFile(path.join(dir, "balance-of-payments", "a", "AIA.json"), JSON.stringify({ series: [
    { label: "Services Credit (Exports)", observations: obs(credit) },
    { label: "Balance on Services", observations: obs(balance) },
  ] }));
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(tisHtml(shadedClass), { status: 200, headers: { "set-cookie": "s=1" } });
  try {
    return await ingestTable("trade-in-services", { freq: "a", geographies: [GEOS[0]], dataDir: dir, gapMs: 0, startDate: 2015, endDate: 2015, deep: true, now: DAY1 });
  } finally {
    globalThis.fetch = original;
  }
}

test("a split table that disagrees with the Balance of Payments is refused end to end, and writes nothing", async () => {
  await scratch(async (dir) => {
    const r = await ingestTis(dir, { credit: 219.69, balance: -203.78 });
    assert.equal(r.results[0].ok, false);
    assert.ok(r.results[0].problems.some((p) => /Exports: TOTAL" 2015 is 423\.47, balance-of-payments implies 219\.69/.test(p)), JSON.stringify(r.results[0]));
    await assert.rejects(() => readFile(path.join(dir, "trade-in-services", "a", "AIA.json")));
  });
});

test("a split table that agrees is written as one series per sub-column, with the bank's shading", async () => {
  await scratch(async (dir) => {
    const r = await ingestTis(dir, { credit: 423.47, balance: 203.78, shadedClass: ' class="bg-future-data"' });
    assert.equal(r.results[0].ok, true, JSON.stringify(r.results[0]));
    const doc = JSON.parse(await readFile(path.join(dir, "trade-in-services", "a", "AIA.json"), "utf8"));
    assert.equal(doc.series.length, 12);
    assert.deepEqual(doc.future_periods, ["2015"]);
    assert.equal(doc.series.find((x) => x.label === "4. Travel: Exports: Of Which: Other CARICOM Countries").observations[0].value, 9.67);
  });
});

test("a failure on the union aggregate stops a split table before any geography is written", async () => {
  await scratch(async (dir) => {
    await mkdir(path.join(dir, "balance-of-payments", "a"), { recursive: true });
    const bop = JSON.stringify({ series: [
      { label: "Services Credit (Exports)", observations: [{ period: "2015", value: 423.47 }] },
      { label: "Balance on Services", observations: [{ period: "2015", value: 203.78 }] },
    ] });
    for (const iso3 of ["AIA", "XCU"]) await writeFile(path.join(dir, "balance-of-payments", "a", iso3 + ".json"), bop);
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(tisHtml(), { status: 200, headers: { "set-cookie": "s=1" } });
    let r;
    try {
      // Anguilla comes first in the list and must still wait for the union,
      // whose ECCU column is not zero on this page.
      r = await ingestTable("trade-in-services", { freq: "a", geographies: GEOS, dataDir: dir, gapMs: 0, startDate: 2015, endDate: 2015, deep: true, now: DAY1 });
    } finally {
      globalThis.fetch = original;
    }
    assert.deepEqual(r.results.map((x) => [x.iso3, x.ok]), [["XCU", false], ["AIA", false]]);
    assert.match(r.results[0].problems.join(), /should be zero in the union aggregate/);
    assert.match(r.results[1].problems.join(), /union aggregate failed/);
    await assert.rejects(() => readFile(path.join(dir, "trade-in-services", "a", "AIA.json")));
  });
});

test("a network failure on the union aggregate stops a split table too", async () => {
  await scratch(async (dir) => {
    await mkdir(path.join(dir, "balance-of-payments", "a"), { recursive: true });
    const bop = JSON.stringify({ series: [
      { label: "Services Credit (Exports)", observations: [{ period: "2015", value: 423.47 }] },
      { label: "Balance on Services", observations: [{ period: "2015", value: 203.78 }] },
    ] });
    for (const iso3 of ["AIA", "XCU"]) await writeFile(path.join(dir, "balance-of-payments", "a", iso3 + ".json"), bop);
    const original = globalThis.fetch;
    let posts = 0;
    // Only the first request for data fails, so a run that carried on would
    // read Anguilla and write it.
    globalThis.fetch = async (url, init) => {
      if (init?.method === "POST" && ++posts === 1) throw new Error("connection reset");
      return new Response(tisHtml(), { status: 200, headers: { "set-cookie": "s=1" } });
    };
    let r;
    try {
      r = await ingestTable("trade-in-services", { freq: "a", geographies: GEOS, dataDir: dir, gapMs: 0, startDate: 2015, endDate: 2015, deep: true, now: DAY1 });
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(posts, 1, "nothing further was requested");
    assert.deepEqual(r.results.map((x) => [x.iso3, x.ok]), [["XCU", false], ["AIA", false]]);
    assert.match(r.results[0].problems.join(), /connection reset/);
    await assert.rejects(() => readFile(path.join(dir, "trade-in-services", "a", "AIA.json")));
  });
});
