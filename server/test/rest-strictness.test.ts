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
