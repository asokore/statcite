// Regression tests for issues found in the pre-deploy review.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, call, mcpCall, mcpTool } from "./helpers.ts";
import { UpstreamError } from "../src/core/upstream.ts";
import { resolveCountry } from "../src/core/countries.ts";

beforeEach(() => installFetchStub());

test("FRED api_key is redacted from UpstreamError messages and urls", () => {
  const e = new UpstreamError(
    "Upstream returned HTTP 429: slow down https://api.stlouisfed.org/fred/series?series_id=UNRATE&api_key=SECRET123&file_type=json",
    "https://api.stlouisfed.org/fred/series/observations?series_id=UNRATE&api_key=SECRET123&file_type=json",
    429,
  );
  assert.ok(!e.message.includes("SECRET123"));
  assert.ok(!e.url.includes("SECRET123"));
  assert.match(e.url, /api_key=REDACTED/);
});

test("strict country resolution: English words never become countries", () => {
  assert.equal(resolveCountry("was", { strict: true }), null);
  assert.equal(resolveCountry("gdp", { strict: true }), null);
  assert.equal(resolveCountry("in", { strict: true }), null);
  assert.equal(resolveCountry("tax", { strict: true }), null);
  assert.equal(resolveCountry("IN", { strict: true })?.iso3, "IND"); // explicit uppercase code still works
  assert.equal(resolveCountry("jamaica", { strict: true })?.iso3, "JAM");
  assert.equal(resolveCountry("usa", { strict: true })?.iso3, "USA"); // alias, not code pass-through
});

test("search without a country defaults to WLD instead of fabricating one", async () => {
  const { rpc } = await mcpTool("search", { query: "gdp growth" });
  const first = rpc.result.structuredContent.results[0];
  assert.equal(first.id, "indicator/gdp_growth/WLD");
});

test("search: 'in' does not resolve to India when a real country is present", async () => {
  const { rpc } = await mcpTool("search", { query: "inflation in barbados" });
  const first = rpc.result.structuredContent.results[0];
  assert.equal(first.id, "indicator/inflation_cpi/BRB");
});

test("invalid transform is an error, not a silent index rebase", async () => {
  const { payload, isError } = await mcpTool("get_indicator", {
    indicator: "inflation_cpi", country: "BRB", transform: "banana",
  });
  assert.equal(isError, true);
  assert.match(payload.error, /Unknown transform/);
  // Case-insensitive acceptance still works:
  const ok = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB", transform: "YoY", latest_only: true });
  assert.equal(ok.isError, false);
});

test("REST: empty transform param means none (values not rebased)", async () => {
  const res = await call("/v1/indicator/inflation_cpi?country=BRB&transform=");
  const body = await res.json() as any;
  const y2024 = body.observations.find((o: any) => o.period === "2024");
  assert.ok(Math.abs(y2024.value - 1.4464366430616) < 1e-9);
});

test("REST: non-numeric params are 400 with the parameter named", async () => {
  const r1 = await call("/v1/verify?indicator=inflation_cpi&country=BRB&period=2024&value=abc");
  assert.equal(r1.status, 400);
  assert.match((await r1.json() as any).error.message, /'value'/);
  const r2 = await call("/v1/inflation?amount=&from_year=2000&to_year=2020");
  assert.equal(r2.status, 400);
  const r3 = await call("/v1/indicator/inflation_cpi?country=BRB&start_year=abc");
  assert.equal(r3.status, 400);
});

test("fx annual-average for an ECB pair uses the year's daily rates", async () => {
  const { payload, isError } = await mcpTool("fx_convert", { amount: 100, from: "EUR", to: "USD", date: "2020" });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.ok(Math.abs(payload.rate - 1.142123) < 1e-4, `rate was ${payload.rate}`);
  assert.equal(payload.precision, "annual_average");
  assert.match(payload.method, /Annual average of ECB daily reference rates/);
});

test("JSON-RPC batch is processed (2025-03-26 compatibility)", async () => {
  const res = await mcpCall([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "ping" },
  ]);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 2); // notification produces no response
  assert.equal(body[0].result.protocolVersion, "2025-03-26");
  assert.deepEqual(body[1].result, {});
});

test("batch of only notifications -> 202", async () => {
  const res = await mcpCall([{ jsonrpc: "2.0", method: "notifications/initialized" }]);
  assert.equal(res.status, 202);
});

test("request with id: 0 is a request, not a notification", async () => {
  const res = await mcpCall({ jsonrpc: "2.0", id: 0, method: "ping" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.id, 0);
  assert.deepEqual(body.result, {});
});

test("non-string/number id is rejected", async () => {
  const res = await mcpCall({ jsonrpc: "2.0", id: { weird: true }, method: "ping" });
  assert.equal(res.status, 400);
  const body = await res.json() as any;
  assert.equal(body.error.code, -32600);
});

test("/mcp/ with trailing slash reaches the MCP handler", async () => {
  const res = await call("/mcp/", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" }),
  });
  assert.equal(res.status, 200);
});
