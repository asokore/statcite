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
import { fetchJson, isTransientUpstreamError, UpstreamError, _clearMemCache, _setRetryDelayScale } from "../src/core/upstream.ts";
import { ToolError } from "../src/core/types.ts";
import { getIndicator, listRegistry, expectedWeoEdition, weoVintageStaleNote } from "../src/core/series.ts";
import type { Ctx } from "../src/core/types.ts";
import { dmValuesBody, isDataMapperValuesUrl, isDataMapperMetadataUrl, STANDARD_DM_METADATA, DM_CODES } from "./dm-fixtures.ts";

const ctx: Ctx = { baseUrl: "https://statcite.test" };

let callLog: string[] = [];
let handlers: Array<(url: string) => Response | "network-error"> = [];

const jsonRes = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/json" } });

// current_account_gdp is now DataMapper-primary (design D1) — every getIndicator
// test below that exercises its WB-fails/DBnomics-serves fallback path would
// otherwise also hit DataMapper first. Rather than let that hit an unmatched-shape
// decoy (3 retries + real backoff sleeps per attempt, per test), GEO is simply
// absent from this fixture — a realistic "DataMapper is healthy but doesn't cover
// this economy for this series" case, which fails fast (a single request, no
// retries) and falls through exactly as the tests below expect.
const DM_CURRENT_ACCOUNT_NO_GEO = dmValuesBody(DM_CODES.current_account_gdp, {});

function installStub(...hs: Array<(url: string) => Response | "network-error">): void {
  _clearMemCache();
  callLog = [];
  handlers = hs;
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    callLog.push(url);
    if (isDataMapperMetadataUrl(url)) return jsonRes(STANDARD_DM_METADATA);
    if (isDataMapperValuesUrl(url, DM_CODES.current_account_gdp)) return jsonRes(DM_CURRENT_ACCOUNT_NO_GEO);
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
  assert.equal(result.fallback_used, true, "fallback responses must carry the machine-readable fallback_used flag");
});

// ——— 4. strict_source: reproducibility mode ———

test("strict_source: primary failure errors instead of falling back, with actionable advice", async () => {
  const bad = () => new Response("down", { status: 503 });
  let dbnomicsCalled = false;
  installStub((url: string) => {
    if (WB_URL.test(url)) return bad();
    if (DBN_URL.test(url)) {
      dbnomicsCalled = true;
      return dbnomicsCurrentAccountFixture();
    }
    return new Response("{}", { status: 200 });
  });
  await assert.rejects(
    () => getIndicator(ctx, "current_account_gdp", "GEO", { start: "2022", end: "2022", strictSource: true }),
    (e: unknown) => {
      assert.ok(e instanceof ToolError);
      assert.match((e as Error).message, /strict_source=true prevented fallback/);
      assert.match((e as Error).message, /transient/i);
      return true;
    },
  );
  assert.equal(dbnomicsCalled, false, "strict mode must never even consult the fallback source");
});

test("strict_source: healthy primary serves normally, no fallback_used flag", async () => {
  installStub((url: string) => {
    if (WB_URL.test(url)) {
      return new Response(
        JSON.stringify([
          { page: 1, pages: 1, total: 1, lastupdated: "2026-07-13" },
          [
            {
              indicator: { id: "BN.CAB.XOKA.GD.ZS", value: "Current account balance (% of GDP)" },
              country: { id: "GE", value: "Georgia" },
              countryiso3code: "GEO",
              date: "2022",
              value: -2.58183727549166,
            },
          ],
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  });
  const result = await getIndicator(ctx, "current_account_gdp", "GEO", { start: "2022", end: "2022", strictSource: true });
  assert.equal(result.series_id, "worldbank/BN.CAB.XOKA.GD.ZS");
  assert.equal(result.fallback_used, undefined);
});

// ——— 5. WEO vintage staleness disclosure ———

test("expectedWeoEdition follows the IMF April/October release calendar", () => {
  assert.equal(expectedWeoEdition(new Date("2026-07-25T12:00:00Z")), "2026-04");
  assert.equal(expectedWeoEdition(new Date("2026-11-15T12:00:00Z")), "2026-10");
  assert.equal(expectedWeoEdition(new Date("2026-02-01T12:00:00Z")), "2025-10");
  assert.equal(expectedWeoEdition(new Date("2026-05-01T12:00:00Z")), "2026-04");
});

test("weoVintageStaleNote fires only when the resolved vintage trails the release calendar", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  assert.match(weoVintageStaleNote("WEO:2025-04", now)!, /newest edition available via DBnomics/);
  assert.match(weoVintageStaleNote("WEO:2025-04", now)!, /expected 2026-04/);
  assert.equal(weoVintageStaleNote("WEO:2026-04", now), undefined);
  assert.equal(weoVintageStaleNote("NOT_WEO_DATASET", now), undefined);
});

// ——— 6. listRegistry source order mirrors actual resolution order ———

test("listRegistry: IMF-primary fiscal indicators list IMF DataMapper first then DBnomics, WDI-primary list World Bank first", () => {
  const reg = new Map(listRegistry().map((r) => [r.key, r.sources]));
  for (const key of ["govt_debt_gdp", "fiscal_balance_gdp", "govt_revenue_gdp", "govt_expenditure_gdp"]) {
    assert.match(reg.get(key)![0], /^IMF DataMapper/, `${key} is DB_PRIMARY — IMF DataMapper must be listed first`);
    assert.match(reg.get(key)![1], /^IMF WEO/, `${key} lists DBnomics as the second (fallback) IMF path`);
  }
  assert.equal(reg.get("gdp_growth")![0], "World Bank WDI");
  assert.equal(reg.get("gdp_growth")![1], "IMF DataMapper API (current WEO/Fiscal Monitor)");
  assert.equal(reg.get("inflation_cpi")![0], "World Bank WDI");
});

// --- identical concurrent fetches share one flight ---------------------------

test("five concurrent identical fetches cost one subrequest and all get the same body", async () => {
  _clearMemCache();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    // The delay matters: a synchronous stub settles each call before the next
    // starts, and the test would then pass without any sharing.
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify({ value: 42 }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const results = await Promise.all(Array.from({ length: 5 }, () => fetchJson("https://up.test/shared")));
  assert.equal(calls, 1, `expected 1 subrequest, got ${calls}`);
  for (const r of results) assert.deepEqual(r, { value: 42 });
});

test("five concurrent fetches of a failing URL share one attempt series, not five", async () => {
  _clearMemCache();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 5));
    return new Response("down", { status: 503 });
  }) as typeof fetch;

  const settled = await Promise.allSettled(Array.from({ length: 5 }, () => fetchJson("https://up.test/down", { timeoutMs: 200 })));
  // Three attempts is the retry schedule for ONE caller. Before sharing, five
  // callers cost fifteen subrequests against a 50-subrequest ceiling.
  assert.equal(calls, 3, `expected 3 attempts in total, got ${calls}`);
  assert.equal(settled.filter((s) => s.status === "rejected").length, 5);
  for (const s of settled) {
    assert.ok(s.status === "rejected" && s.reason instanceof UpstreamError, "sharing a failure must not look like success");
  }
});

test("a different Accept header is never served from another flight's body", async () => {
  _clearMemCache();
  const seen: Array<string | undefined> = [];
  globalThis.fetch = (async (_i: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get("accept") ?? undefined);
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  await Promise.all([
    fetchJson("https://up.test/negotiated"),
    fetchJson("https://up.test/negotiated", { accept: "application/vnd.sdmx.data+json" }),
  ]);
  // BIS answers a plain application/json Accept with XML, so these must not share.
  assert.equal(seen.length, 2, seen.join(", "));
  assert.ok(seen.includes("application/vnd.sdmx.data+json"), seen.join(", "));
});

test("a host that has failed a whole retry series is not retried again in the same request", async () => {
  _clearMemCache();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("down", { status: 503 });
  }) as typeof fetch;

  // One request's worth of state, exactly as a Ctx carries it.
  const hostState = new Map<string, number>();
  await assert.rejects(fetchJson("https://dead.test/a", { timeoutMs: 200, hostState }));
  assert.equal(calls, 3, "the first call still gets its full three-attempt schedule");

  // A later call in the SAME request to the same host: one attempt, not three.
  await assert.rejects(fetchJson("https://dead.test/b", { timeoutMs: 200, hostState }));
  assert.equal(calls, 4, `expected one further attempt, total 4, got ${calls}`);

  // A different host is unaffected, and a request with its own state is too.
  await assert.rejects(fetchJson("https://other.test/a", { timeoutMs: 200, hostState }));
  assert.equal(calls, 7);
  const freshRequest = new Map<string, number>();
  await assert.rejects(fetchJson("https://dead.test/c", { timeoutMs: 200, hostState: freshRequest }));
  assert.equal(calls, 10, "a new request gets the full schedule again");
});

test("a 404 never arms the breaker: it is an answer about the series, not the host", async () => {
  _clearMemCache();
  let calls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.includes("/missing")
      ? new Response("not found", { status: 404 })
      : new Response("down", { status: 503 });
  }) as typeof fetch;

  const hostState = new Map<string, number>();
  for (const n of [1, 2, 3, 4]) {
    await assert.rejects(fetchJson(`https://mixed.test/missing/${n}`, { timeoutMs: 200, hostState }));
  }
  assert.equal(calls, 4, "four definitive 404s, one attempt each");
  await assert.rejects(fetchJson("https://mixed.test/outage", { timeoutMs: 200, hostState }));
  assert.equal(calls, 7, "the outage still gets its full three attempts");
});

test("a host that recovers inside the request gets its retry schedule back", async () => {
  _clearMemCache();
  let calls = 0;
  let healthy = false;
  globalThis.fetch = (async () => {
    calls += 1;
    return healthy
      ? new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response("down", { status: 503 });
  }) as typeof fetch;

  const hostState = new Map<string, number>();
  await assert.rejects(fetchJson("https://flappy.test/a", { timeoutMs: 200, hostState }));
  assert.equal(calls, 3);

  // One success clears the count, so a later blip is not treated as a
  // continuing outage and still gets its three attempts.
  healthy = true;
  await fetchJson("https://flappy.test/b", { timeoutMs: 200, hostState });
  assert.equal(calls, 4);
  healthy = false;
  await assert.rejects(fetchJson("https://flappy.test/c", { timeoutMs: 200, hostState }));
  assert.equal(calls, 7, `expected a full schedule after recovery, got ${calls - 4} attempts`);
});

test("a failing host is retried after a real pause", async () => {
  // test/setup.ts zeroes the retry waits for the whole suite, because outage
  // tests walk the full ladder and the sleeps were most of its run time. That
  // leaves nothing proving production actually backs off between attempts, so
  // this one test restores the real schedule: 300ms then 900ms, 1.2s in all.
  _setRetryDelayScale(1);
  try {
    _clearMemCache();
    const stamps: number[] = [];
    globalThis.fetch = (async () => {
      stamps.push(performance.now());
      return new Response("down", { status: 503 });
    }) as typeof fetch;
    await assert.rejects(fetchJson("https://pause.test/series", { ttlSeconds: 60 }));
    assert.equal(stamps.length, 3, "three attempts, same as production");
    const first = stamps[1] - stamps[0];
    const second = stamps[2] - stamps[1];
    // Lower bounds only, with a margin for timer granularity. An upper bound
    // would make the test flaky on a loaded runner without proving anything.
    assert.ok(first >= 250, `first retry came ${first.toFixed(0)}ms after the attempt, expected about 300ms`);
    assert.ok(second >= 800, `second retry came ${second.toFixed(0)}ms after, expected about 900ms`);
  } finally {
    _setRetryDelayScale(0);
  }
});

// A Worker can drop a request's pending work without settling it, so a joiner
// must not wait on the flight for ever. Node cannot tear a request down, so a
// fetch that never settles and ignores its abort stands in for that here. The
// real teardown was run under workerd for A-065.
test("a joiner gives up on a flight that never settles, and fetches for itself", async () => {
  _clearMemCache();
  const url = "https://hang.example/a";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Promise<Response>(() => {});
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  void fetchJson(url, { timeoutMs: 20 }).catch(() => {});
  const t0 = Date.now();
  assert.deepEqual(await fetchJson(url, { timeoutMs: 20 }), { ok: true });
  assert.equal(calls, 2);
  assert.ok(Date.now() - t0 < 5000, "the wait is bounded by the flight's own limit");
});

test("a caller arriving after the limit has passed does not wait at all", async (t) => {
  _clearMemCache();
  const url = "https://hang.example/b";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Promise<Response>(() => {});
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  void fetchJson(url, { timeoutMs: 20 }).catch(() => {});
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });
  Date.now = () => realNow() + 60_000;
  const timers: number[] = [];
  const realTimeout = globalThis.setTimeout;
  t.after(() => { globalThis.setTimeout = realTimeout; });
  globalThis.setTimeout = ((fn: () => void, ms?: number) => { timers.push(ms ?? 0); return realTimeout(fn, ms); }) as typeof setTimeout;
  assert.deepEqual(await fetchJson(url, { timeoutMs: 20 }), { ok: true });
  assert.ok(timers.length > 0 && timers.every((ms) => ms === 20), `only the caller's own attempt timer, saw ${timers.join()}`);
});

test("callers stuck on a dead flight share one replacement", async () => {
  _clearMemCache();
  const url = "https://hang.example/e";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Promise<Response>(() => {});
    await new Promise((r) => setTimeout(r, 20));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  void fetchJson(url, { timeoutMs: 20 }).catch(() => {});
  const answers = await Promise.all([1, 2, 3].map(() => fetchJson(url, { timeoutMs: 20 })));
  assert.deepEqual(answers, [{ ok: true }, { ok: true }, { ok: true }]);
  assert.equal(calls, 2, "one dead flight and one replacement");
});

test("a joiner waits out every attempt and pause of a live flight", async () => {
  _clearMemCache();
  _setRetryDelayScale(1);
  try {
    const url = "https://hang.example/f";
    let calls = 0;
    globalThis.fetch = (async (_: unknown, init?: RequestInit) => {
      const n = ++calls;
      if (n < 3) {
        return new Promise<Response>((_ok, fail) => {
          init?.signal?.addEventListener("abort", () => fail(new DOMException("aborted", "AbortError")));
        });
      }
      await new Promise((r) => setTimeout(r, 250));
      return new Response(JSON.stringify({ n }), { status: 200 });
    }) as typeof fetch;
    // Two attempts of 600 and pauses of 300 and 900 put the third answer near
    // 2650 ms. The limit is 3500. Without the attempts or the pauses it is 2300.
    const [a, b] = await Promise.all([fetchJson(url, { timeoutMs: 600 }), fetchJson(url, { timeoutMs: 600 })]);
    assert.deepEqual(a, { n: 3 });
    assert.deepEqual(b, { n: 3 });
    assert.equal(calls, 3, "the joiner never gave up on the live flight");
  } finally {
    _setRetryDelayScale(0);
  }
});

test("a flight that will not retry is only waited on for one attempt", async (t) => {
  _clearMemCache();
  const url = "https://hang.example/g";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Promise<Response>(() => {});
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  void fetchJson(url, { timeoutMs: 50, retry: false }).catch(() => {});
  const timers: number[] = [];
  const realTimeout = globalThis.setTimeout;
  t.after(() => { globalThis.setTimeout = realTimeout; });
  globalThis.setTimeout = ((fn: () => void, ms?: number) => { timers.push(ms ?? 0); return realTimeout(fn, ms); }) as typeof setTimeout;
  assert.deepEqual(await fetchJson(url, { timeoutMs: 50 }), { ok: true });
  assert.ok(Math.max(...timers) > 50, `the caller joined the flight, saw ${timers.join()}`);
  assert.ok(Math.max(...timers) <= 550, `the wait stops at one attempt plus the slack, saw ${timers.join()}`);
});

test("a chain of dead flights holds a caller for two joins at most", async (t) => {
  _clearMemCache();
  const url = "https://hang.example/h";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls <= 3) return new Promise<Response>(() => {});
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  void fetchJson(url, { timeoutMs: 200 }).catch(() => {});
  const joins: number[] = [];
  const realTimeout = globalThis.setTimeout;
  t.after(() => { globalThis.setTimeout = realTimeout; });
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    if ((ms ?? 0) > 200) joins.push(ms ?? 0);
    return realTimeout(fn, ms);
  }) as typeof setTimeout;
  const first = await Promise.race([1, 2, 3].map(() => fetchJson(url, { timeoutMs: 200 })));
  assert.deepEqual(first, { ok: true });
  // Three callers join the dead flight. One replaces it, and the other two join
  // that. A third join would make six.
  assert.equal(joins.length, 5, `join timers: ${joins.join()}`);
});

test("a flight that answers is shared, not repeated", async () => {
  _clearMemCache();
  const url = "https://hang.example/c";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 30));
    return new Response(JSON.stringify({ n: calls }), { status: 200 });
  }) as typeof fetch;
  const [a, b] = await Promise.all([fetchJson(url, { timeoutMs: 1000 }), fetchJson(url, { timeoutMs: 1000 })]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
});

test("an abandoned flight that settles late leaves its successor's entry alone", async () => {
  _clearMemCache();
  const url = "https://hang.example/d";
  let release: ((r: Response) => void) | undefined;
  let finishSecond: ((r: Response) => void) | undefined;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Promise<Response>((r) => { release = r; });
    if (calls === 2) return new Promise<Response>((r) => { finishSecond = r; });
    return new Response(JSON.stringify({ third: true }), { status: 200 });
  }) as typeof fetch;
  const body = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
  const first = fetchJson(url, { timeoutMs: 200_000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 5));
  const realNow = Date.now;
  Date.now = () => realNow() + 10_000_000;
  const second = fetchJson(url, { timeoutMs: 200_000 });
  Date.now = realNow;
  await new Promise((r) => setTimeout(r, 5));
  const joiner = fetchJson(url, { timeoutMs: 200_000 });
  release!(body({ first: true }));
  await first;
  const third = fetchJson(url, { timeoutMs: 200_000 });
  finishSecond!(body({ second: true }));
  assert.deepEqual(await second, { second: true });
  assert.deepEqual(await joiner, { second: true });
  assert.deepEqual(await third, { second: true }, "the third caller joined the successor");
  assert.equal(calls, 2);
});
