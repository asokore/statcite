// A "latest" value that is not current.
//
// buildSourceAttempts orders sources by a fixed precedence and getIndicator
// takes the first attempt that does not throw. World Bank WDI is primary for
// current_account_gdp, so as long as the WB series returns any observation the
// IMF attempt below it is never run: an economy whose WB balance-of-payments
// series was discontinued in 2017 is handed that number as "latest", with no
// fallback_used flag, no note, and a citation whose retrieved_at is today.
//
// The note says what StatCite knows and stops. It must never say the other
// source is fresher, because sometimes none is.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getIndicator } from "../src/core/series.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import type { Ctx } from "../src/core/types.ts";

function ctxAt(year: number, surface: "rest" | "mcp" = "mcp"): Ctx {
  // Pinned, or this file starts failing on 1 January.
  return { baseUrl: "https://statcite.test", surface, now: () => new Date(`${year}-06-01T00:00:00Z`) } as unknown as Ctx;
}

/** A World Bank envelope for BN.CAB.XOKA.GD.ZS ending at `lastYear`. */
function wbEndingAt(lastYear: number, years = 4) {
  const rows = [];
  for (let y = lastYear; y > lastYear - years; y--) {
    rows.push({
      indicator: { id: "BN.CAB.XOKA.GD.ZS", value: "Current account balance (% of GDP)" },
      country: { id: "BB", value: "Barbados" },
      countryiso3code: "BRB",
      date: String(y),
      value: -3.5 + (y % 3),
      unit: "",
      obs_status: "",
      decimal: 1,
    });
  }
  return JSON.stringify([{ page: 1, pages: 1, per_page: 100, total: rows.length, sourceid: "2", lastupdated: "2026-07-13" }, rows]);
}

/** Only the World Bank answers. Anything else throws, which is the point: the
 * note must be produced without consulting the sources it names. */
function onlyWorldBank(body: string) {
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.includes("api.worldbank.org")) {
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`the fallback must not be queried: ${url}`);
  }) as typeof fetch;
}

test("a 'latest' value years behind the clock says how far behind, and names what it has not checked", async () => {
  onlyWorldBank(wbEndingAt(2017));
  const r = await getIndicator(ctxAt(2026), "current_account_gdp", "BRB", { limit: 1 });
  assert.equal(r.observations[0].period, "2017");
  assert.equal(r.stale_primary, true);
  assert.equal(r.stale_primary_years, 9);
  const note = r.notes.find((n) => /9 years behind 2026/.test(n));
  assert.ok(note, `no horizon note: ${JSON.stringify(r.notes)}`);
  assert.match(note!, /2017/);
  // The load-bearing half. A note that said the other source publishes later
  // periods would be asserting something no request established.
  assert.match(note!, /StatCite has not queried them for this request/);
  assert.match(note!, /whether they publish more recent periods is not known here/);
  // The fabrication this wording exists to avoid: asserting the unqueried
  // source is fresher. For several economies none is.
  assert.doesNotMatch(note!, /which publishe?s? more recent|are fresher|is fresher|has newer/i);
  assert.match(note!, /compare_sources/);
  // And it did not silently become a fallback answer.
  assert.equal(r.fallback_used, undefined);
});

test("the pointer is the one the caller can actually use", async () => {
  // REST bodies naming MCP tools is a live defect in this repo's own review log.
  onlyWorldBank(wbEndingAt(2017));
  const r = await getIndicator(ctxAt(2026, "rest"), "current_account_gdp", "BRB", { limit: 1 });
  const note = r.notes.find((n) => /years behind/.test(n))!;
  assert.match(note, /GET \/v1\/compare\?indicator=current_account_gdp&country=BRB/);
  assert.doesNotMatch(note, /compare_sources/);
});

test("CONTROL: a current primary says nothing, and so does one exactly at the threshold", async () => {
  // A threshold validated only on the class it should catch goes silently wrong
  // on the other. No annual series publishes the current year, so a gap of 1 or
  // 2 is an ordinary refresh lag and 3 is the slow end of normal: 14 economies
  // sat exactly there when this was measured on 2026-09-19.
  for (const [last, label] of [
    [2025, "one year back, the normal case"],
    [2024, "two years back"],
    [2023, "exactly at the threshold"],
  ] as const) {
    onlyWorldBank(wbEndingAt(last));
    const r = await getIndicator(ctxAt(2026), "current_account_gdp", "BRB", { limit: 1 });
    assert.equal(r.stale_primary, undefined, `${label}: must not fire`);
    assert.ok(!r.notes.some((n) => /years behind/.test(n)), `${label}: ${JSON.stringify(r.notes)}`);
  }
  // One year past it does.
  onlyWorldBank(wbEndingAt(2022));
  const r = await getIndicator(ctxAt(2026), "current_account_gdp", "BRB", { limit: 1 });
  assert.equal(r.stale_primary, true, "four years back is past the threshold");
});

test("CONTROL: a caller who can see the horizon is not told it", async () => {
  // A full series shows its own end year, and a caller who pinned end_year
  // asked for the old period. Neither needs a note.
  onlyWorldBank(wbEndingAt(2017));
  const full = await getIndicator(ctxAt(2026), "current_account_gdp", "BRB", {});
  assert.equal(full.stale_primary, undefined, "a full series shows its own last period");

  onlyWorldBank(wbEndingAt(2017));
  const pinned = await getIndicator(ctxAt(2026), "current_account_gdp", "BRB", { limit: 1, end: 2017 });
  assert.equal(pinned.stale_primary, undefined, "the caller asked for that year");
});

test("CONTROL: an indicator with no alternative source makes no claim about alternatives", async () => {
  // The whole content of the note is the names of the sources not consulted.
  // With none to name there is nothing honest left to say.
  _clearMemCache();
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        { page: 1, pages: 1, per_page: 100, total: 1, sourceid: "2", lastupdated: "2026-07-13" },
        [{ indicator: { id: "ST.INT.RCPT.XP.ZS", value: "International tourism, receipts (% of total exports)" }, country: { id: "BB", value: "Barbados" }, countryiso3code: "BRB", date: "2016", value: 44.4, unit: "", obs_status: "", decimal: 1 }],
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  const r = await getIndicator(ctxAt(2026), "tourism_receipts_exports", "BRB", { limit: 1 });
  assert.equal(r.observations[0].period, "2016");
  assert.equal(r.stale_primary, undefined, "World Bank only: there is no second source to name");
});
