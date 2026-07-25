// Regression tests for D-001 (benchmark bench/DEVIATIONS.md): transient upstream
// failures were tripping series.ts's source fallback after only one retry, silently
// swapping in a different statistical source (e.g. IMF WEO instead of World Bank
// WDI) for the same nominal indicator. Covers: (1) fetchJson now survives a
// multi-attempt transient blip before giving up, (2) it still fails fast and
// permanently on a definitive non-retryable error, (3) getIndicator's fallback note
// correctly distinguishes "transient — retry me" from "this data plainly doesn't
// exist here" without ever conflating the two, and (4) a genuinely exhausted
// transient failure still falls back (resilience raises the bar, it doesn't
// remove the fallback safety net).
//
// Self-contained fetch stub, independent of test/helpers.ts's shared route table.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fetchJson, isTransientUpstreamError, UpstreamError, _clearMemCache } from "../src/core/upstream.ts";
import { ToolError } from "../src/core/types.ts";
import { getIndicator } from "../src/core/series.ts";
import type { Ctx } from "../src/core/types.ts";

const ctx: Ctx = { baseUrl: "https://statcite.test" };

let callLog: string[] = [];
let handlers: Array<(url: string) => Response | "network-error"> = [];

function installStub(...hs: Array<(url: string) => Response | "network-error">): void {
  _clearMemCache();
  callLog = [];
  handlers = hs;
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    callLog.push(url);
    const h = handlers[Math.min(i, handlers.length - 1)];
    i++;
    const r = h(url);
    if (r === "network-error") throw new TypeError("fetch failed: simulated network error");
    return r;
  }) as typeof fetch;
}

beforeEach(() => {
  callLog = [];
});

// ——— 1. fetchJson survives a multi-attempt transient blip ———

test("fetchJson: two transient 503s then a real success now succeeds (previously died after one retry)", async () => {
  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  const bad = () => new Response("service unavailable", { status: 503 });
  installStub(bad, bad, ok);
  const data = await fetchJson("https://example.test/flaky");
  assert.deepEqual(data, { ok: true });
  assert.equal(callLog.length, 3, "expected exactly 3 attempts (2 failures + the success)");
});

test("fetchJson: sustained transient failure still eventually throws (safety net intact)", async () => {
  const bad = () => new Response("still down", { status: 503 });
  installStub(bad, bad, bad, bad);
  await assert.rejects(() => fetchJson("https://example.test/always-down"), UpstreamError);
  assert.equal(callLog.length, 3, "3 attempts total (2 retries), then give up — not retried forever");
});

test("fetchJson: a network-level exception is retried the same as a 5xx", async () => {
  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  installStub("network-error", "network-error", ok);
  const data = await fetchJson("https://example.test/flaky-network");
  assert.deepEqual(data, { ok: true });
  assert.equal(callLog.length, 3);
});

test("fetchJson: a definitive 404 fails immediately, never retried", async () => {
  const notFound = () => new Response("nope", { status: 404 });
  installStub(notFound);
  await assert.rejects(() => fetchJson("https://example.test/missing"), UpstreamError);
  assert.equal(callLog.length, 1, "a hard 4xx must not be retried at all");
});

// ——— 2. isTransientUpstreamError classification ———

test("isTransientUpstreamError: classifies each error shape correctly", () => {
  assert.equal(isTransientUpstreamError(new UpstreamError("x", "https://u", 503)), true);
  assert.equal(isTransientUpstreamError(new UpstreamError("x", "https://u", 429)), true);
  assert.equal(isTransientUpstreamError(new UpstreamError("x", "https://u")), true, "no status at all (network/timeout) is transient");
  assert.equal(isTransientUpstreamError(new UpstreamError("x", "https://u", 404)), false, "a definitive 4xx is not transient");
  assert.equal(isTransientUpstreamError(new ToolError("no data for this query")), false, "adapter 'no data' is definitive, not a network blip");
  assert.equal(isTransientUpstreamError(new TypeError("boom")), true, "unexpected exception shapes default to transient");
});

// ——— 3. getIndicator's fallback note distinguishes transient vs definitive ———

const WB_URL = /api\.worldbank\.org/;
const DBN_URL = /api\.db\.nomics\.world/;

const dbnomicsCurrentAccountFixture = () =>
  new Response(
    JSON.stringify({
      series: {
        docs: [
          {
            provider_code: "IMF",
            dataset_code: "WEO:latest",
            dataset_name: "World Economic Outlook",
            series_code: "GEO.BCA_NGDPD.pcent_gdp",
            series_name: "Current account balance, % of GDP",
            period: ["2022"],
            value: [-4.421],
          },
        ],
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

test("getIndicator: transient WB failure falls back to WEO with a retry-aware note naming both sources", async () => {
  installStub((url: string) => {
    if (WB_URL.test(url)) return new Response("upstream wobble", { status: 503 });
    if (DBN_URL.test(url)) return dbnomicsCurrentAccountFixture();
    return new Response("{}", { status: 200 });
  });
  const result = await getIndicator(ctx, "current_account_gdp", "GEO", { start: "2022", end: "2022" });
  const note = result.notes.find((n) => /transiently unavailable/.test(n));
  assert.ok(note, `expected a transient-fallback note; got: ${JSON.stringify(result.notes)}`);
  assert.match(note!, /World Bank WDI/);
  assert.match(note!, /IMF WEO/);
  assert.match(note!, /different statistical definition/);
  assert.match(note!, /retry/i);
});

test("getIndicator: definitive WB 'no data' failure falls back with the plain note, no retry language", async () => {
  installStub((url: string) => {
    if (WB_URL.test(url)) {
      // World Bank's own "no rows" shape: a 200 with an empty data array.
      return new Response(JSON.stringify([{ page: 1, pages: 0, total: 0 }, []]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (DBN_URL.test(url)) return dbnomicsCurrentAccountFixture();
    return new Response("{}", { status: 200 });
  });
  const result = await getIndicator(ctx, "current_account_gdp", "GEO", { start: "2022", end: "2022" });
  const note = result.notes.find((n) => /does not have this indicator/.test(n));
  assert.ok(note, `expected a definitive-fallback note; got: ${JSON.stringify(result.notes)}`);
  assert.ok(!/transiently unavailable/.test(note!));
  assert.ok(!/retry/i.test(note!));
});

test("getIndicator: WB exhausted after 3 attempts still falls back to WEO (resilience raises the bar, doesn't remove the net)", async () => {
  const bad = () => new Response("down", { status: 503 });
  installStub(
    (url: string) => (WB_URL.test(url) ? bad() : dbnomicsCurrentAccountFixture()),
  );
  const result = await getIndicator(ctx, "current_account_gdp", "GEO", { start: "2022", end: "2022" });
  assert.equal(result.series_id.startsWith("dbnomics/"), true);
  assert.ok(result.notes.some((n) => /transiently unavailable/.test(n)));
});
