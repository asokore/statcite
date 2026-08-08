// SDMX adapter (BIS + ECB). Fixture bodies are ABRIDGED COPIES of real
// responses captured live 2026-08-08, preserving the two envelope shapes and
// the value-type split (BIS strings, ECB numbers) that a shared parser gets
// wrong. Self-contained stub like as-of.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

// BIS: `data` envelope, 2-dim series key, values as STRINGS.
function bisBody(periods: string[], values: string[]): string {
  return JSON.stringify({
    meta: { id: "IDREF1", prepared: "2026-08-08T12:13:49" },
    data: {
      dataSets: [{ series: { "0:0": { observations: Object.fromEntries(values.map((v, i) => [String(i), [v, 0, 0, null]])) } }}],
      structure: {
        name: "Central bank policy rates",
        dimensions: {
          series: [
            { id: "FREQ", values: [{ id: "M", name: "Monthly" }] },
            { id: "REF_AREA", values: [{ id: "US", name: "United States" }] },
          ],
          observation: [{ id: "TIME_PERIOD", role: "time", values: periods.map((p) => ({ id: p, name: p })) }],
        },
      },
    },
  });
}

// ECB: NO envelope, 6-dim series key, values as NUMBERS.
function ecbBody(periods: string[], values: number[]): string {
  return JSON.stringify({
    header: { id: "d1", prepared: "2026-08-08T14:13:13.660+02:00", sender: { id: "ECB" } },
    dataSets: [{ series: { "0:0:0:0:0:0": { observations: Object.fromEntries(values.map((v, i) => [String(i), [v, 0, 0, null, null]])) } }}],
    structure: {
      name: "Indices of Consumer Prices",
      dimensions: {
        series: [{ id: "FREQ", values: [{ id: "M" }] }, { id: "REF_AREA", values: [{ id: "U2" }] }],
        observation: [{ id: "TIME_PERIOD", role: "time", values: periods.map((p) => ({ id: p, name: p })) }],
      },
    },
  });
}

let lastUrl = "";
function installStub(opts: { bis?: string; ecb?: string; bisStatus?: number } = {}): void {
  _clearMemCache();
  lastUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    lastUrl = url;
    if (url.includes("stats.bis.org")) {
      return new Response(opts.bis ?? bisBody(["2026-05", "2026-06", "2026-07"], ["3.875", "3.625", "3.625"]), {
        status: opts.bisStatus ?? 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("data-api.ecb.europa.eu")) {
      return new Response(opts.ecb ?? ecbBody(["2026-05", "2026-06", "2026-07"], [2.7, 2.8, 2.9]), {
        status: 200,
        headers: { "content-type": "application/vnd.sdmx.data+json;version=1.0.0-wd" },
      });
    }
    return new Response(JSON.stringify({ error: "no sdmx fixture for " + url }), { status: 599 });
  }) as typeof fetch;
}

const testEnv: Env = {
  ASSETS: { fetch: async () => new Response("<!doctype html><title>StatCite</title>", { headers: { "content-type": "text/html" } }) },
  BASE_URL: "https://statcite.test",
};
let idCounter = 9800;
async function tool(name: string, args: Record<string, unknown>): Promise<{ payload: any; isError: boolean }> {
  const res = await handleRequest(
    new Request("https://statcite.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++idCounter, method: "tools/call", params: { name, arguments: args } }),
    }),
    testEnv,
  );
  const rpc = (await res.json()) as any;
  return { payload: JSON.parse(rpc.result.content[0].text), isError: Boolean(rpc.result.isError) };
}

test("BIS policy rate: string values parse, ISO2 substituted, BIS citation attached", async () => {
  installStub();
  const { payload, isError } = await tool("get_indicator", { indicator: "policy_rate", country: "USA" });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.match(lastUrl, /stats\.bis\.org\/api\/v2\/data\/dataflow\/BIS\/WS_CBPOL\/1\.0\/M\.US/);
  // BIS sends "3.625" as a STRING — it must arrive as a number.
  const latest = payload.observations.at(-1);
  assert.equal(latest.value, 3.625);
  assert.equal(typeof latest.value, "number");
  assert.equal(latest.period, "2026-07");
  assert.match(payload.citation.attribution, /Bank for International Settlements/);
  assert.match(payload.citation.source_url, /bis\.org/);
  assert.ok(payload.citation.export_formats.bibtex.includes("Bank for International Settlements"));
});

test("ECB HICP: numeric values parse; the euro-area-only series refuses a national country", async () => {
  installStub();
  const ok = await tool("get_indicator", { indicator: "euro_area_hicp", country: "euro area" });
  assert.equal(ok.isError, false, JSON.stringify(ok.payload));
  assert.equal(ok.payload.observations.at(-1).value, 2.9);
  assert.match(ok.payload.citation.attribution, /European Central Bank/);

  // A euro-area aggregate must not silently answer for a single member state.
  const wrong = await tool("get_indicator", { indicator: "euro_area_hicp", country: "DEU" });
  assert.equal(wrong.isError, true);
  assert.match(JSON.stringify(wrong.payload), /euro-area aggregate|only published for the euro area/i);
});

test("STALENESS IS ASSERTED: a 200 with months-old data carries a disclosure note", async () => {
  // The real failure this guards: the ECB's legacy ICP flow served December
  // 2025 inflation, with HTTP 200 and well-formed JSON, in August 2026.
  installStub({ ecb: ecbBody(["2025-10", "2025-11", "2025-12"], [2.1, 2.0, 1.9]) });
  const { payload, isError } = await tool("get_indicator", { indicator: "euro_area_hicp", country: "euro area" });
  assert.equal(isError, false);
  assert.ok(
    payload.notes.some((n: string) => /freshness warning/i.test(n) && /2025-12/.test(n)),
    `expected a staleness note naming the stale period, got: ${JSON.stringify(payload.notes)}`,
  );
});

test("fresh data carries NO staleness note (the sentinel must not cry wolf)", async () => {
  // Prove the guard discriminates: same code path, current periods, no note.
  const now = new Date();
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  installStub({ ecb: ecbBody([ym(prev), ym(now)], [2.8, 2.9]) });
  const { payload } = await tool("get_indicator", { indicator: "euro_area_hicp", country: "euro area" });
  assert.ok(!payload.notes.some((n: string) => /freshness warning/i.test(n)), "fresh data must not be flagged stale");
});

test("a 200 carrying XML (the ECB's silent format failure) is rejected, not parsed", async () => {
  installStub({ bis: "<?xml version='1.0'?><message:GenericData xmlns:message='x'/>" });
  const { isError } = await tool("get_indicator", { indicator: "policy_rate", country: "USA" });
  assert.equal(isError, true, "an XML body must surface as an error, never as an empty-but-successful series");
});

test("an economy the BIS does not cover reports honest absence, not a guess", async () => {
  installStub({ bis: bisBody([], []) });
  const { payload, isError } = await tool("get_indicator", { indicator: "policy_rate", country: "BRB" });
  assert.equal(isError, true);
  assert.match(JSON.stringify(payload), /no_published_data|coverage fact/i);
});
