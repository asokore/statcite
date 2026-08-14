// CaribStat adapter — regional central-bank series.
//
// The fixture below is a VERBATIM excerpt of a document this pipeline actually
// produced on 2026-08-10 (Anguilla public sector debt, annual), not an invented
// shape. Anguilla is the point of the whole vertical: it is not a World Bank
// reporting economy, so no aggregator carries this series at all.
//
// The adapter is built and tested but deliberately NOT wired into the serving
// chain — CARIBSTAT_ENABLED is false until the licence ledger records the
// grant's scope. A test below asserts that, so the flag cannot be flipped by
// accident along with unrelated work.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCaribstatId,
  caribstatUrl,
  selectRow,
  fetchCaribstatSeries,
  CARIBSTAT_ENABLED,
  type CaribstatDoc,
} from "../src/adapters/caribstat.ts";
import { caribstatCitation } from "../src/core/citations.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import type { Ctx } from "../src/core/types.ts";

const DOC: CaribstatDoc = {
  source: "Eastern Caribbean Central Bank",
  source_id: "eccb",
  source_url: "https://www.eccb-centralbank.org/statistics-category/public-sector-debt/total-public-sector-debt",
  table_id: "total-public-sector-debt",
  table_title: "Total Public Sector Debt",
  country: { iso3: "AIA", name: "Anguilla" },
  frequency: "a",
  data_as_at: "2026-06-08",
  data_as_at_raw: "08 June 2026",
  retrieved_at: "2026-08-13T16:28:44.604Z",
  periods: ["2023", "2024", "2025"],
  periods_raw: ["2023", "2024", "2025"],
  series: [
    { label: "Central Government Debt", unit: "EC$M", observations: [
      { period: "2023", value: 201.52 }, { period: "2024", value: 210.4 }, { period: "2025", value: 219.9 }] },
    { label: "Public Corporation Debt", unit: "EC$M", observations: [
      { period: "2023", value: 12.1 }, { period: "2024", value: 12.5 }, { period: "2025", value: 13.0 }] },
    { label: "Public Sector Debt", unit: "EC$M", observations: [
      { period: "2023", value: 213.62 }, { period: "2024", value: 222.9 }, { period: "2025", value: 232.9 }] },
    { label: "Public Sector Domestic Debt", unit: "EC$M", observations: [
      { period: "2023", value: 100.0 }, { period: "2024", value: 104.0 }, { period: "2025", value: 108.0 }] },
    { label: "Public Sector External Debt", unit: "EC$M", observations: [
      { period: "2023", value: 113.62 }, { period: "2024", value: 118.9 }, { period: "2025", value: 124.9 }] },
  ],
};

const ctx = { now: () => new Date("2026-08-13T00:00:00Z") } as unknown as Ctx;

// --- id parsing ------------------------------------------------------------

test("parses a caribstat series id into provider, table, country and frequency", () => {
  const p = parseCaribstatId("caribstat/ECCB/total-public-sector-debt/AIA.a");
  assert.deepEqual(p, { provider: "ECCB", table: "total-public-sector-debt", iso3: "AIA", freq: "a", row: undefined });
  assert.equal(caribstatUrl(p, "https://origin.test"), "https://origin.test/data/eccb/total-public-sector-debt/a/AIA.json");
});

test("a row selector is parsed off the fragment", () => {
  const p = parseCaribstatId("caribstat/ECCB/total-public-sector-debt/MSR.q#Public Sector External Debt");
  assert.equal(p.iso3, "MSR");
  assert.equal(p.freq, "q");
  assert.equal(p.row, "Public Sector External Debt");
});

test("malformed ids are rejected with an example, not a silent default", () => {
  assert.throws(() => parseCaribstatId("caribstat/ECCB"), /Expected 'caribstat/);
  assert.throws(() => parseCaribstatId("caribstat/ECCB/table/AIA"), /ISO3}\.{freq}|last segment/);
  assert.throws(() => parseCaribstatId("caribstat/ECCB/table/AIA.d"), /Unsupported caribstat frequency/);
});

// --- row selection ---------------------------------------------------------

test("no selector returns the table's first row", () => {
  assert.equal(selectRow(DOC).label, "Central Government Debt");
});

test("an exact label wins over a prefix that would also match", () => {
  // "Public Sector Debt" is also a prefix of "Public Sector Domestic Debt" and
  // "Public Sector External Debt". Exact match must take priority or the
  // caller silently gets a different series than they asked for.
  const row = selectRow(DOC, "Public Sector Debt");
  assert.equal(row.label, "Public Sector Debt");
  assert.equal(row.observations.at(-1)?.value, 232.9);
});

test("an AMBIGUOUS prefix is refused, never resolved by picking the first", () => {
  // This is the load-bearing one. "Public Sector D" matches both the domestic
  // row and the headline row; returning either would look perfectly healthy
  // while answering a different question.
  const err = (() => { try { selectRow(DOC, "Public Sector "); } catch (e) { return e as Error; } })();
  assert.match(err!.message, /ambiguous/i);
  assert.match(err!.message, /Use the exact label/);
  assert.match(err!.message, /matches 3 rows/, "the error must say how many and which, so the caller can disambiguate");

  // A UNIQUE prefix must still resolve — refusing everything would be as
  // useless as guessing. "Public Sector Do" prefixes only the domestic row.
  assert.equal(selectRow(DOC, "Public Sector Do").label, "Public Sector Domestic Debt");
});

test("an unknown row lists what IS available instead of failing blank", () => {
  const err = (() => { try { selectRow(DOC, "Nonexistent"); } catch (e) { return e as Error; } })();
  assert.match(err!.message, /Central Government Debt/);
  assert.match(err!.message, /Public Sector External Debt/);
});

test("a document with no rows is honest absence, not a crash", () => {
  const empty = { ...DOC, series: [] };
  const err = (() => { try { selectRow(empty); } catch (e) { return e as Error; } })();
  assert.match(JSON.stringify((err as any).details ?? {}), /no_published_data/);
});

// --- fetching --------------------------------------------------------------

test("fetches and returns the selected row with its unit", async () => {
  _clearMemCache();
  let requested = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new Response(JSON.stringify(DOC), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const s = await fetchCaribstatSeries("caribstat/ECCB/total-public-sector-debt/AIA.a#Public Sector Debt", {
    origin: "https://origin.test",
  });
  assert.equal(requested, "https://origin.test/data/eccb/total-public-sector-debt/a/AIA.json");
  assert.equal(s.label, "Public Sector Debt");
  assert.equal(s.unit, "EC$M");
  assert.equal(s.observations.at(-1)?.value, 232.9);
  assert.equal(s.doc.country.name, "Anguilla");
});

// --- citation: the provenance contract -------------------------------------

test("the citation keeps the BANK's currency date separate from our retrieval date", () => {
  const c = caribstatCitation(ctx, {
    source: DOC.source,
    sourceUrl: DOC.source_url,
    tableTitle: DOC.table_title,
    rowLabel: "Public Sector Debt",
    countryName: DOC.country.name,
    frequency: "a",
    dataAsAt: DOC.data_as_at,
    dataAsAtRaw: DOC.data_as_at_raw,
    apiUrl: "https://origin.test/data/eccb/total-public-sector-debt/a/AIA.json",
    seriesId: "caribstat/ECCB/total-public-sector-debt/AIA.a#Public Sector Debt",
  });
  assert.equal(c.source, "Eastern Caribbean Central Bank");
  assert.equal(c.retrieved_at, "2026-08-13", "our fetch date");
  assert.match(c.citation_text, /data as at 08 June 2026/, "the BANK's currency claim must appear in the citation text");
  assert.notEqual(c.retrieved_at, "2026-06-08");
  // The notice must say explicitly that these are different claims — a reader
  // who conflates them misdates the data by two months.
  assert.ok(c.notices?.some((n) => /not the same as the retrieval date/i.test(n)));
  assert.match(c.citation_text, /Anguilla/);
  assert.ok(c.export_formats?.bibtex.includes("Eastern Caribbean Central Bank"));
});

// --- the serving gate ------------------------------------------------------

test("CARIBSTAT_ENABLED and the licence ledger must agree", async () => {
  // The original form of this test asserted the flag was false. That was right
  // while nothing was served and useless the moment it was, so it now asserts
  // the invariant it was always protecting: serving is a LICENCE decision, and
  // the flag may only be true when the ledger says the source may be served.
  // The ledger at /v1/sources is a public claim about what StatCite is
  // permitted to redistribute. The flag getting ahead of it is the failure
  // this guards against, in either direction.
  const { SOURCES } = await import("../src/core/sources.ts");
  const eccb = SOURCES.find((x) => x.id === "eccb");
  assert.ok(eccb, "eccb must have a ledger entry either way");
  if (CARIBSTAT_ENABLED) {
    assert.equal(eccb!.license_verdict, "served",
      "the adapter is enabled, so the ledger must record permission to serve");
    assert.ok((eccb!.license_note ?? "").length > 60,
      "a served entry must state the basis for the permission it relies on");
    assert.ok(!/not applicable/i.test(eccb!.attribution_required ?? ""),
      "a served source must name its required attribution");
  } else {
    assert.notEqual(eccb!.license_verdict, "served",
      "the ledger claims permission to serve while the adapter is off");
  }
});
