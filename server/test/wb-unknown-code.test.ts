// The World Bank answers an unknown indicator code and an unreported economy
// with the same "Invalid value" envelope. Only the first is the caller's typo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

const env = { ASSETS: { fetch: async () => new Response("site") }, BASE_URL: "https://statcite.com" } as unknown as Env;
const REFUSAL = JSON.stringify([{ message: [{ id: "120", key: "Invalid value", value: "The provided parameter value is not valid" }] }]);
const KNOWN = JSON.stringify([{ page: 1, pages: 1, per_page: "50", total: 1 }, [{ id: "NY.GDP.MKTP.CD", name: "GDP (current US$)" }]]);

function stub(indicatorEndpoint: "refuse" | "known" | "down") {
  _clearMemCache();
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (/api\.worldbank\.org\/v2\/indicator\//.test(url)) {
      if (indicatorEndpoint === "down") return new Response("oops", { status: 404 });
      return new Response(indicatorEndpoint === "refuse" ? REFUSAL : KNOWN, { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("api.worldbank.org/v2/country/")) return new Response(REFUSAL, { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return calls;
}

async function series(qs: string) {
  const res = await handleRequest(new Request("https://statcite.com/v1/series?" + qs), env);
  return { status: res.status, body: (await res.json()) as any };
}

test("a mistyped worldbank/ code is reported as an unknown code, not a coverage fact", async () => {
  stub("refuse");
  const { status, body } = await series("id=worldbank/NY.GDP.MKTP.CDX&country=USA");
  assert.equal(status, 422);
  assert.match(body.error.message, /Unknown World Bank indicator code 'NY\.GDP\.MKTP\.CDX'/);
  assert.doesNotMatch(body.error.message, /coverage fact/);
  assert.equal(body.error.details.unknown_indicator, true);
  assert.equal(body.error.details.no_published_data, undefined, "an unknown code is not an absence");
});

test("a real code the World Bank does not report for this economy stays a coverage fact", async () => {
  stub("known");
  const { status, body } = await series("id=worldbank/NY.GDP.MKTP.CD&country=MSR");
  assert.equal(status, 422);
  assert.match(body.error.message, /coverage fact/);
  assert.equal(body.error.details.no_published_data, true);
});

test("when the code check itself fails, the coverage answer stands rather than a guessed typo", async () => {
  stub("down");
  const { body } = await series("id=worldbank/NY.GDP.MKTP.CD&country=MSR");
  assert.match(body.error.message, /coverage fact/);
  assert.doesNotMatch(body.error.message, /Unknown World Bank indicator/);
});
