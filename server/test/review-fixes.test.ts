// Regression tests for the adversarial review of the 1.12.2 server commits
// (2026-09-12). Each test names the confirmed finding it protects.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import { STANDARD_DM_METADATA, dmValuesBody, isDataMapperMetadataUrl, isDataMapperValuesUrl, DM_CODES } from "./dm-fixtures.ts";
import { installFetchStub, mcpTool } from "./helpers.ts";

type Route = (url: string) => Response | undefined;
const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stub(route: Route) {
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return route(url) ?? json({ error: "unstubbed " + url }, 404);
  }) as typeof fetch;
}

type Point = { blobs?: string[] };
function envWith(points?: Point[]): Env {
  return {
    ASSETS: { fetch: async () => new Response("site") },
    BASE_URL: "https://statcite.com",
    ...(points ? { STATCITE_USAGE: { writeDataPoint: (p: Point) => void points.push(p) } } : {}),
  } as unknown as Env;
}

async function rest(path: string, init?: RequestInit, env = envWith()) {
  const res = await handleRequest(new Request("https://statcite.com" + path, init), env);
  return { status: res.status, body: (await res.json()) as any };
}

const WB_EMPTY = [{ page: 0, pages: 0, per_page: 0, total: 0 }, []];

const CBB_DOC = {
  source: "Central Bank of Barbados", source_id: "cbb", source_url: "https://www.centralbank.org.bb/",
  table_id: "inflation-and-retail-price-index", table_title: "Retail Price Index and Rate of Inflation", sheet: "jul2001-eop",
  country: { iso3: "BRB", name: "Barbados" }, frequency: "a", retrieved_at: "2026-09-01T00:00:00Z",
  periods: ["2018", "2019", "2020"],
  series: [
    { label: "Food", unit: "index", observations: [{ period: "2018", value: 110 }, { period: "2019", value: 112 }, { period: "2020", value: 115 }] },
    { label: "Inflation Rate %", unit: "%", observations: [{ period: "2018", value: 3.7 }, { period: "2019", value: 4.1 }, { period: "2020", value: 2.9 }] },
  ],
};

test("a one-sided window outside the published range is out_of_range, not an interior gap", async () => {
  stub((u) => (u.includes("/data/cbb/") ? json(CBB_DOC) : undefined));
  const id = encodeURIComponent("caribstat/CBB/inflation-and-retail-price-index/jul2001-eop#Inflation Rate %");
  for (const qs of ["start_year=2030", "end_year=1950"]) {
    const { status, body } = await rest(`/v1/series?id=${id}&${qs}`);
    assert.equal(status, 422, qs);
    assert.equal(body.error.code, "out_of_range", `${qs}: ${JSON.stringify(body.error)}`);
    assert.doesNotMatch(body.error.message, /as missing|gap inside/, qs);
    assert.match(body.error.message, /adjust the year range/, qs);
    assert.equal(body.error.details.gap_in_published_range, undefined, qs);
  }
});

test("an outage on a registry path is upstream_unavailable, not the caller's fault", async () => {
  stub(() => json({ error: "down" }, 503));
  const r = await rest("/v1/indicator/inflation_cpi?country=BRB");
  assert.equal(r.body.error.code, "upstream_unavailable", JSON.stringify(r.body.error).slice(0, 300));
  stub(() => json({ error: "down" }, 503));
  const m = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB" });
  assert.equal(m.payload.code, "upstream_unavailable");
});

test("one source's absence next to another source's outage is not reported as no data", async () => {
  // Taiwan: the World Bank publishes nothing, the IMF does, but is down.
  stub((u) => (u.includes("api.worldbank.org") ? json(WB_EMPTY) : json({ error: "down" }, 503)));
  const { body } = await rest("/v1/indicator/gdp_growth?country=TWN");
  assert.equal(body.error.code, "upstream_unavailable", JSON.stringify(body.error).slice(0, 300));
  assert.equal(body.error.details.no_published_data, undefined, "top-level details must not claim absence");
  const wb = body.error.details.sources.find((s: any) => /World Bank/.test(s.source));
  assert.equal(wb.no_published_data, true, "the World Bank's own absence stays visible per source");
});

test("one source's absence next to another's window miss keeps the available range", async () => {
  const twn: Record<string, number> = {};
  for (let y = 1980; y <= 2031; y++) twn[String(y)] = 3;
  stub((u) => {
    if (u.includes("api.worldbank.org")) return json(WB_EMPTY);
    if (isDataMapperMetadataUrl(u)) return json(STANDARD_DM_METADATA);
    if (isDataMapperValuesUrl(u, DM_CODES.gdp_growth)) return json(dmValuesBody(DM_CODES.gdp_growth, { TWN: twn }));
    return undefined;
  });
  const { body } = await rest("/v1/indicator/gdp_growth?country=TWN&start_year=1970&end_year=1975");
  assert.doesNotMatch(body.error.message, /None of the sources/, "the IMF does publish Taiwan");
  assert.equal(body.error.code, "out_of_range", JSON.stringify(body.error).slice(0, 400));
  assert.ok(body.error.details.available_range, "available_range must reach top-level details");
});

test("a declined request (403) is a failure, not an absence, and gets no ECCB redirect", async () => {
  stub((u) => (u.includes("api.worldbank.org") ? json([{ page: 1, pages: 1, per_page: 50, total: 1 }, [{ indicator: { id: "GC.DOD.TOTL.GD.ZS", value: "x" }, country: { id: "AG", value: "Antigua and Barbuda" }, countryiso3code: "ATG", date: "2024", value: null }]]) : json("blocked", 403)));
  const m = await mcpTool("get_indicator", { indicator: "govt_debt_gdp", country: "ATG" });
  assert.equal(m.isError, true);
  assert.doesNotMatch(m.payload.error, /None of the sources|Eastern Caribbean Central Bank publishes/);
  assert.notEqual(m.payload.code, "no_published_data");
});

test("the absence pointer reports the registry key, not a source's code, as details.indicator", async () => {
  stub((u) => {
    if (u.includes("api.worldbank.org")) return json(WB_EMPTY);
    if (isDataMapperMetadataUrl(u)) return json(STANDARD_DM_METADATA);
    if (isDataMapperValuesUrl(u, DM_CODES.govt_debt_gdp)) return json(dmValuesBody(DM_CODES.govt_debt_gdp, { USA: { "2024": 120 } }));
    if (u.includes("db.nomics.world")) return json({ message: "not found" }, 404);
    return undefined;
  });
  const m = await mcpTool("get_indicator", { indicator: "govt_debt_gdp", country: "AIA" });
  assert.match(m.payload.error, /Eastern Caribbean Central Bank/, "all sources absent must still reach the pointer");
  assert.equal(m.payload.details.indicator, "govt_debt_gdp");
  assert.equal(m.payload.code, "no_published_data");
});

test("an unknown indicator is unknown_indicator on every route that takes one", async () => {
  installFetchStub();
  const compare = await rest("/v1/compare?indicator=inflaton_cpi&country=BRB");
  assert.equal(compare.body.error.code, "unknown_indicator");
  const imf = await rest("/v1/series?id=imf/NOT_A_CODE&country=USA");
  assert.equal(imf.body.error.code, "unknown_indicator");
  const series = await rest("/v1/series?id=inflaton_cpi&country=USA");
  assert.equal(series.body.error.code, "unknown_indicator");
  const cs = await mcpTool("compare_sources", { indicator: "inflaton_cpi", country: "BRB" });
  assert.equal(cs.payload.code, "unknown_indicator");
});

test("a client-injected toolCallId does not break the call", async () => {
  installFetchStub();
  const m = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB", latest_only: true, toolCallId: "call_0BCIShth4lxZuYr4coSp4E5E" });
  assert.equal(m.isError, false, JSON.stringify(m.payload).slice(0, 300));
  const ls = await mcpTool("list_sources", { toolCallId: "call_x" });
  assert.equal(ls.isError, false);
  // A genuine unknown name is still refused.
  const bad = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB", tolerence: 1 });
  assert.equal(bad.isError, true);
});

test("null for an optional boolean means absent, as for every other optional argument", async () => {
  installFetchStub();
  const m = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB", latest_only: null, strict_source: null });
  assert.equal(m.isError, false, JSON.stringify(m.payload).slice(0, 300));
  const s = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB", strict_source: "true" });
  assert.equal(s.isError, true, "a string boolean is still refused");
  installFetchStub();
  const r = await rest("/v1/verify_claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claims: [{ indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.4 }], strict_source: null }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
});

test("compare_sources says when an ECCB row is not at the compared year", async () => {
  const eccb = {
    source: "Eastern Caribbean Central Bank", source_id: "eccb", source_url: "https://www.eccb-centralbank.org/",
    table_id: "consumer-price-index", table_title: "Consumer Price Index", country: { iso3: "ATG", name: "Antigua and Barbuda" },
    frequency: "a", data_as_at: "2026-06-08", retrieved_at: "2026-09-01T00:00:00Z", periods: ["2021", "2025"],
    series: [{ label: "Inflation Rate - end of period", unit: "%", observations: [{ period: "2021", value: 1.2 }, { period: "2025", value: 3.08 }] }],
  };
  stub((u) => {
    if (u.includes("/data/eccb/consumer-price-index/a/ATG.json")) return json(eccb);
    if (u.includes("api.worldbank.org")) {
      return json([{ page: 1, pages: 1, per_page: 1000, total: 1 }, [{ indicator: { id: "FP.CPI.TOTL.ZG", value: "Inflation" }, country: { id: "AG", value: "Antigua and Barbuda" }, countryiso3code: "ATG", date: "2019", value: 1.43 }]]);
    }
    return undefined;
  });
  const { payload, isError } = await mcpTool("compare_sources", { indicator: "inflation_cpi", country: "ATG", period: "2019" });
  assert.equal(isError, false, JSON.stringify(payload).slice(0, 300));
  const row = payload.results.find((r: any) => r.excluded_from_comparison && r.ok);
  assert.ok(row, JSON.stringify(payload.results));
  assert.equal(row.period, "2025");
  assert.match(row.note, /does not publish 2019 in this series, so its latest year, 2025, is shown/);
});

test("a trailing '#' on a caribstat id still yields a replayable series_id", async () => {
  stub((u) => (u.includes("/data/cbb/") ? json(CBB_DOC) : undefined));
  const { status, body } = await rest(`/v1/series?id=${encodeURIComponent("caribstat/CBB/inflation-and-retail-price-index/jul2001-eop#")}`);
  assert.equal(status, 200);
  assert.equal(body.series_id, "caribstat/CBB/inflation-and-retail-price-index/jul2001-eop#Food");
  stub((u) => (u.includes("/data/cbb/") ? json(CBB_DOC) : undefined));
  const replay = await rest(`/v1/series?id=${encodeURIComponent(body.series_id)}`);
  assert.equal(replay.status, 200, "the returned series_id must replay");
});

test("the snapshot route logs the country from its path, not a stray query parameter", async () => {
  stub(() => json({ error: "down" }, 404));
  const points: Point[] = [];
  await rest("/v1/snapshot/Japan?country=USA", undefined, envWith(points));
  assert.ok(points.length > 0, "expected an analytics point");
  assert.equal(points[points.length - 1].blobs?.[3], "JPN");
});
