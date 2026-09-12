// Every served source must be discoverable from the places an agent reads,
// and a near-miss id or key must point at what the caller meant.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCES } from "../src/core/sources.ts";
import { TOOLS } from "../src/tools.ts";
import { installFetchStub, call, mcpTool, mcpCall } from "./helpers.ts";

// How each served ledger entry is named in agent-facing prose. A new served
// source without an entry here fails the first test, so it cannot ship
// undiscoverable by accident.
const NAMED_AS: Record<string, RegExp> = {
  worldbank: /World Bank/,
  imf_weo: /IMF/,
  imf_sdmx_vintage: /IMF/,
  ecb_fx: /ECB/,
  ecb_data: /ECB/,
  bis: /BIS/,
  eccb: /Eastern Caribbean Central Bank/,
  cbb: /Central Bank of Barbados/,
};

test("every served source is named in list_sources, search_indicators and the server instructions", async () => {
  installFetchStub();
  const served = (SOURCES as any[]).filter((s) => s.license_verdict === "served").map((s) => s.id as string);
  assert.ok(served.length >= 6, "the ledger should list the served sources");
  const listSources = TOOLS.find((t) => t.name === "list_sources")!.description;
  const search = TOOLS.find((t) => t.name === "search_indicators")!.description;
  const init = await (await mcpCall({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json() as any;
  const instructions = init.result.instructions as string;
  for (const id of served) {
    const re = NAMED_AS[id];
    assert.ok(re, `served source '${id}' has no naming rule here. Add one and name it in the agent-facing descriptions.`);
    assert.match(listSources, re, `list_sources description must name ${id}`);
    assert.match(instructions, re, `instructions must name ${id}`);
    // Search covers indicators and tables, not FX rates.
    if (id !== "ecb_fx" && id !== "imf_sdmx_vintage") assert.match(search, re, `search_indicators description must name ${id}`);
  }
});

test("a bare World Bank code passed as a series id suggests the worldbank/ form", async () => {
  installFetchStub();
  const { isError, payload } = await mcpTool("get_series", { series_id: "NY.GDP.MKTP.CD", country: "USA" });
  assert.equal(isError, true);
  assert.match(payload.error, /Did you mean 'worldbank\/NY\.GDP\.MKTP\.CD'\?/);
});

test("an unrecognised id that reads like an indicator name suggests registry keys", async () => {
  installFetchStub();
  const { isError, payload } = await mcpTool("get_series", { series_id: "inflation rate", country: "USA" });
  assert.equal(isError, true);
  assert.ok(Array.isArray(payload.details?.suggestions) && payload.details.suggestions.length > 0, JSON.stringify(payload));
  assert.match(payload.error, /inflation/);
});

test("/v1/indicator accepts the key as people type it, not only the registry spelling", async () => {
  installFetchStub();
  const res = await call("/v1/indicator/Inflation-CPI?country=BRB&latest_only=true");
  const body = await res.json() as any;
  assert.equal(res.status, 200, JSON.stringify(body).slice(0, 300));
  assert.equal(body.observations.length, 1);
  // A key that does not exist is a 422 with suggestions, not a 404 "Unknown endpoint".
  const bad = await call("/v1/indicator/GDP-growthh?country=USA");
  assert.equal(bad.status, 422);
  assert.doesNotMatch(JSON.stringify(await bad.json()), /Unknown endpoint/);
});
