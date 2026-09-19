// Anguilla and Montserrat: the registry chain has nothing, the ECCB does.
// Live on 2026-09-12, govt_debt_gdp for Anguilla answered with three glued
// upstream errors, one of them raw DBnomics JSON, and no pointer anywhere.

import { test } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, call, mcpTool } from "./helpers.ts";
import { STANDARD_DM_METADATA, dmValuesBody, isDataMapperMetadataUrl, DM_CODES, isDataMapperValuesUrl } from "./dm-fixtures.ts";

function stubAbsentEverywhere() {
  installFetchStub();
  const json = (body: unknown, status = 200) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.worldbank.org")) return json([{ page: 1, pages: 0, per_page: 1000, total: 0 }, null]);
    if (isDataMapperMetadataUrl(url)) return json(STANDARD_DM_METADATA);
    if (isDataMapperValuesUrl(url, DM_CODES.govt_debt_gdp)) return json(dmValuesBody(DM_CODES.govt_debt_gdp, { USA: { "2024": 120 } }));
    if (url.includes("datamapper")) return json(dmValuesBody("X", {}));
    if (url.includes("db.nomics.world")) return json({ _meta: { version: "22" }, message: "Series 'IMF/WEO:2025-04/AIA.GGXWDG_NGDP.pcent_gdp' not found" }, 404);
    return json({ error: "unexpected " + url }, 404);
  }) as typeof fetch;
}

test("govt_debt_gdp for Anguilla points at the ECCB series and says the definitions differ", async () => {
  stubAbsentEverywhere();
  const { isError, payload } = await mcpTool("get_indicator", { indicator: "govt_debt_gdp", country: "Anguilla" });
  assert.equal(isError, true, "nothing may be substituted under the registry key");
  assert.match(payload.error, /Eastern Caribbean Central Bank/);
  assert.match(payload.error, /caribstat\/ECCB\/debt-to-gdp\/AIA\.a#Total Public Sector Debt to GDP/);
  assert.match(payload.error, /not the IMF's general government gross debt/);
  assert.doesNotMatch(payload.error, /_meta|\{"/, "no raw upstream JSON in the message");
  assert.equal(payload.details.no_published_data, true);
  assert.equal(payload.details.related_series.length, 2);
  assert.ok(Array.isArray(payload.details.sources) && payload.details.sources.length >= 2);
  for (const s of payload.details.sources) assert.doesNotMatch(s.reason, /\{"_meta"/, "reasons must not carry pasted response bodies");
});

test("inflation_cpi for Montserrat points at the ECCB end-of-period series", async () => {
  stubAbsentEverywhere();
  const res = await call("/v1/indicator/inflation_cpi?country=MSR&latest_only=true");
  assert.equal(res.status, 422);
  const body = await res.json() as any;
  assert.match(body.error.message, /caribstat\/ECCB\/consumer-price-index\/MSR\.a#Inflation Rate - end of period/);
  assert.match(body.error.message, /end of period/);
});

test("compare_sources for Anguilla shows the ECCB rows with their definition, outside the spread", async () => {
  stubAbsentEverywhere();
  const inner = globalThis.fetch;
  const eccbDoc = {
    source: "Eastern Caribbean Central Bank", source_id: "eccb", source_url: "https://www.eccb-centralbank.org/",
    table_id: "debt-to-gdp", table_title: "Debt to Gross Domestic Product", country: { iso3: "AIA", name: "Anguilla" },
    frequency: "a", data_as_at: "2026-06-08", retrieved_at: "2026-09-01T00:00:00Z", periods: ["2024", "2025"],
    series: [
      { label: "Central Government Debt to GDP", unit: "%", observations: [{ period: "2024", value: 18.1 }, { period: "2025", value: 17.2 }] },
      { label: "Total Public Sector Debt to GDP", unit: "%", observations: [{ period: "2024", value: 21.0 }, { period: "2025", value: 20.45 }] },
    ],
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/data/eccb/debt-to-gdp/a/AIA.json")) {
      return new Response(JSON.stringify(eccbDoc), { status: 200, headers: { "content-type": "application/json" } });
    }
    return inner(input, init);
  }) as typeof fetch;
  try {
    const { isError, payload } = await mcpTool("compare_sources", { indicator: "govt_debt_gdp", country: "AIA" });
    assert.equal(isError, false, JSON.stringify(payload).slice(0, 400));
    const eccb = payload.results.filter((r: any) => r.excluded_from_comparison);
    assert.equal(eccb.length, 2, "both ECCB debt ratios must appear: " + JSON.stringify(payload.results));
    const total = eccb.find((r: any) => /Total public sector/i.test(r.source));
    assert.equal(total.ok, true);
    assert.equal(total.value, 20.45);
    assert.match(total.note, /not the IMF's general government gross debt/);
    assert.ok(total.citation, "the ECCB row must carry its own citation");
    assert.equal(payload.comparison, undefined, "ECCB rows must never form a spread on their own");
  } finally {
    globalThis.fetch = inner;
  }
});

test("an economy outside the ECCU gets the plain absence sentence, with no ECCB pointer", async () => {
  stubAbsentEverywhere();
  const { isError, payload } = await mcpTool("get_indicator", { indicator: "govt_debt_gdp", country: "Nauru" });
  assert.equal(isError, true);
  assert.doesNotMatch(payload.error, /Eastern Caribbean/);
  assert.match(payload.error, /None of the sources for 'govt_debt_gdp'/);
  assert.doesNotMatch(payload.error, /_meta|\{"/);
});

// --- a coverage gap the bank can speak to is a verdict, not a failure --------

const ECCB_DEBT_DOC = {
  source: "Eastern Caribbean Central Bank",
  source_id: "eccb",
  source_url: "https://www.eccb-centralbank.org/statistics",
  table_id: "debt-to-gdp",
  table_title: "Debt to Gross Domestic Product",
  country: { iso3: "AIA", name: "Anguilla" },
  frequency: "a",
  data_as_at: "2026-06-08",
  retrieved_at: "2026-08-13T16:28:44.604Z",
  periods: ["2024", "2025"],
  periods_raw: ["2024", "2025"],
  series: [
    { label: "Central Government Debt to GDP", unit: "%", observations: [{ period: "2024", value: 18.1 }, { period: "2025", value: 17.2 }] },
    { label: "Total Public Sector Debt to GDP", unit: "%", observations: [{ period: "2024", value: 21.0 }, { period: "2025", value: 20.45 }] },
  ],
};

function stubAbsentWithEccb() {
  stubAbsentEverywhere();
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/data/eccb/debt-to-gdp/a/AIA.json")) {
      return new Response(JSON.stringify(ECCB_DEBT_DOC), { status: 200, headers: { "content-type": "application/json" } });
    }
    return inner(input as never, init as never);
  }) as typeof fetch;
}

test("verify_stat for Anguilla answers cannot_verify with the ECCB figures, never an error", async () => {
  stubAbsentWithEccb();
  const { isError, payload } = await mcpTool("verify_stat", {
    indicator: "govt_debt_gdp",
    country: "AIA",
    period: "2025",
    claimed_value: 20.5,
  });
  assert.equal(isError, false, JSON.stringify(payload).slice(0, 300));
  assert.equal(payload.verdict, "cannot_verify");
  assert.equal(payload.official_value, null, "an ECCB figure must never be served under the registry key's label");
  assert.equal(payload.not_verified_because, "no_published_data");
  assert.equal(payload.related_series.length, 2);
  assert.match(payload.explanation, /^This is not a verification of govt_debt_gdp for Anguilla/);
  assert.match(payload.explanation, /not the IMF's general government gross debt/);
  assert.equal(payload.citation.source, "Eastern Caribbean Central Bank");
  assert.ok(payload.diagnostics.some((d: string) => d.includes("20.45")), JSON.stringify(payload.diagnostics));
  assert.ok(payload.diagnostics.every((d: string) => /orientation only/.test(d)), JSON.stringify(payload.diagnostics));
});

test("verify_claims counts that as cannot_verify, not as an error", async () => {
  stubAbsentWithEccb();
  const { payload } = await mcpTool("verify_claims", {
    claims: [{ indicator: "govt_debt_gdp", country: "AIA", period: "2025", claimed_value: 20.5 }],
  });
  assert.equal(payload.summary.error, 0, JSON.stringify(payload.summary));
  assert.equal(payload.summary.cannot_verify, 1, JSON.stringify(payload.summary));
});

test("an economy with no related series still fails, rather than inventing an orientation answer", async () => {
  stubAbsentWithEccb();
  const { isError } = await mcpTool("verify_stat", {
    indicator: "govt_debt_gdp",
    country: "Nauru",
    period: "2025",
    claimed_value: 20.5,
  });
  assert.equal(isError, true);
});
