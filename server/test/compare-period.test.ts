// compare_sources picks the latest period every source shares. When one
// source ends early that period is old, and the per-source note must describe
// the observation actually compared, not the one first picked.

import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, mcpTool } from "./helpers.ts";
import { dmValuesBody, isDataMapperValuesUrl, DM_CODES } from "./dm-fixtures.ts";

function wbBody(rows: Array<[string, number]>) {
  return JSON.stringify([
    { page: 1, pages: 1, per_page: 100, total: rows.length, sourceid: "2", lastupdated: "2026-07-13" },
    rows.map(([date, value]) => ({
      indicator: { id: "GC.DOD.TOTL.GD.ZS", value: "Central government debt, total (% of GDP)" },
      country: { id: "US", value: "United States" },
      countryiso3code: "USA",
      date,
      value,
      unit: "",
      obs_status: "",
      decimal: 1,
    })),
  ]);
}

test("an outturn compared at an early shared year is not labelled a projection, and the early year is explained", async () => {
  installFetchStub();
  const stub = globalThis.fetch;
  const imf: Record<string, number> = {};
  for (let y = 2014; y <= 2031; y++) imf[String(y)] = 100 + (y - 2014);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.worldbank.org") && url.includes("GC.DOD.TOTL.GD.ZS")) {
      return new Response(wbBody([["2016", 99.1], ["2015", 98.2], ["2014", 97.3]]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (isDataMapperValuesUrl(url, DM_CODES.govt_debt_gdp)) {
      return new Response(dmValuesBody(DM_CODES.govt_debt_gdp, { USA: imf }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return stub(input, init);
  }) as typeof fetch;
  try {
    const { payload, isError } = await mcpTool("compare_sources", { indicator: "govt_debt_gdp", country: "USA" });
    assert.equal(isError, false, JSON.stringify(payload).slice(0, 500));
    assert.equal(payload.period, "2016", "the shared period is 2016");
    const imfRow = payload.results.find((r: any) => r.ok && /IMF/.test(r.source) && r.period === "2016");
    assert.ok(imfRow, "the IMF row should be re-picked at 2016: " + JSON.stringify(payload.results));
    assert.equal(imfRow.note, undefined, "a 2016 outturn must not carry the projection note of 2031");
    const why = (payload.notes as string[]).find((n) => /Compared at 2016/.test(n));
    assert.ok(why, "the notes must explain why the comparison is at 2016: " + JSON.stringify(payload.notes));
    assert.match(why!, /Pass period=20\d\d/);
  } finally {
    globalThis.fetch = stub;
  }
});
