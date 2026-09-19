// REST inputs that used to change the answer without saying so. Each case was
// found on the live service on 2026-09-12.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";

const env = { ASSETS: { fetch: async () => new Response("site") }, BASE_URL: "https://statcite.com" } as unknown as Env;

function noFetch(): () => number {
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (async () => { n++; throw new Error("no upstream call expected"); }) as typeof fetch;
  const restore = () => { globalThis.fetch = real; return n; };
  return restore;
}

async function get(path: string) {
  const res = await handleRequest(new Request("https://statcite.com" + path), env);
  return { res, body: (await res.json()) as any };
}

async function postClaims(body: unknown) {
  const res = await handleRequest(
    new Request("https://statcite.com/v1/verify_claims", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
  return { res, body: (await res.json()) as any };
}

test("a repeated query parameter is refused, not read as its first value", async () => {
  const restore = noFetch();
  try {
    const { res, body } = await get("/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.3&tolerance_abs=0.5&tolerance_abs=0.01");
    assert.equal(res.status, 400);
    assert.match(body.error.message, /'tolerance_abs' was given 2 times/);
  } finally {
    assert.equal(restore(), 0, "no upstream call for a refused request");
  }
});

test("value and claimed_value together are refused, not resolved by dropping one", async () => {
  const restore = noFetch();
  try {
    const { res, body } = await get("/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.1&claimed_value=4.3");
    assert.equal(res.status, 400);
    assert.match(body.error.message, /not both/);
  } finally {
    assert.equal(restore(), 0);
  }
});

test("verify_claims refuses unknown top-level body keys", async () => {
  const restore = noFetch();
  try {
    const claim = { indicator: "inflation_cpi", country: "USA", period: "2023", claimed_value: 4.3 };
    const { res, body } = await postClaims({ claims: [claim], tolerance_abs: 0.01 });
    assert.equal(res.status, 400);
    assert.match(body.error.message, /Unknown body key 'tolerance_abs'/);
    assert.match(body.error.message, /inside each claim/);
  } finally {
    assert.equal(restore(), 0);
  }
});

test("verify_claims refuses strict_source sent as a string", async () => {
  const restore = noFetch();
  try {
    const claim = { indicator: "inflation_cpi", country: "USA", period: "2023", claimed_value: 4.3 };
    const { res, body } = await postClaims({ claims: [claim], strict_source: "true" });
    assert.equal(res.status, 400);
    assert.match(body.error.message, /strict_source' must be a JSON boolean/);
  } finally {
    assert.equal(restore(), 0);
  }
});

test("/v1 JSON and /health carry x-robots-tag noindex", async () => {
  const idx = await handleRequest(new Request("https://statcite.com/v1/"), env);
  assert.equal(idx.headers.get("x-robots-tag"), "noindex");
  const err = await handleRequest(new Request("https://statcite.com/v1/indicator/inflation_cpi?bogus=1"), env);
  assert.equal(err.status, 400);
  assert.equal(err.headers.get("x-robots-tag"), "noindex", "error responses too");
  const health = await handleRequest(new Request("https://statcite.com/health"), env);
  assert.equal(health.headers.get("x-robots-tag"), "noindex");
});

test("an impossible calendar date on /v1/fx is a 422 naming the date, with no upstream call", async () => {
  const restore = noFetch();
  try {
    for (const [from, to] of [["EUR", "JPY"], ["USD", "BBD"]]) {
      const { res, body } = await get(`/v1/fx?amount=100&from=${from}&to=${to}&date=2024-02-30`);
      assert.equal(res.status, 422, `${from}/${to}`);
      assert.match(body.error.message, /2024-02-30 is not a real calendar date/);
    }
  } finally {
    assert.equal(restore(), 0);
  }
});

test("no /v1 body tells a REST caller to call an MCP tool", async () => {
  // A REST caller has no get_indicator. This reached a 200 response: every
  // /v1/search hit carried usage: get_indicator(...).
  const CALL_FORM = /\b(get_indicator|get_series|search_indicators|verify_stat|verify_claims|compare_sources|country_snapshot|list_sources|inflation_adjust|fx_convert)\s*\(/;
  const IMPERATIVE = /\b(use|call|see)\s+(the\s+)?(get_indicator|get_series|search_indicators|verify_stat|compare_sources)\b/i;
  const paths = [
    "/v1/search?q=government+debt",
    "/v1/search?q=anguilla",
    "/v1/series?id=inflation_cpi",
    "/v1/series?id=not-a-real-id",
  ];
  for (const p of paths) {
    const text = JSON.stringify((await get(p)).body);
    assert.doesNotMatch(text, CALL_FORM, p);
    assert.doesNotMatch(text, IMPERATIVE, p);
  }
});

const CARIBSTAT_DOC = JSON.stringify({
  source: "Eastern Caribbean Central Bank",
  source_id: "eccb",
  source_url: "https://www.eccb-centralbank.org/statistics",
  table_id: "total-public-sector-debt",
  table_title: "Total Public Sector Debt",
  country: { iso3: "AIA", name: "Anguilla" },
  frequency: "a",
  data_as_at: "2026-06-08",
  retrieved_at: "2026-08-13T16:28:44.604Z",
  periods: ["2024", "2025"],
  periods_raw: ["2024", "2025"],
  series: [
    { label: "Central Government Debt", unit: "EC$M", observations: [{ period: "2024", value: 210.4 }, { period: "2025", value: 219.9 }] },
    { label: "Public Sector Debt", unit: "EC$M", observations: [{ period: "2024", value: 222.9 }, { period: "2025", value: 232.9 }] },
  ],
});

test("a caribstat row can be asked for over HTTP without a fragment", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(CARIBSTAT_DOC, { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const base = "caribstat/ECCB/total-public-sector-debt/AIA.a";
    const label = "Public Sector Debt";
    const viaRow = await get(`/v1/series?id=${encodeURIComponent(base)}&row=${encodeURIComponent(label)}`);
    const viaHash = await get(`/v1/series?id=${encodeURIComponent(`${base}#${label}`)}`);
    assert.equal(viaRow.res.status, 200, JSON.stringify(viaRow.body));
    assert.equal(viaRow.body.series_id, viaHash.body.series_id);
    assert.deepEqual(viaRow.body.observations, viaHash.body.observations);
    assert.match(viaRow.body.series_id, /#Public Sector Debt$/);

    // Two spellings of one row, and a row on an id with no rows, are refused.
    const both = await get(`/v1/series?id=${encodeURIComponent(`${base}#${label}`)}&row=${encodeURIComponent(label)}`);
    assert.equal(both.res.status, 400);
    const wrongKind = await get("/v1/series?id=worldbank/NY.GDP.MKTP.KD.ZG&country=BRB&row=x");
    assert.equal(wrongKind.res.status, 400);
  } finally {
    globalThis.fetch = original;
  }
});

test("/v1/status probes every upstream a live request path uses, and its note names only those", async () => {
  // Five of the eleven ledger sources were probed. Neither fx_convert's upstream
  // nor the CaribStat origin was, so the badge could read "ok" while /v1/fx
  // returned 502 and every Anguilla and Montserrat series was dead.
  const seen: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const { body } = await get("/v1/status");
    for (const key of ["worldbank", "imf_datamapper", "dbnomics", "bis", "ecb_data", "ecb_fx", "caribstat"]) {
      assert.ok(body.upstreams[key], `${key} has no row: ${Object.keys(body.upstreams).join(", ")}`);
    }
    // Rows are not enough: the probe must have reached the host.
    assert.ok(seen.some((u) => u.includes("frankfurter")), seen.join(" "));
    assert.ok(seen.some((u) => u.includes("caribstat")), seen.join(" "));
    // The note must not claim more than the probe set measures.
    assert.doesNotMatch(body.note, /at least one primary source is unreachable/);
    assert.match(body.note, /seven probed upstreams/);
  } finally {
    globalThis.fetch = original;
  }
});
