// The live smoke either reaches statcite.com or it does not, and for the whole
// life of the workflow it did not. ci.yml has run
// `BASE=https://statcite.com npm run smoke` twice a day, the README badge
// reports that run as proof the service is alive, and nothing read BASE: every
// assertion ran in process against the working tree with a stub ASSETS binding.
// An expired domain, an unrouted Worker, a rolled-back deploy or a release
// nobody deployed would all have left the badge green.
//
// smoke-live.mjs runs its whole suite at import time, so the mode switch lives
// in smoke-call.mjs where a test can reach it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeCall } from "../scripts/smoke-call.mjs";

const env = { BASE_URL: "https://statcite.com" };

test("smoke-live sends real HTTP when BASE is set and stays in-process when it is not", async () => {
  const seen: string[] = [];
  const overWire = makeCall(env, "https://example.test", {
    fetch: (async (u: URL) => {
      seen.push(String(u));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch,
    handleRequest: () => {
      throw new Error("BASE was set: this must not run in process");
    },
  });
  const res = await overWire("/v1/snapshot/Trinidad%20and%20Tobago");
  assert.equal(res.status, 200);
  // The encoding has to survive: a request re-encoded to %2520, or decoded to a
  // literal space, is not the request the in-process mode makes.
  assert.deepEqual(seen, ["https://example.test/v1/snapshot/Trinidad%20and%20Tobago"]);

  const inProcess: string[] = [];
  const local = makeCall(env, undefined, {
    fetch: (() => {
      throw new Error("BASE was unset: this must not hit the network");
    }) as unknown as typeof fetch,
    handleRequest: ((req: Request) => {
      inProcess.push(req.url);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
  });
  assert.equal((await local("/v1/status")).status, 200);
  assert.deepEqual(inProcess, ["https://statcite.com/v1/status"]);
});

test("an origin that cannot be reached at all is reported, not thrown", async () => {
  // A DNS or TLS failure has no Response. Thrown, it escapes the retry wrapper
  // and ends the run in an unhandled rejection: a crash, not a FAILURES line,
  // and precisely the case the badge exists to show.
  const call = makeCall(env, "https://example.test", {
    fetch: (async () => {
      throw new Error("getaddrinfo ENOTFOUND example.test");
    }) as unknown as typeof fetch,
    handleRequest: () => {
      throw new Error("must not fall back to in-process");
    },
  });
  const res = await call("/v1/status");
  assert.equal(res.status, 599);
  const body = (await res.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, "unreachable");
  // looksTransient in smoke-live.mjs matches this wording, so a blip retries
  // three times before it is called a failure.
  assert.match(body.error.message, /fetch failed/);
});

test("the smoke asserts the deployed version and fetches the static site", () => {
  // Two assertions that are trivially true in process and load-bearing over the
  // wire. Without the first, a release where `npm run deploy` was never run is
  // invisible (REVIEW-2026-09-12 row 14: production served untagged code as
  // 1.12.0). Without "/", a broken static-asset upload is.
  // Normalised: CRLF in this worktree, LF on the runner.
  const src = readFileSync(new URL("../scripts/smoke-live.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /deployed version \$\{body\?\.version\} === source \$\{SERVER_VERSION\}/);
  assert.match(src, /const call = makeCall\(env, BASE, \{ fetch, handleRequest \}\);/);
  const restList = src.slice(src.indexOf("// REST\nfor (const path of ["), src.indexOf('"/health",'));
  assert.match(restList, /^\s*"\/",$/m, "the smoke must fetch the site root");
  assert.match(restList, /"\/v1\/status"/, "and the status surface the badge implies it checks");
});

test("ci.yml still passes BASE, which is the point of all of the above", () => {
  const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(ci, /BASE=https:\/\/statcite\.com npm run smoke/);
});
