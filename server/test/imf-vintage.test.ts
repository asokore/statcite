// IMF first-party dated WEO vintages (api.imf.org, SDMX 3.0).
//
// This source exists to close a live degradation: on 2026-08-10 the revision
// probe reported status "unavailable" for the WEO 2025-10 edition purely
// because DBnomics had not ingested it, while the IMF served that exact
// vintage directly. So the dated-vintage chain is IMF-first, DBnomics-second.
//
// The two tests that matter most here are the SILENT-FAILURE guards. Both
// failure modes were observed live on the real endpoint, and both produce a
// wrong-but-plausible answer rather than an error:
//
//   1. Dimension values carry `value`, not `id`. Reading `id` yields undefined
//      for every period, the period filter drops them all, and a 200 carrying
//      51 real observations becomes a silently EMPTY series.
//   2. A well-formed key in the WRONG dimension order returns HTTP 200 with no
//      `series` key at all — no 404, no error. Left unguarded that becomes an
//      honest-looking "the IMF publishes nothing for this country".
//
// Fixture bodies are abridged copies of real responses captured 2026-08-10,
// preserving the `data` envelope, the `structures` ARRAY, the string values
// and the `value`-keyed periods. Self-contained stub, like sdmx.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import { IMF_VINTAGE_FLOWS } from "../src/core/series.ts";

/** Real IMF SDMX 3.0 shape: `data` envelope, `structures` array, string obs
 * values, and periods keyed by `value` (NOT `id`). */
function imfVintageBody(periods: string[], values: string[]): string {
  return JSON.stringify({
    meta: {},
    data: {
      dataSets: [
        {
          structure: 0,
          action: "Replace",
          series: {
            "0:0:0": {
              attributes: [0, 0, 0, "9/30/2025"],
              observations: Object.fromEntries(values.map((v, i) => [String(i), [v]])),
            },
          },
        },
      ],
      structures: [
        {
          dataSets: [0],
          dimensions: {
            series: [
              { id: "COUNTRY", keyPosition: 0, values: [{ id: "USA" }] },
              { id: "INDICATOR", keyPosition: 1, values: [{ id: "NGDP_RPCH" }] },
              { id: "FREQUENCY", keyPosition: 2, values: [{ id: "A" }] },
            ],
            // The whole point: `value`, not `id`.
            observation: [{ id: "TIME_PERIOD", keyPosition: 3, values: periods.map((p) => ({ value: p })) }],
          },
          measures: { observation: [{ id: "OBS_VALUE" }] },
        },
      ],
    },
  });
}

/** The wrong-key-order response, verified live: 200, dataSets present, NO
 * series key, and every dimension value list empty. */
function imfEmptyBody(): string {
  return JSON.stringify({
    meta: {},
    data: {
      dataSets: [{ structure: 0, action: "Replace" }],
      structures: [
        {
          dataSets: [0],
          dimensions: {
            series: [
              { id: "COUNTRY", keyPosition: 0, values: [] },
              { id: "INDICATOR", keyPosition: 1, values: [] },
              { id: "FREQUENCY", keyPosition: 2, values: [] },
            ],
            observation: [{ id: "TIME_PERIOD", keyPosition: 3, values: [] }],
          },
          measures: { observation: [{ id: "OBS_VALUE" }] },
        },
      ],
    },
  });
}

/** A DBnomics dated-WEO body, so the fallback leg can be exercised. */
function dbnomicsBody(periods: string[], values: number[]): string {
  return JSON.stringify({
    series: {
      docs: [
        {
          provider_code: "IMF",
          dataset_code: "WEO:2025-10",
          dataset_name: "World Economic Outlook",
          series_code: "USA.NGDP_RPCH.pcent_change",
          series_name: "United States – Real GDP growth",
          period: periods,
          value: values,
        },
      ],
    },
  });
}

const env: Env = {
  ASSETS: { fetch: async () => new Response("site") },
  BASE_URL: "https://statcite.com",
} as unknown as Env;

let calls: string[] = [];

function installStub(opts: { imf?: string; imfStatus?: number; dbnomics?: string; dbnomicsStatus?: number } = {}): void {
  _clearMemCache();
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.includes("api.imf.org")) {
      return new Response(
        opts.imf ?? imfVintageBody(["2022", "2023", "2024"], ["2.524", "2.935", "2.793"]),
        { status: opts.imfStatus ?? 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.db.nomics.world")) {
      return new Response(opts.dbnomics ?? dbnomicsBody(["2022", "2023", "2024"], [1.94, 2.89, 2.8]), {
        status: opts.dbnomicsStatus ?? 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "unstubbed " + url }), { status: 599 });
  }) as typeof fetch;
}

async function mcpTool(name: string, args: Record<string, unknown>): Promise<{ payload: any; isError: boolean }> {
  const res = await handleRequest(
    new Request("https://statcite.com/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    env,
  );
  const rpc: any = await res.json();
  let payload: any;
  try {
    payload = JSON.parse(rpc?.result?.content?.[0]?.text ?? "null");
  } catch {
    payload = rpc?.result?.content?.[0]?.text;
  }
  return { payload, isError: Boolean(rpc?.result?.isError) };
}

// An as_of date inside 2026-01 resolves to the WEO 2025-10 edition on the
// conservative May 1 / Nov 1 calendar. Pinning the edition through as_of keeps
// every test below independent of the wall clock — deriving it from "today"
// would make these tests start exercising a different edition in November 2026
// and quietly stop testing the IMF leg at all.
const AS_OF_2025_10 = "2026-01-15";

test("the pinned edition these tests exercise is one the IMF vintage map covers", () => {
  assert.ok(
    IMF_VINTAGE_FLOWS["2025-10"],
    "IMF_VINTAGE_FLOWS lost its 2025-10 entry — the tests below would silently fall through to DBnomics and stop testing the IMF leg",
  );
});

test("dated vintage is served from the IMF first, and DBnomics is never called", async () => {
  installStub();
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "gdp_growth",
    country: "USA",
    period: "2023",
    claimed_value: 2.935,
    as_of: AS_OF_2025_10,
  });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.official_value, 2.935, "should be the IMF's own vintage value, not DBnomics's 2.89");
  assert.ok(
    calls.some((u) => u.includes("api.imf.org")),
    `expected an api.imf.org call, got: ${JSON.stringify(calls)}`,
  );
  assert.ok(
    !calls.some((u) => u.includes("api.db.nomics.world")),
    `DBnomics must not be called when the IMF serves the vintage, got: ${JSON.stringify(calls)}`,
  );
  assert.equal(payload.citation.source, "International Monetary Fund");
  assert.match(payload.citation.dataset, /World Economic Outlook, October 2025 vintage/);
  // The IMF's terms specify the attribution shape: database name AND link.
  assert.match(payload.citation.attribution, /^Source: International Monetary Fund, .+, https?:\/\//);
  // Provenance note must name the source that ACTUALLY served. gdp_growth's
  // live primary is World Bank, so the source-changed note fires — and it must
  // say first-party api.imf.org here, not the hardcoded "(via DBnomics)" that
  // misattributed provenance in production on 2026-08-10.
  const notes = JSON.stringify(payload.notes ?? []);
  assert.match(notes, /first-party, api\.imf\.org/);
  assert.ok(!notes.includes("via DBnomics"), `note still misattributes to DBnomics: ${notes}`);
});

test("GUARD: `value`-keyed periods parse — an id-only reader would return a silently empty series", async () => {
  // Assert PERIOD ALIGNMENT, not observation count. An id-only reader empties
  // the IMF series, the chain falls back to DBnomics, and DBnomics returns the
  // same three periods — so a count-only assertion passes while the guard is
  // broken (verified by mutation, 2026-08-10). The two fixtures deliberately
  // disagree per period (IMF 2022 = 2.524, DBnomics 2022 = 1.94), so pinning
  // one year proves the right periods were bound to the right values.
  installStub();
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "gdp_growth",
    country: "USA",
    period: "2022",
    claimed_value: 2.524,
    as_of: AS_OF_2025_10,
  });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(
    payload.official_value,
    2.524,
    "the 2022 observation did not carry the IMF's 2022 value — periods failed to bind, so the adapter is reading `id` instead of `value`",
  );
  assert.equal(payload.citation.source, "International Monetary Fund");
  assert.match(payload.citation.dataset, /October 2025 vintage/);
  assert.ok(
    !calls.some((u) => u.includes("api.db.nomics.world")),
    "fell through to DBnomics — the IMF series parsed empty",
  );
});

test("GUARD: 200-with-no-series is a malformed key, never an absence of published data", async () => {
  // The IMF returns this for a wrong dimension order. If it were reported as
  // no_published_data, one transposed key would become a confident false claim
  // that the IMF publishes nothing for the country.
  installStub({ imf: imfEmptyBody() });
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "gdp_growth",
    country: "USA",
    period: "2023",
    claimed_value: 2.89,
    as_of: AS_OF_2025_10,
  });
  // It must fall through to DBnomics rather than claim absence...
  assert.ok(
    calls.some((u) => u.includes("api.db.nomics.world")),
    "an empty IMF response must fall through to DBnomics, not end the chain",
  );
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.official_value, 2.89, "should now be DBnomics's value");
  // ...and nothing anywhere in the response may call this a coverage fact.
  assert.ok(
    !/no_published_data/.test(JSON.stringify(payload)),
    "an empty-series response was reported as a no-published-data coverage fact",
  );
});

test("an IMF outage falls back to the DBnomics archive rather than failing the request", async () => {
  installStub({ imfStatus: 503 });
  const { payload, isError } = await mcpTool("verify_stat", {
    indicator: "gdp_growth",
    country: "USA",
    period: "2023",
    claimed_value: 2.89,
    as_of: AS_OF_2025_10,
  });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.official_value, 2.89);
  assert.ok(calls.some((u) => u.includes("api.db.nomics.world")));
});

test("an edition with no IMF vintage flow goes straight to DBnomics without probing the IMF", async () => {
  installStub({ dbnomics: dbnomicsBody(["2018", "2019"], [2.9, 2.3]) });
  const { isError } = await mcpTool("verify_stat", {
    indicator: "gdp_growth",
    country: "USA",
    period: "2019",
    claimed_value: 2.3,
    as_of: "2019-06-01",
  });
  assert.equal(isError, false);
  assert.ok(
    !calls.some((u) => u.includes("api.imf.org")),
    "the IMF must only be attempted for editions enumerated in IMF_VINTAGE_FLOWS — never by guessing a flow id",
  );
});
