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

test("an economy outside the ECCU gets the plain absence sentence, with no ECCB pointer", async () => {
  stubAbsentEverywhere();
  const { isError, payload } = await mcpTool("get_indicator", { indicator: "govt_debt_gdp", country: "Nauru" });
  assert.equal(isError, true);
  assert.doesNotMatch(payload.error, /Eastern Caribbean/);
  assert.match(payload.error, /None of the sources for 'govt_debt_gdp'/);
  assert.doesNotMatch(payload.error, /_meta|\{"/);
});
