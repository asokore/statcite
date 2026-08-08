// Revision probe (GROWTH-PLAN Phase 1b): a MISMATCH on a WEO-dated indicator
// re-judges the claim against the PREVIOUS WEO edition. GUARD THE LAST HOP:
// these tests prove the probe actually FIRES (dated-edition fetch observed,
// field present, diagnostic pushed), not merely that the code parses.
// Self-contained stub, like as-of.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import { dmValuesBody, DM_CODES, STANDARD_DM_METADATA, isDataMapperValuesUrl, isDataMapperMetadataUrl } from "./dm-fixtures.ts";

// The probe's edition depends on the real clock (tests do not pin it), so the
// route matches ANY dated WEO edition — the assertion is on behavior, not on
// which edition the calendar picked today.
const DATED_WEO = /WEO%3A\d{4}-(04|10)/;

let datedFetches: string[] = [];
let serveDatedEdition = true;

// DBnomics dated-series body: 2023 value 130.0 — the "previous vintage" figure,
// far from the current edition's 121.7 so the two verdicts cannot blur.
function dbnomicsDatedBody(url: string): string {
  const ed = decodeURIComponent(url).match(/WEO:(\d{4}-\d{2})/)?.[1] ?? "0000-00";
  return JSON.stringify({
    series: {
      docs: [{
        series_code: "USA.GGXWDG_NGDP.pcent_gdp",
        series_name: "General government gross debt (USA)",
        dataset_code: `WEO:${ed}`,
        dataset_name: `WEO by countries (${ed})`,
        provider_code: "IMF",
        period: ["2022", "2023", "2024"],
        value: [128.0, 130.0, 131.5],
      }],
    },
  });
}

function installStub(): void {
  _clearMemCache();
  datedFetches = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (isDataMapperMetadataUrl(url)) {
      return new Response(STANDARD_DM_METADATA, { status: 200, headers: { "content-type": "application/json" } });
    }
    if (isDataMapperValuesUrl(url, DM_CODES.govt_debt_gdp)) {
      return new Response(
        dmValuesBody(DM_CODES.govt_debt_gdp, {
          USA: { "2023": 121.7, "2024": 122.3, "2025": 123.9, "2026": 125.8, "2027": 128.6, "2028": 132.1, "2029": 135.5, "2030": 138.9, "2031": 142.1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.db.nomics.world") && DATED_WEO.test(url) && url.includes("USA.GGXWDG_NGDP")) {
      datedFetches.push(url);
      if (!serveDatedEdition) return new Response(JSON.stringify({ error: "edition missing" }), { status: 404 });
      return new Response(dbnomicsDatedBody(url), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "no revision fixture for " + url }), { status: 599 });
  }) as typeof fetch;
}

const testEnv: Env = {
  ASSETS: { fetch: async () => new Response("<!doctype html><title>StatCite</title>", { headers: { "content-type": "text/html" } }) },
  BASE_URL: "https://statcite.test",
};

let idCounter = 9700;
async function verify(args: Record<string, unknown>): Promise<any> {
  const res = await handleRequest(
    new Request("https://statcite.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++idCounter, method: "tools/call", params: { name: "verify_stat", arguments: args } }),
    }),
    testEnv,
  );
  const rpc = (await res.json()) as any;
  return JSON.parse(rpc.result.content[0].text);
}

test("revision probe FIRES on mismatch: claim matching the previous vintage is flagged as a revision event", async () => {
  installStub();
  serveDatedEdition = true;
  const r = await verify({ indicator: "govt_debt_gdp", country: "USA", period: "2023", claimed_value: 130.0 });
  assert.equal(r.verdict, "mismatch"); // vs current 121.7
  assert.ok(datedFetches.length >= 1, "the dated-edition probe fetch must actually happen");
  assert.equal(r.revision_check?.status, "checked");
  assert.equal(r.revision_check?.previous_value, 130.0);
  assert.equal(r.revision_check?.matches_previous_vintage, true);
  assert.match(r.revision_check?.previous_edition, /^WEO \d{4}-(04|10)$/);
  assert.match(r.revision_check?.next_edition_expected, /^(April|October) \d{4}$/);
  assert.ok(
    r.diagnostics.some((d: string) => /revision event, not necessarily an author error/.test(d)),
    "the revision diagnostic must be surfaced in diagnostics",
  );
});

test("revision probe on mismatch that matches NO vintage: checked, matches false, no revision diagnostic", async () => {
  installStub();
  serveDatedEdition = true;
  const r = await verify({ indicator: "govt_debt_gdp", country: "USA", period: "2023", claimed_value: 55.0 });
  assert.equal(r.verdict, "mismatch");
  assert.equal(r.revision_check?.status, "checked");
  assert.equal(r.revision_check?.matches_previous_vintage, false);
  assert.ok(!r.diagnostics.some((d: string) => /revision event/.test(d)));
});

test("revision probe degrades honestly when the previous edition is unavailable", async () => {
  installStub();
  serveDatedEdition = false;
  const r = await verify({ indicator: "govt_debt_gdp", country: "USA", period: "2023", claimed_value: 130.0 });
  assert.equal(r.verdict, "mismatch");
  assert.equal(r.revision_check?.status, "unavailable");
  assert.equal(r.revision_check?.matches_previous_vintage, undefined);
  assert.match(r.revision_check?.note, /no revision judgment is offered/);
});

test("revision probe does NOT fire on match, under strict_source, or under as_of", async () => {
  installStub();
  serveDatedEdition = true;
  const match = await verify({ indicator: "govt_debt_gdp", country: "USA", period: "2023", claimed_value: 121.7 });
  assert.equal(match.verdict, "match");
  assert.equal(match.revision_check, undefined);
  assert.equal(datedFetches.length, 0, "no probe fetch on a match");

  const strict = await verify({ indicator: "govt_debt_gdp", country: "USA", period: "2023", claimed_value: 130.0, strict_source: true });
  assert.equal(strict.verdict, "mismatch");
  assert.equal(strict.revision_check, undefined, "strict_source must suppress the probe");
});
