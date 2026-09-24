// A source that could not be READ is not a source that publishes nothing.
// country_snapshot recorded only that a call had failed, so a dead World Bank
// came back either as "this economy publishes none of these", cached for an
// hour, or as an error coded invalid_request: the caller's fault, for an outage.
// The controls below are the point of the file, because the fix is worthless if
// it turns real coverage facts into false outages.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import { dmValuesBody, isDataMapperValuesUrl, isDataMapperMetadataUrl, STANDARD_DM_METADATA, DM_CODES } from "./dm-fixtures.ts";

const env = {
  ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
  BASE_URL: "https://statcite.test",
} as unknown as Env;

const WB_HOSTS = /api\.worldbank\.org|www\.imf\.org|api\.db\.nomics\.world/;
const CARIBSTAT = /asokore\.github\.io\/caribstat/;

/** An ECCB document in the shape the live origin serves, so the ECCU supplement
 * has something real to build items from without touching the network. */
function eccbDoc(iso3: string, name: string) {
  return JSON.stringify({
    source: "Eastern Caribbean Central Bank",
    source_id: "eccb",
    source_url: "https://www.eccb-centralbank.org/statistics",
    table_id: "total-public-sector-debt",
    table_title: "Total Public Sector Debt",
    country: { iso3, name },
    frequency: "a",
    data_as_at: "2026-06-08",
    retrieved_at: "2026-08-13T16:28:44.604Z",
    periods: ["2024", "2025"],
    series: [
      { label: "Central Government Debt", unit: "EC$M", observations: [{ period: "2024", value: 210.4 }, { period: "2025", value: 219.9 }] },
    ],
  });
}

/** Empty but WELL-FORMED World Bank envelope: the source answered and said it
 * publishes nothing here. A definitive absence, not an outage. */
const WB_EMPTY = JSON.stringify([{ page: 0, pages: 0, per_page: 0, total: 0 }, null]);

/** A well-formed DBnomics envelope holding no matching series: the adapter reads
 * it as a definitive absence, not a transport failure. */
const DBN_EMPTY = JSON.stringify({ provider: { name: "IMF" }, dataset: { code: "WEO" }, series: { docs: [] } });

type Plan = { wb: "down" | "empty" | "refused"; caribstat: "down" | "doc" | "absent" };

function stub(plan: Plan, iso3 = "GRD", name = "Grenada") {
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const h = { "content-type": "application/json" };
    if (WB_HOSTS.test(url)) {
      if (plan.wb === "down") return new Response(JSON.stringify({ error: "down" }), { status: 503, headers: h });
      // A definitive 4xx: the source answered and refused. Not transient, so it
      // must be read as coverage, never as an outage.
      if (plan.wb === "refused") return new Response("no such country", { status: 404, headers: { "content-type": "text/html" } });
      // "empty" must mean ANSWERED AND HELD NOTHING on every leg, in each API's
      // own shape. A World Bank envelope served to the IMF DataMapper URL is an
      // unparseable response, which the service correctly reads as a transient
      // failure, so a lazier stub would have made this control assert the
      // opposite of what it claims to.
      if (isDataMapperMetadataUrl(url)) return new Response(STANDARD_DM_METADATA, { status: 200, headers: h });
      if (isDataMapperValuesUrl(url, DM_CODES.govt_debt_gdp)) {
        return new Response(dmValuesBody(DM_CODES.govt_debt_gdp, {}), { status: 200, headers: h });
      }
      if (/db\.nomics\.world/.test(url)) return new Response(DBN_EMPTY, { status: 200, headers: h });
      return new Response(WB_EMPTY, { status: 200, headers: h });
    }
    if (CARIBSTAT.test(url)) {
      if (plan.caribstat === "down") return new Response(JSON.stringify({ error: "down" }), { status: 503, headers: h });
      if (plan.caribstat === "absent") return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
      return new Response(eccbDoc(iso3, name), { status: 200, headers: h });
    }
    return new Response(JSON.stringify({ error: "unrouted" }), { status: 599, headers: h });
  }) as typeof fetch;
}

async function snapshot(country: string) {
  const res = await handleRequest(new Request(`https://statcite.test/v1/snapshot/${country}`), env);
  return { res, body: (await res.json()) as any };
}

// --- 1. A dead upstream must not be published as a fact about the country ---

test("a total upstream outage is coded as an outage, not as the caller's fault", async () => {
  stub({ wb: "down", caribstat: "down" });
  const { res, body } = await snapshot("USA");
  // 502, not 422: the code now decides the status, so the snapshot route
  // answers an outage the way the adapter routes and docs.html always did.
  assert.equal(res.status, 502);
  assert.equal(
    body.error.code,
    "upstream_unavailable",
    "an unreachable World Bank is not an invalid request; /v1/indicator already codes the same outage this way",
  );
  assert.ok(
    !/No snapshot data available/.test(body.error.message),
    "the message must not assert a coverage fact StatCite did not establish",
  );
  assert.ok(Array.isArray(body.error.details?.sources), "must name which sources could not be reached");
  assert.match(JSON.stringify(body.error.details.sources), /World Bank/);
});

test("an ISO3 caller is not told the code twice", async () => {
  // Absence path, ISO3 in: 'USA' (USA) reads as a bug to the agent quoting it.
  stub({ wb: "empty", caribstat: "absent" });
  const { body } = await snapshot("USA");
  assert.ok(!/'USA' \(USA\)/.test(body.error.message), `redundant echo: ${body.error.message}`);
});

// --- 2. The 200 that quietly fabricates a coverage sentence ----------------

test("a World Bank outage does not publish a World Bank coverage claim", async () => {
  // Grenada has nine World Bank indicators live. With only the World Bank down,
  // the ECCU supplement still yields items, so this returns 200 — and today that
  // 200 carries a sentence saying the World Bank publishes none of them, cached
  // public max-age=3600.
  stub({ wb: "down", caribstat: "doc" });
  const { res, body } = await snapshot("GRD");
  assert.equal(res.status, 200);
  assert.ok(body.indicators.length > 0, "the ECCB items must still serve");
  assert.ok(
    !body.notes.some((n: string) => /World Bank publishes none/.test(n)),
    "an unreachable source is not a source that publishes nothing",
  );
  assert.ok(
    body.notes.some((n: string) => /could not be reached|unavailable/i.test(n)),
    "the shortfall must be explained as an outage the caller can retry",
  );
  assert.equal(
    res.headers.get("cache-control"),
    "no-store",
    "a snapshot shortened by an outage must not sit in a shared cache after the source recovers",
  );
});

// --- 3. Controls: the absence behaviour this must NOT disturb ---------------

test("CONTROL: a genuine ECCU-only coverage gap is still an absence, not an outage", async () => {
  // World Bank answers and publishes nothing; the ECCB table genuinely is not
  // collected (404). Every attempt was definitive, so the honest answer is the
  // absence wording, unchanged.
  stub({ wb: "empty", caribstat: "absent" }, "AIA", "Anguilla");
  const { res, body } = await snapshot("AIA");
  assert.equal(res.status, 422);
  assert.notEqual(body.error.code, "upstream_unavailable", "nothing failed transiently here");
  assert.match(body.error.message, /No snapshot data available/);
});

test("CONTROL: an integrated territory still gets its publisher, not an outage code", async () => {
  stub({ wb: "down", caribstat: "down" });
  const { body } = await snapshot("MTQ");
  assert.match(JSON.stringify(body), /overseas department of France/i);
  assert.match(JSON.stringify(body), /INSEE/);
});

test("CONTROL: a healthy ECCU snapshot still carries the ECCB definitions warning", async () => {
  stub({ wb: "empty", caribstat: "doc" }, "AIA", "Anguilla");
  const { res, body } = await snapshot("AIA");
  assert.equal(res.status, 200);
  assert.ok(
    body.notes.some((n: string) => /not interchangeable with the World Bank series/.test(n)),
    "the definitions warning is load-bearing and must survive",
  );
  assert.ok(
    body.notes.some((n: string) => /World Bank publishes none/.test(n)),
    "a REAL World Bank absence must still be stated plainly",
  );
});

test("CONTROL: a definitive World Bank refusal is coverage, not an outage", async () => {
  // The discriminating case. Both "unreachable" and "refused" are failures of
  // the same call, and a classifier that simply records THAT it failed cannot
  // tell them apart. A 404 is the source saying it does not cover this economy,
  // which is the honest-absence claim this service is built on, so it must keep
  // the coverage note, carry no sources_unavailable, and stay cacheable.
  stub({ wb: "refused", caribstat: "doc" }, "AIA", "Anguilla");
  const { res, body } = await snapshot("AIA");
  assert.equal(res.status, 200, JSON.stringify(body).slice(0, 200));
  assert.equal(body.sources_unavailable, undefined, "a source that answered is not unavailable");
  assert.match(
    body.notes.join(" "),
    /publishes none of its headline indicators/,
    "a refusal is the coverage claim, and it must still be made",
  );
  assert.doesNotMatch(body.notes.join(" "), /could not be reached/);
  assert.match(res.headers.get("cache-control") ?? "", /max-age=3600/, "a complete answer stays cacheable");
});

test("a snapshot shortened by an outage is not left in shared caches", async () => {
  // The other half of the same rule: an ECCU-only snapshot served while the
  // World Bank is down looks identical to the one above, and an hour in a shared
  // cache would keep serving it after the source is back.
  stub({ wb: "down", caribstat: "doc" }, "AIA", "Anguilla");
  const { res, body } = await snapshot("AIA");
  assert.equal(res.status, 200, JSON.stringify(body).slice(0, 200));
  assert.ok(Array.isArray(body.sources_unavailable) && body.sources_unavailable.length > 0);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
});

// --- one World Bank retry ladder per snapshot, not two ------------------------
//
// A snapshot calls the World Bank twice in sequence: fetchWbMulti for the
// headline indicators, then govt_debt_gdp's source chain, which ends at the
// World Bank. The per-request host breaker exists so that a host which has
// already failed one full attempt series is asked once more, not three times.
// fetchWbMulti was never handed the request's host state, so the breaker could
// not see the first ladder fail and the second ran in full. Measured 2026-09-24
// against /v1/snapshot/FRA with every upstream down: api.worldbank.org x6,
// about 1.2s of extra waiting per snapshot in a real World Bank outage.

function countingOutage() {
  _clearMemCache();
  const hosts = new Map<string, number>();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const h = new URL(url).host;
    hosts.set(h, (hosts.get(h) ?? 0) + 1);
    return new Response(JSON.stringify({ error: "down" }), { status: 503, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return hosts;
}

test("a World Bank outage costs a snapshot one retry ladder, not two", async () => {
  const hosts = countingOutage();
  const { res, body } = await snapshot("FRA");
  // Behaviour unchanged: still an outage, still said so.
  assert.equal(res.status, 502, JSON.stringify(body).slice(0, 200));
  assert.equal(body.error.code, "upstream_unavailable");
  // One full series of three, then ONE attempt from the later leg, because the
  // host has stated its case for this request. Six means the breaker was blind.
  assert.equal(hosts.get("api.worldbank.org"), 4, `World Bank fetches: ${hosts.get("api.worldbank.org")}`);
  // The breaker is per host. The other sources still get their own full series.
  assert.equal(hosts.get("www.imf.org"), 3);
  assert.equal(hosts.get("api.db.nomics.world"), 3);
});

test("CONTROL: a single World Bank blip in a snapshot is still retried, not recorded as an outage", async () => {
  // The other class. Sharing the breaker must not shorten the FIRST series: one
  // 500 on the headline call has to be retried and recovered, or a momentary
  // blip would be published as "the World Bank could not be reached".
  stub({ wb: "empty", caribstat: "absent" }, "FRA", "France");
  const inner = globalThis.fetch;
  let failed = false;
  let wbCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (new URL(url).host === "api.worldbank.org") {
      wbCalls++;
      if (!failed) {
        failed = true;
        return new Response("blip", { status: 500 });
      }
    }
    return inner(input as RequestInfo, init);
  }) as typeof fetch;
  const { body } = await snapshot("FRA");
  assert.ok(wbCalls >= 2, "the blipped call must have been retried");
  assert.notEqual(body.error?.code, "upstream_unavailable", `a recovered blip is not an outage: ${JSON.stringify(body).slice(0, 200)}`);
  assert.equal(body.sources_unavailable, undefined);
});
