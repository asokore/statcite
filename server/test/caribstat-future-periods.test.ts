// The ECCB shades 2026 as future data on the annual tables that reach it, and an
// answer that serves that year as a settled figure says more than the bank does.
// Trade in Services has 408 rows, so a bare id cannot stand for it, and a row has
// to be findable from the words a caller would use.

import { test } from "node:test";
import assert from "node:assert/strict";
import { _clearReviewsBackoff, CARIBSTAT_CATALOGUE, fetchCaribstatSeries, searchCaribstat, selectRow } from "../src/adapters/caribstat.ts";
import { deriveLimitations } from "../src/core/limitations.ts";
import { getSeries, searchIndicators } from "../src/core/series.ts";
import { verifyStat } from "../src/core/verify.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const DOC = (extra: Record<string, unknown> = {}) => ({
  source: "Eastern Caribbean Central Bank", source_id: "eccb",
  source_url: "https://www.eccb-centralbank.org/statistics", table_id: "t", table_title: "T",
  country: { iso3: "AIA", name: "Anguilla" }, frequency: "a", periods: ["2025", "2026"],
  series: [{ label: "Row", unit: "EC$M", observations: [{ period: "2025", value: 100 }, { period: "2026", value: 200 }] }],
  retrieved_at: "2026-11-06T00:00:00Z",
  ...extra,
});
function stub(doc: unknown) {
  _clearMemCache();
  _clearReviewsBackoff();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.includes("/data/reviews.json") ? json({ version: 1, reviews: [] }) : json(doc);
  }) as typeof fetch;
}
const ctx = { baseUrl: "https://statcite.test", now: () => new Date("2026-11-06T00:00:00Z") } as never;
const ID = "caribstat/ECCB/total-public-sector-debt/AIA.a#Row";
const verify = (period: string, claimed_value: number) => verifyStat(ctx, { indicator: ID, period, claimed_value } as never);

test("a shaded period carries the bank's marking, on the value and on the series", async () => {
  stub(DOC({ future_periods: ["2026"] }));
  const s = await getSeries(ctx, ID);
  const by = new Map(s.observations.map((o) => [o.period, o]));
  assert.match(by.get("2026")?.note ?? "", /shades 2026 as future data/);
  assert.equal(by.get("2025")?.note, undefined, "a year the bank does not shade stays unmarked");
  assert.equal(s.notes.filter((n) => /shades 2026 as future data/.test(n)).length, 1, JSON.stringify(s.notes));
});

test("verify_stat does not report a shaded year as settled", async () => {
  stub(DOC({ future_periods: ["2026"] }));
  const r = await verify("2026", 200);
  assert.equal(r.verdict, "match");
  assert.equal(r.is_projection, true);
  assert.equal(r.observation_status, "projection");
  assert.match(r.explanation, /a period the ECCB shades as future data/);
  assert.doesNotMatch(r.explanation, /IMF/);
});

test("latest_only does not offer a shaded year as the latest settled figure", async () => {
  stub(DOC({ future_periods: ["2026"] }));
  const s = await getSeries(ctx, ID, { limit: 1 });
  assert.deepEqual(s.observations.map((o) => o.period), ["2025"]);
  assert.ok(s.notes.some((n) => /before the periods the ECCB shades as future data/.test(n)), JSON.stringify(s.notes));
  assert.ok(!s.notes.some((n) => /IMF/.test(n)), "the IMF wording stays with the IMF");
  stub(DOC({ future_periods: ["2025", "2026"] }));
  assert.deepEqual((await getSeries(ctx, ID, { limit: 1 })).observations.map((o) => o.period), ["2026"], "with only shaded years, the latest is still served");
});

test("a shaded year raises the projection limitation in the bank's own terms", async () => {
  stub(DOC({ future_periods: ["2026"] }));
  const hit = deriveLimitations(await getSeries(ctx, ID), {}).filter((l) => l.code === "projection");
  assert.equal(hit.length, 1);
  assert.match(hit[0].detail, /1 of 2 returned value\(s\) fall in a period the ECCB shades as future data \(2026\)/);
  assert.ok(!/IMF|heuristic/.test(hit[0].detail), hit[0].detail);
  stub(DOC({}));
  assert.ok(!deriveLimitations(await getSeries(ctx, ID), {}).some((l) => l.code === "projection"), "an unshaded series raises nothing");
});

test("verify_stat treats an unshaded year as before", async () => {
  stub(DOC({ future_periods: ["2026"] }));
  const r = await verify("2025", 100);
  assert.equal(r.is_projection, false);
  assert.notEqual(r.observation_status, "projection");
  stub(DOC());
  assert.equal((await verify("2026", 200)).is_projection, false, "a document with no field makes no claim");
});

test("a shaded period the document does not hold, or a null value, gets no marking", async () => {
  stub(DOC({ future_periods: ["2031", 7] }));
  assert.equal((await getSeries(ctx, ID)).notes.some((n) => /future data/.test(n)), false);
  stub(DOC({ future_periods: 2026 }));
  assert.equal((await getSeries(ctx, ID)).observations.length, 2, "a malformed field cannot take the series down");
  const nulled = DOC({ future_periods: ["2026"] });
  (nulled.series as any)[0].observations[1].value = null;
  stub(nulled);
  assert.equal((await getSeries(ctx, ID)).notes.some((n) => /future data/.test(n)), false);
});

test("a bare Trade in Services id is refused and names the row to ask for", async () => {
  stub(DOC());
  await assert.rejects(
    () => fetchCaribstatSeries("caribstat/ECCB/trade-in-services/GRD.a"),
    (e: Error & { details?: Record<string, unknown> }) => {
      assert.match(e.message, /needs a row/);
      assert.match(e.message, /caribstat\/ECCB\/trade-in-services\/GRD\.a#Total EBOPS Services: Exports: TOTAL/);
      assert.equal(e.details?.example_row, "Total EBOPS Services: Exports: TOTAL");
      return true;
    },
  );
  const named = await fetchCaribstatSeries("caribstat/ECCB/trade-in-services/GRD.a#Row");
  assert.equal(named.label, "Row", "a named row is served");
  assert.equal(
    (await fetchCaribstatSeries("caribstat/ECCB/total-public-sector-debt/AIA.a")).label,
    "Row",
    "other tables keep the default row",
  );
});

test("a row can be found by the words inside its label", () => {
  const labels = ["Total EBOPS Services: Exports: TOTAL", "4. Travel: Imports: TOTAL", "4. Travel: Exports: TOTAL"];
  const doc = { table_id: "trade-in-services", country: { iso3: "AIA", name: "Anguilla" }, series: labels.map((label) => ({ label, observations: [] })) } as never;
  assert.throws(() => selectRow(doc, "Travel"), (e: Error) => /2 row\(s\) contain those words: 4\. Travel: Imports: TOTAL \| 4\. Travel: Exports: TOTAL\. Use the exact label/.test(e.message));
  assert.throws(() => selectRow(doc, "Fisheries"), (e: Error) => /Available rows: Total EBOPS/.test(e.message));
});

test("search finds Trade in Services on everyday wording, and gives MCP a usable id", async () => {
  for (const q of ["grenada travel exports", "exports of services dominica", "anguilla trade in services"]) {
    assert.ok(searchCaribstat(q, 4).some((h) => h.entry.table === "trade-in-services"), q);
  }
  const entry = CARIBSTAT_CATALOGUE.find((e) => e.table === "trade-in-services");
  assert.ok(entry?.rowRequired);
  const hits = await searchIndicators({ ...(ctx as object), surface: "mcp" } as never, "grenada services exports", { includeDbnomics: false });
  const hit = (Array.isArray(hits) ? hits : (hits as any).results ?? (hits as any).items ?? []).find((h: any) => h.id?.includes("trade-in-services"));
  assert.ok(hit, JSON.stringify(hits).slice(0, 300));
  assert.match(hit.usage, /series_id="caribstat\/ECCB\/trade-in-services\/GRD\.a#Total EBOPS Services: Exports: TOTAL"/);
});
