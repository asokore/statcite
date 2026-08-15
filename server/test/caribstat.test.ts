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
import { readFileSync } from "node:fs";
import {
  parseCaribstatId,
  caribstatUrl,
  CARIBSTAT_CACHE_EPOCH,
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
  assert.equal(
    caribstatUrl(p, "https://origin.test"),
    `https://origin.test/data/eccb/total-public-sector-debt/a/AIA.json?v=${CARIBSTAT_CACHE_EPOCH}`,
  );
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
  assert.equal(requested, `https://origin.test/data/eccb/total-public-sector-debt/a/AIA.json?v=${CARIBSTAT_CACHE_EPOCH}`);
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

// --- CBB: one provider, a different shape, no invented currency stamp ------
//
// CBB was collected but unserved until 2026-08-14 for a reason worth keeping
// visible: the Bank prints no "data as at" anywhere, so the ingest recorded a
// weaker publication date and refused to call it currency. The fix was not to
// relabel that date. It was to let a citation name the PUBLICATION a figure
// came from, which is narrower than a currency claim and checkable, because a
// reader can open the exact workbook.

test("CBB ids parse without inventing a country or a frequency", () => {
  const p = parseCaribstatId("caribstat/CBB/balance-of-payments-reports/analytical-summary");
  assert.equal(p.provider, "CBB");
  assert.equal(p.table, "balance-of-payments-reports");
  assert.equal(p.sheet, "analytical-summary");
  assert.equal(p.iso3, "BRB", "every CBB series is Barbados");
});

test("CBB ids resolve to the per-sheet path, not the per-country one", () => {
  const p = parseCaribstatId("caribstat/CBB/balance-of-payments-reports/current-account");
  assert.equal(
    caribstatUrl(p, "https://example.test"),
    `https://example.test/data/cbb/balance-of-payments-reports/current-account.json?v=${CARIBSTAT_CACHE_EPOCH}`,
  );
  // The ECCB shape must be untouched by the CBB branch.
  const e = parseCaribstatId("caribstat/ECCB/total-public-sector-debt/AIA.a");
  assert.equal(
    caribstatUrl(e, "https://example.test"),
    `https://example.test/data/eccb/total-public-sector-debt/a/AIA.json?v=${CARIBSTAT_CACHE_EPOCH}`,
  );
});

test("A PUBLICATION DATE IS NEVER PRESENTED AS A CURRENCY STAMP", async () => {
  const { caribstatCitation } = await import("../src/core/citations.ts");
  const ctx = { now: () => new Date("2026-08-14T00:00:00Z") } as never;

  const cbb = caribstatCitation(ctx, {
    source: "Central Bank of Barbados",
    sourceUrl: "https://www.centralbank.org.bb/news/x",
    tableTitle: "Analytical Summary",
    publicationTitle: "Balance of Payments (BOP) 1967 - 2017",
    publishedAt: "2022-07-28",
    attachmentUrl: "https://cdn.centralbank.org.bb/documents/bop.xlsx",
    rowLabel: "1. CURRENT ACCOUNT",
    countryName: "Barbados",
    frequency: "a",
    apiUrl: "https://origin.test/data/cbb/x/y.json",
    seriesId: "caribstat/CBB/x/y",
  });
  assert.match(cbb.citation_text, /published 2022-07-28/);
  assert.doesNotMatch(cbb.citation_text, /data as at/i,
    "CBB publishes no currency stamp, so the citation must not claim one");
  assert.match(cbb.citation_text, /Balance of Payments/, "the publication must be named");
  assert.match(cbb.citation_text, /cdn\.centralbank\.org\.bb/, "link the workbook the figure came from");
  assert.match(cbb.notices?.[0] ?? "", /weaker claim/,
    "the notice must say plainly that this is not a currency claim");

  // ECCB, which does stamp currency, must be unaffected.
  const eccb = caribstatCitation(ctx, {
    source: "Eastern Caribbean Central Bank",
    sourceUrl: "https://www.eccb-centralbank.org/x",
    tableTitle: "Total Public Sector Debt",
    rowLabel: "Central Government Debt",
    countryName: "Anguilla",
    frequency: "a",
    dataAsAt: "2026-06-08",
    dataAsAtRaw: "08 June 2026",
    apiUrl: "https://origin.test/data/eccb/x/a/AIA.json",
    seriesId: "caribstat/ECCB/x/AIA.a",
  });
  assert.match(eccb.citation_text, /data as at 08 June 2026/);
  assert.doesNotMatch(eccb.citation_text, /published/i);
});

test("frequency is INFERRED, never defaulted, for a source that states none", async () => {
  // CBB does not declare a frequency. Defaulting to "annual" would mislabel
  // its monthly monetary survey, which is a quiet way to misdescribe a series:
  // the numbers would be right and the thing they are called would be wrong.
  const { inferFrequency } = await import("../src/adapters/caribstat.ts");
  assert.equal(inferFrequency(["1967", "1968", "2017"]), "a");
  assert.equal(inferFrequency(["2024-Q1", "2024-Q2"]), "q");
  assert.equal(inferFrequency(["2024-01", "2024-02"]), "m");
  assert.equal(inferFrequency([]), "a", "no periods falls back rather than throwing");
  assert.equal(inferFrequency(undefined), "a");
});

test("a citation never loses its dataset name when a source omits table_title", async () => {
  // This crashed the whole CBB path: `dataset` fed bibtexEscape an undefined
  // and every CBB request returned a 500. The export formats are derived from
  // the same fields as citation_text, so one missing name took out all three.
  const { caribstatCitation } = await import("../src/core/citations.ts");
  const c = caribstatCitation({ now: () => new Date("2026-08-14T00:00:00Z") } as never, {
    source: "Central Bank of Barbados",
    sourceUrl: "https://www.centralbank.org.bb/x",
    publicationTitle: "Balance of Payments (BOP) 1967 - 2017",
    publishedAt: "2022-07-28",
    rowLabel: "Current Account Balance",
    countryName: "Barbados",
    frequency: "a",
    apiUrl: "https://origin.test/x.json",
    seriesId: "caribstat/CBB/x/y",
  });
  assert.equal(c.dataset, "Balance of Payments (BOP) 1967 - 2017");
  assert.ok(c.export_formats?.bibtex?.length > 20, "bibtex must still build");
  assert.ok(c.export_formats?.apa?.length > 20, "apa must still build");
});

// --- the snapshot must not depend on one source covering a country --------

test("A WORLD BANK MISS DOES NOT DECIDE WHETHER A SNAPSHOT EXISTS", async () => {
  // Montserrat is not a World Bank reporting economy, so the snapshot's
  // multi-fetch throws a coverage error. That error used to propagate and
  // return "No snapshot data available for Montserrat", for a country whose
  // central bank publishes debt, prices and fiscal accounts every quarter.
  // The failing endpoint was the one an agent reaches for first, and the gap
  // it reported is the exact gap this service exists to close.
  const { countrySnapshot } = await import("../src/core/snapshot.ts");
  const ctx = { baseUrl: "https://statcite.com", now: () => new Date("2026-08-14T00:00:00Z") } as never;

  for (const name of ["Montserrat", "Anguilla"]) {
    const s = await countrySnapshot(ctx, name);
    assert.ok(s.indicators.length > 0, `${name} must return indicators, not an error`);
    assert.ok(
      s.indicators.every((i) => typeof i.value === "number" && Number.isFinite(i.value)),
      `${name} indicators must carry real values`,
    );
    assert.ok(
      s.indicators.every((i) => i.citation?.citation_text?.includes("Eastern Caribbean Central Bank")),
      `${name} items must cite the bank that published them`,
    );
    assert.ok(
      s.notes.some((n) => /Eastern Caribbean Central Bank/.test(n)),
      `${name} must say these are not World Bank figures on World Bank definitions`,
    );
  }
});

test("the ECCU supplement is scoped to ECCU geographies only", async () => {
  // Additive, never substitutive. The gate is asserted directly rather than by
  // taking a live World Bank snapshot, because a test that needs the network to
  // prove a scoping rule fails for reasons that have nothing to do with the rule.
  const { ECCU_ISO3 } = await import("../src/core/snapshot.ts");
  for (const iso3 of ["AIA", "MSR", "ATG", "DMA", "GRD", "KNA", "LCA", "VCT", "XCU"]) {
    assert.ok(ECCU_ISO3.has(iso3), `${iso3} is an ECCB geography and must be in scope`);
  }
  for (const iso3 of ["JPN", "USA", "GBR", "BRB", "JAM", "TTO"]) {
    assert.ok(!ECCU_ISO3.has(iso3), `${iso3} must not receive ECCB items: different bank, different definitions`);
  }
  // Barbados is the sharp case. It is Caribbean and it IS covered here, but by
  // the Central Bank of Barbados, not the ECCB, so it must never pick up EC$
  // figures from the currency union.
  assert.ok(!ECCU_ISO3.has("BRB"));
});

// --- search must surface regional data without polluting global queries ---

test("a Caribbean query finds the bank that publishes it", async () => {
  const { searchCaribstat } = await import("../src/adapters/caribstat.ts");
  const debt = searchCaribstat("anguilla debt");
  assert.ok(debt.length, "'anguilla debt' must return something");
  assert.equal(debt[0].iso3, "AIA", "the country in the query must select the geography");
  assert.match(debt[0].id, /total-public-sector-debt\/AIA/);

  const infl = searchCaribstat("montserrat inflation");
  assert.equal(infl[0].iso3, "MSR");
  assert.match(infl[0].id, /consumer-price-index\/MSR/);

  const bop = searchCaribstat("barbados balance of payments");
  assert.ok(bop.some((h) => h.id.includes("CBB/balance-of-payments-reports")),
    "a Barbados BOP query must reach the Central Bank of Barbados");
});

test("A GLOBAL QUERY IS NOT ANSWERED WITH NINE-COUNTRY REGIONAL TABLES", async () => {
  // The failure this prevents is subtle and would look like success: someone
  // asks about Japan or a generic topic and gets an EC$ table covering nine
  // small economies, ranked as though it answered the question. Regional data
  // needs regional intent, otherwise it stays out of the way.
  const { searchCaribstat } = await import("../src/adapters/caribstat.ts");
  for (const q of ["japan gdp", "united states unemployment", "germany trade", "world population"]) {
    assert.equal(searchCaribstat(q).length, 0, `'${q}' must not return regional Caribbean tables`);
  }
});

test("the catalogue describes tables that actually exist", async () => {
  // A catalogue is a promise about the corpus. If it drifts, search sends
  // callers to ids that 404, which is worse than not surfacing them at all.
  const { CARIBSTAT_CATALOGUE, ECCB_GEOGRAPHIES, caribstatUrl, parseCaribstatId } =
    await import("../src/adapters/caribstat.ts");
  assert.ok(CARIBSTAT_CATALOGUE.length >= 10);
  for (const e of CARIBSTAT_CATALOGUE) {
    assert.ok(e.topics.length > 0, `${e.table} needs searchable topics`);
    assert.ok(e.sampleRow.length > 0, `${e.table} needs a sample row for the usage hint`);
    const id = e.provider === "ECCB"
      ? `caribstat/ECCB/${e.table}/AIA.${e.freqs![0]}`
      : `caribstat/CBB/${e.table}/${e.sheets![0]}`;
    // Every advertised id must at least be well formed and routable.
    const parsed = parseCaribstatId(id);
    assert.equal(parsed.provider, e.provider);
    assert.ok(caribstatUrl(parsed).startsWith("https://"), `${id} must build a URL`);
  }
  assert.equal(Object.keys(ECCB_GEOGRAPHIES).length, 9, "nine ECCB geographies incl. the union aggregate");
});

// --- economies the main chain cannot serve GDP for at all -----------------

test("GDP for Anguilla, Montserrat and BVI is offered as history, labelled as history", async () => {
  // The World Bank and IMF publish no GDP series for these three. UNCTAD does,
  // 1971 to 2019, reachable through the existing DBnomics adapter with no new
  // source. The only reason nobody found it is that you had to know the code.
  //
  // It is surfaced through SEARCH and deliberately NOT wired into gdp_growth.
  // The series ends in 2019, and "what is Anguilla's GDP growth" almost always
  // means now. Answering with a six-year-old figure would be exactly the
  // quietly wrong answer this service exists to prevent, so the range is stated
  // in the result and the caller decides.
  const { searchUnctadGap } = await import("../src/adapters/caribstat.ts");

  for (const [q, iso3] of [["anguilla gdp", "AIA"], ["montserrat gdp growth", "MSR"],
                           ["british virgin islands economy", "VGB"]] as const) {
    const hits = searchUnctadGap(q);
    assert.equal(hits.length, 1, `'${q}' must surface the UNCTAD route`);
    assert.equal(hits[0].iso3, iso3);
    assert.match(hits[0].id, /UNCTAD\/GDPTAPCGRA/);
  }

  // Not triggered without GDP intent: an Anguilla DEBT query is already served
  // properly by the ECCB and must not be cluttered with a 2019 GDP series.
  assert.equal(searchUnctadGap("anguilla debt").length, 0);
  assert.equal(searchUnctadGap("anguilla tourism").length, 0);
  // Not triggered for economies the main chain covers.
  assert.equal(searchUnctadGap("japan gdp").length, 0);
  assert.equal(searchUnctadGap("barbados gdp").length, 0);
});

// --- a repeated row label is not one series -------------------------------
//
// Found 2026-08-15 by scanning every ECCB document for the defect classes CBB
// had just produced. 27 of 154 carry repeated row labels: the Anguilla fiscal
// accounts list "Domestic" three times, under Interest Payments, under
// Financing and under Arrears, with completely different values. selectRow
// took the FIRST exact match, so `#Domestic` served one series and hid two,
// looking perfectly healthy. The prefix branch had guarded against exactly
// this; the exact branch had not.

const REPEATED: any = {
  table_id: "central-government-fiscal-accounts",
  country: { iso3: "AIA", name: "Anguilla" },
  series: [
    { label: "Interest Payments", observations: [{ period: "2021", value: 8.38 }] },
    { label: "Domestic", observations: [{ period: "2021", value: 2.41 }] },
    { label: "Financing", observations: [{ period: "2021", value: -3.93 }] },
    { label: "Domestic", observations: [{ period: "2021", value: 0.12 }] },
    { label: "Arrears", observations: [{ period: "2021", value: 0 }] },
    { label: "Domestic", observations: [{ period: "2021", value: 0 }] },
  ],
};

test("a repeated row label is refused, not silently resolved to the first", () => {
  assert.throws(
    () => selectRow(REPEATED, "Domestic"),
    (e: any) => {
      assert.match(String(e.message), /matches 3 different rows/);
      assert.equal(e.details.occurrences, 3);
      assert.match(String(e.message), /Domestic\[1\]/, "the message must make the rows selectable");
      return true;
    },
  );
});

test("an occurrence selector reaches each repeated row", () => {
  assert.equal(selectRow(REPEATED, "Domestic[1]").observations[0].value, 2.41);
  assert.equal(selectRow(REPEATED, "Domestic[2]").observations[0].value, 0.12);
  assert.equal(selectRow(REPEATED, "Domestic[3]").observations[0].value, 0);
});

test("the served label says which occurrence it is", () => {
  // Otherwise three different series carry an identical citation, which is
  // the same ambiguity moved to the last place it can still mislead.
  assert.equal(selectRow(REPEATED, "Domestic[2]").label, "Domestic [2 of 3]");
});

test("the label a response returns can be pasted straight back in", () => {
  const label = selectRow(REPEATED, "Domestic[2]").label;
  assert.equal(selectRow(REPEATED, label).observations[0].value, 0.12, `round-trip of ${label}`);
});

test("a unique label gains no occurrence suffix", () => {
  assert.equal(selectRow(REPEATED, "Arrears").label, "Arrears");
});

test("an out-of-range occurrence says how many there are", () => {
  assert.throws(() => selectRow(REPEATED, "Domestic[4]"), /occurs 3 time\(s\)/);
});

test("a unique label is unaffected by any of this", () => {
  assert.equal(selectRow(REPEATED, "Financing").observations[0].value, -3.93);
  assert.equal(selectRow(REPEATED, "financing").observations[0].value, -3.93, "still case-insensitive");
});

// --- search must not recommend a series that cannot be fetched ------------
//
// searchCaribstat builds its suggestion id from the FIRST sheet a catalogue
// entry lists: `caribstat/CBB/{table}/{sheets[0]}`. Those sheet names were
// written by hand and were wrong. `real-gdp`, `tourism` and `unemployment`
// were suggested where the real ids are `real-gdp-2010-prices`,
// `h1-processing` and `table-i5`, so following any CBB suggestion returned
// HTTP 422. A recommendation that cannot be fetched is worse than none: the
// caller assumes they typed it wrong.
//
// The catalogue is now generated from the published data by
// caribstat/tools/cbb/catalogue.mjs. These guard the shape of it.

test("every CBB catalogue entry can build a well-formed series id", async () => {
  const { CARIBSTAT_CATALOGUE, parseCaribstatId, caribstatUrl } = await import("../src/adapters/caribstat.ts");
  const real = JSON.parse(readFileSync(new URL("./fixtures/cbb-sheets.json", import.meta.url), "utf8"));
  const cbb = CARIBSTAT_CATALOGUE.filter((e) => e.provider === "CBB");
  assert.ok(cbb.length >= 16, `expected the full CBB catalogue, got ${cbb.length}`);
  for (const e of cbb) {
    assert.ok(e.sheets?.length, `${e.table} lists no sheets, so search cannot build an id for it`);
    for (const sheet of e.sheets) {
      assert.match(sheet, /^[a-z0-9][a-z0-9-]*$/, `${e.table}/${sheet} is not a slug`);
      // Shape is not enough, and this is the whole point. Every wrong name was
      // slug-shaped: "real-gdp" looks perfectly valid and does not exist. The
      // manifest holds the ids the pipeline actually publishes, regenerated by
      // caribstat/tools/cbb/catalogue.mjs alongside the catalogue itself, so a
      // hand-edit to one and not the other fails here.
      assert.ok(
        (real[e.table] ?? []).includes(sheet),
        `${e.table}/${sheet} is not a published sheet; search would suggest an id that 422s. ` +
          `Real sheets: ${(real[e.table] ?? []).join(", ") || "(none)"}`,
      );
    }
    // The exact id search would hand out must parse and resolve to a URL.
    const id = `caribstat/CBB/${e.table}/${e.sheets[0]}`;
    const parsed = parseCaribstatId(id);
    assert.equal(parsed.provider, "CBB", id);
    assert.ok(caribstatUrl(parsed).startsWith("https://"), `${id} must build a URL`);
  }
});

test("the CBB catalogue covers every category the pipeline publishes", async () => {
  // Written out independently of the catalogue, so adding a category to one
  // and forgetting the other fails here rather than silently leaving the new
  // data unreachable by search. That is what happened to eleven categories.
  const published = [
    "balance-of-payments-reports",
    "commercial-banks-deposit-liabilities",
    "commercial-banks-provisional-deposit-liabilities",
    "depository-corporations-survey",
    "exchange-rates-cbob",
    "financial-soundness-indicators",
    "gross-domestic-product",
    "index-of-industrial-production",
    "inflation-and-retail-price-index",
    "interest-rates",
    "international-reserves",
    "labour-statistics",
    "statistics",
    "the-wages-index",
    "tourism",
    "trade-in-goods-barbados",
  ];
  const { CARIBSTAT_CATALOGUE } = await import("../src/adapters/caribstat.ts");
  const listed = CARIBSTAT_CATALOGUE.filter((e) => e.provider === "CBB").map((e) => e.table).sort();
  assert.deepEqual(listed, [...published].sort());
});

test("no catalogue entry carries a sample row it cannot show", async () => {
  const { CARIBSTAT_CATALOGUE } = await import("../src/adapters/caribstat.ts");
  for (const e of CARIBSTAT_CATALOGUE) {
    assert.ok(e.title && e.title.trim() !== "", `${e.table} has no title`);
    assert.ok(e.topics?.length, `${e.table} has no search topics, so nothing will ever match it`);
    if (e.provider === "CBB") {
      assert.ok(e.sampleRow && e.sampleRow.trim() !== "", `${e.table} has no sample row`);
    }
  }
});
