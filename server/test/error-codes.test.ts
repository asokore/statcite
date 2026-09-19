// Errors carry a stable code from one closed list, on REST and on MCP, and the
// OpenAPI Error schema lists exactly that list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ERROR_CODES } from "../src/core/types.ts";
import { installFetchStub, call, mcpTool } from "./helpers.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

test("REST errors carry the code a client should branch on", async () => {
  installFetchStub();
  const cases: Array<[string, RequestInit | undefined, number, string]> = [
    ["/v1/indicator/not_a_real_key?country=BRB", undefined, 422, "unknown_indicator"],
    ["/v1/indicator/inflation_cpi?country=Freedonia", undefined, 422, "unknown_country"],
    ["/v1/indicator/inflation_cpi?country=BRB&bogus=1", undefined, 400, "invalid_parameter"],
    ["/v1/nope", undefined, 404, "unknown_endpoint"],
    ["/v1/indicator/inflation_cpi?country=BRB&start_year=1800&end_year=1801", undefined, 422, "out_of_range"],
    ["/v1/verify_claims", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }, 422, "invalid_body"],
    ["/v1/verify_claims", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }, 415, "unsupported_media_type"],
  ];
  for (const [path, init, status, code] of cases) {
    const res = await call(path, init);
    const body = await res.json() as any;
    assert.equal(res.status, status, `${path}: ${JSON.stringify(body).slice(0, 200)}`);
    assert.equal(body.error.code, code, `${path}`);
    assert.ok(ERROR_CODES.includes(body.error.code), `${path}: code must be from the closed list`);
  }
});

test("MCP tool errors carry the same codes", async () => {
  installFetchStub();
  const bad = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "Freedonia" });
  assert.equal(bad.isError, true);
  assert.equal(bad.payload.code, "unknown_country");
  const args = await mcpTool("verify_stat", { indicator: "inflation_cpi", period: "2023", claimed_value: 1, tolerence_abs: 0.1 });
  assert.equal(args.payload.code, "invalid_parameter");
});

test("the OpenAPI Error schema lists exactly the codes the server can return", () => {
  const spec = JSON.parse(readFileSync(new URL("../../site/openapi.json", import.meta.url), "utf8"));
  const schema = spec.components.schemas.Error;
  assert.deepEqual([...schema.properties.error.properties.code.enum].sort(), [...ERROR_CODES].sort());
  for (const name of ["BadRequest", "Unprocessable", "MethodNotAllowed", "NotFound"]) {
    assert.equal(spec.components.responses[name].content["application/json"].schema.$ref, "#/components/schemas/Error", name);
  }
});

// One outage, one status. site/docs.html and site/llms-full.txt both publish
// "502 upstream source trouble". The registry routes answered 422 for the
// identical failure the adapter routes answered 502 for, because rest.ts
// hardcoded 422 for every ToolError whatever its code. A client branching on
// status retried the 502 and gave up permanently on the 422.
test("a total upstream outage is 502 on every route that reaches an upstream", async () => {
  const routes = [
    "/v1/indicator/gdp_growth?country=FRA",
    "/v1/verify?indicator=gdp_growth&country=FRA&period=2023&value=1",
    "/v1/snapshot/FRA",
    "/v1/series?id=worldbank/NY.GDP.MKTP.KD.ZG&country=FRA",
    "/v1/inflation?amount=100&from_year=1995&to_year=2020&country=FRA",
    "/v1/fx?amount=100&from=USD&to=JPY",
  ];
  for (const r of routes) {
    _clearMemCache();
    globalThis.fetch = (async () => new Response("upstream down", { status: 500 })) as typeof fetch;
    const res = await call(r);
    const body = (await res.json()) as any;
    // The code first, so a future regression reports the useful half.
    assert.equal(body.error?.code, "upstream_unavailable", `${r}: ${JSON.stringify(body).slice(0, 220)}`);
    assert.equal(res.status, 502, `${r} must answer the status docs.html publishes for an outage`);
  }
});

test("a coverage absence keeps its 422 - an outage status must not leak onto it", async () => {
  // The World Bank answers 200 and simply does not publish this economy, and
  // strict_source=true forbids the fallback. primary_source_unavailable is
  // therefore NOT an outage, and 502 would blame a source that is up.
  const WB_EMPTY = JSON.stringify([{ page: 0, pages: 0, per_page: 0, total: 0 }, null]);
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.includes("api.worldbank.org")) return new Response(WB_EMPTY, { status: 200, headers: { "content-type": "application/json" } });
    return new Response("unreachable", { status: 500 });
  }) as typeof fetch;
  const res = await call("/v1/indicator/gdp_growth?country=TWN&strict_source=true");
  const body = (await res.json()) as any;
  assert.equal(body.error?.code, "primary_source_unavailable", JSON.stringify(body).slice(0, 220));
  assert.equal(res.status, 422, "a healthy source that does not cover an economy is not a bad gateway");
});

test("openapi.json declares the 502 on every operation that can return it", () => {
  const spec = JSON.parse(readFileSync(new URL("../../site/openapi.json", import.meta.url), "utf8"));
  assert.ok(spec.components.responses.BadGateway, "components.responses.BadGateway is missing");
  for (const [p, m] of [
    ["/v1/indicator/{key}", "get"],
    ["/v1/series", "get"],
    ["/v1/snapshot/{country}", "get"],
    ["/v1/verify", "get"],
    ["/v1/inflation", "get"],
    ["/v1/fx", "get"],
  ] as const) {
    assert.equal(
      spec.paths[p]?.[m]?.responses?.["502"]?.$ref,
      "#/components/responses/BadGateway",
      `${m.toUpperCase()} ${p} can answer 502 and must document it`,
    );
  }
});

// A ShapeError is thrown when an origin answers 200 with a body that fails
// validation. It matched no branch in rest.ts, mcp.ts or claimFailure, so it
// fell through to "Internal error ... report an issue" coded internal_error:
// an agent told StatCite had crashed, sent to the wrong place, and given no
// reason to retry.
test("a malformed upstream document is an upstream problem, not a StatCite crash", async () => {
  const ID = "caribstat/eccb/total-public-sector-debt/AIA.a";
  const errors: unknown[][] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => void errors.push(a);
  try {
    installFetchStub();
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes("asokore.github.io/caribstat")) {
        return new Response('{"hello":1}', { status: 200, headers: { "content-type": "application/json" } });
      }
      return inner(input as RequestInfo, init);
    }) as typeof fetch;

    const res = await call("/v1/series?id=" + encodeURIComponent(ID));
    const body = (await res.json()) as any;
    assert.equal(res.status, 502, JSON.stringify(body).slice(0, 220));
    assert.equal(body.error.code, "upstream_unavailable");
    assert.ok(ERROR_CODES.includes(body.error.code));
    assert.equal(typeof body.error.details.upstream_url, "string");
    assert.doesNotMatch(body.error.message, /report an issue/);

    _clearMemCache();
    const mcp = await mcpTool("get_series", { series_id: ID });
    assert.equal(mcp.isError, true);
    assert.equal(mcp.payload.code, "upstream_unavailable", JSON.stringify(mcp.payload).slice(0, 220));
    assert.doesNotMatch(String(mcp.payload.error), /Internal error/);

    // Nothing was logged as a crash, because nothing crashed.
    assert.equal(
      errors.filter((a) => String(a[0]).includes("crash")).length,
      0,
      "a bad upstream document must not be logged as a StatCite crash",
    );
  } finally {
    console.error = realError;
  }
});
