// IMF DataMapper adapter + wiring: shape validation, country aliasing, the
// payload-anchored projection boundary, the per-Ctx fetch memo (dedupe +
// rejection memoization), the guard-proving is_projection/latest_only cases
// design D4 requires, the D6 vintage-crossing verify demotion, the imf/{CODE}
// series-id round trip, and a subrequest-budget test for a DataMapper outage.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { _clearMemCache, UpstreamError } from "../src/core/upstream.ts";
import {
  fetchDataMapperSeries,
  computeBoundaryYear,
  parseEditionLabel,
} from "../src/adapters/datamapper.ts";
import { getIndicator, getSeries } from "../src/core/series.ts";
import { verifyStat } from "../src/core/verify.ts";
import { runVerifyClaims } from "../src/tools.ts";
import { ToolError } from "../src/core/types.ts";
import type { Ctx } from "../src/core/types.ts";
import { dmValuesBody, dmMetadataBody, isDataMapperValuesUrl, isDataMapperMetadataUrl, DM_CODES } from "./dm-fixtures.ts";

const NOW = new Date("2026-07-25T12:00:00Z");
function newCtx(): Ctx {
  return { baseUrl: "https://statcite.test", now: () => NOW };
}

const APRIL_2026_META = dmMetadataBody({
  NGDP_RPCH: { label: "Real GDP growth", source: "World Economic Outlook (April 2026)", dataset: "WEO" },
  GGXWDG_NGDP: { label: "General government gross debt", source: "World Economic Outlook (April 2026)", dataset: "WEO" },
  GGR_G01_GDP_PT: { label: "Revenue", source: "Fiscal Monitor (April 2026)", dataset: "FM" },
  G_X_G01_GDP_PT: { label: "Expenditure", source: "Fiscal Monitor (April 2026)", dataset: "FM" },
});

let callLog: string[] = [];
let routes: Array<{ test: (url: string) => boolean; res: () => Response }> = [];

function jsonRes(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

function installRoutes(...rs: Array<{ test: (url: string) => boolean; res: () => Response }>): void {
  _clearMemCache();
  callLog = [];
  routes = rs;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    callLog.push(url);
    const r = routes.find((x) => x.test(url));
    if (!r) return jsonRes(JSON.stringify({ error: "no fixture for " + url }), 599);
    return r.res();
  }) as typeof fetch;
}

beforeEach(() => {
  callLog = [];
});

// ——— 1. parseEditionLabel ———

test("parseEditionLabel: parses month/year from the verbatim IMF string, tolerates variants and garbage", () => {
  assert.deepEqual(parseEditionLabel("World Economic Outlook (April 2026)"), { year: 2026, month: 4 });
  assert.deepEqual(parseEditionLabel("Fiscal Monitor (October 2025)"), { year: 2025, month: 10 });
  assert.deepEqual(parseEditionLabel("Some Future Release (January 2027)"), { year: 2027, month: 1 });
  assert.equal(parseEditionLabel("No parenthetical here"), undefined);
  assert.equal(parseEditionLabel(undefined), undefined);
  assert.equal(parseEditionLabel("Weird (Notamonth 2026)"), undefined);
});

// ——— 2. computeBoundaryYear: payload-anchored, with the calendar clamp ———

test("computeBoundaryYear: clean edition+5 horizon needs no clamp", () => {
  const r = computeBoundaryYear(2031, NOW); // April 2026 edition: expected calendar year 2026
  assert.deepEqual(r, { boundaryYear: 2026, clamped: false });
});

test("computeBoundaryYear: a garbled/truncated horizon clamps to the calendar year instead", () => {
  const r = computeBoundaryYear(2015, NOW); // naive boundary 2010, wildly off from calendar 2026
  assert.deepEqual(r, { boundaryYear: 2026, clamped: true });
});

test("computeBoundaryYear: a 1-year gap (adjacent-edition skew) is tolerated, not clamped", () => {
  const r = computeBoundaryYear(2030, NOW); // naive boundary 2025, |2025-2026|=1 <= 1
  assert.deepEqual(r, { boundaryYear: 2025, clamped: false });
});

// ——— 3. fetchDataMapperSeries: shape validation + country handling ———

test("fetchDataMapperSeries: a healthy payload returns observations, edition, and horizon", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"),
      res: () => jsonRes(dmValuesBody("NGDP_RPCH", { USA: { "2024": 2.8, "2025": 2.0, "2031": 2.1 } })),
    },
  );
  const s = await fetchDataMapperSeries(newCtx(), "NGDP_RPCH", "WEO", "USA", NOW);
  assert.equal(s.horizonYear, 2031);
  assert.equal(s.edition?.label, "World Economic Outlook (April 2026)");
  assert.equal(s.edition?.year, 2026);
  assert.equal(s.edition?.month, 4);
  assert.ok(s.observations.some((o) => o.period === "2024" && o.value === 2.8));
});

test("fetchDataMapperSeries: a code confirmed absent from /indicators is a definitive ToolError, not a retryable transient", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    { test: (u) => isDataMapperValuesUrl(u, "GGR_NGDP"), res: () => jsonRes(JSON.stringify({ api: { version: "1" } })) },
  );
  await assert.rejects(() => fetchDataMapperSeries(newCtx(), "GGR_NGDP", "WEO", "USA", NOW), ToolError);
  // The values fetch still runs fetchJson's normal 3-attempt schedule (a 200
  // with a bad shape looks identical to a transient blip until metadata is
  // checked) — what matters is the RESULT is a definitive, correctly-worded
  // ToolError, not a standing "retry, the primary may have recovered" lie, and
  // that the per-Ctx memo means a second call in the same request costs nothing
  // more (proven by the memo tests below).
  assert.equal(callLog.filter((u) => isDataMapperValuesUrl(u, "GGR_NGDP")).length, 3);
});

test("fetchDataMapperSeries: an empty envelope for a code metadata DOES list is a transient UpstreamError (retried)", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    { test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"), res: () => jsonRes(JSON.stringify({ api: { version: "1" } })) },
  );
  await assert.rejects(() => fetchDataMapperSeries(newCtx(), "NGDP_RPCH", "WEO", "USA", NOW), UpstreamError);
  // Transient: fetchJson's full retry schedule (3 attempts) fires against the decoy.
  assert.equal(callLog.filter((u) => isDataMapperValuesUrl(u, "NGDP_RPCH")).length, 3);
});

test("fetchDataMapperSeries: a healthy payload missing the requested country is a ToolError naming the payload, not 'no data exists'", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    { test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"), res: () => jsonRes(dmValuesBody("NGDP_RPCH", { USA: { "2024": 2.8 } })) },
  );
  await assert.rejects(
    () => fetchDataMapperSeries(newCtx(), "NGDP_RPCH", "WEO", "TUV", NOW),
    (e: unknown) => {
      assert.ok(e instanceof ToolError);
      assert.match((e as Error).message, /not present in the IMF DataMapper WEO payload/);
      return true;
    },
  );
});

test("fetchDataMapperSeries: PSE and XKX are translated to the DataMapper keys WBG/UVK", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "GGR_G01_GDP_PT"),
      res: () => jsonRes(dmValuesBody("GGR_G01_GDP_PT", { WBG: { "2024": 20.1 }, UVK: { "2024": 27.4 } })),
    },
  );
  const pse = await fetchDataMapperSeries(newCtx(), "GGR_G01_GDP_PT", "FM", "PSE", NOW);
  assert.ok(pse.observations.some((o) => o.period === "2024" && o.value === 20.1));
  const xkx = await fetchDataMapperSeries(newCtx(), "GGR_G01_GDP_PT", "FM", "XKX", NOW);
  assert.ok(xkx.observations.some((o) => o.period === "2024" && o.value === 27.4));
});

test("fetchDataMapperSeries: degraded mode when metadata is unreachable — edition is undefined, values still served", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes("service unavailable", 503) },
    { test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"), res: () => jsonRes(dmValuesBody("NGDP_RPCH", { USA: { "2024": 2.8 } })) },
  );
  const s = await fetchDataMapperSeries(newCtx(), "NGDP_RPCH", "WEO", "USA", NOW);
  assert.equal(s.edition, undefined);
  assert.ok(s.observations.some((o) => o.period === "2024"));
});

// ——— 4. Per-Ctx memo: dedupe + rejection memoization ———

test("memo: concurrent calls for the same code+country share one values fetch and one metadata fetch", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    { test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"), res: () => jsonRes(dmValuesBody("NGDP_RPCH", { USA: { "2024": 2.8 } })) },
  );
  const ctx = newCtx();
  await Promise.all([
    fetchDataMapperSeries(ctx, "NGDP_RPCH", "WEO", "USA", NOW),
    fetchDataMapperSeries(ctx, "NGDP_RPCH", "WEO", "USA", NOW),
    fetchDataMapperSeries(ctx, "NGDP_RPCH", "WEO", "USA", NOW),
  ]);
  assert.equal(callLog.filter((u) => isDataMapperValuesUrl(u, "NGDP_RPCH")).length, 1, "values fetched once, not 3 times");
  assert.equal(callLog.filter((u) => isDataMapperMetadataUrl(u)).length, 1, "metadata fetched once, not 3 times");
});

test("memo: a rejection is shared too — concurrent callers see one failed attempt-series, not N", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    { test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"), res: () => jsonRes(JSON.stringify({ api: { version: "1" } })) },
  );
  const ctx = newCtx();
  const results = await Promise.allSettled([
    fetchDataMapperSeries(ctx, "NGDP_RPCH", "WEO", "USA", NOW),
    fetchDataMapperSeries(ctx, "NGDP_RPCH", "WEO", "USA", NOW),
    fetchDataMapperSeries(ctx, "NGDP_RPCH", "WEO", "USA", NOW),
  ]);
  assert.ok(results.every((r) => r.status === "rejected"));
  // 3 real retry attempts total (the shared in-flight promise), not 9 (3 callers x 3 attempts).
  assert.equal(callLog.filter((u) => isDataMapperValuesUrl(u, "NGDP_RPCH")).length, 3);
});

// ——— 5. Guard-proving: is_projection and latest_only must work on Fiscal Monitor data ———
// (Both would fail against the pre-Phase-2 code: markWeoProjections/weoProjectionNote/
// verify.ts's is_projection detector were coupled to the literal "WEO" string.)

test("guard: an FM (Fiscal Monitor) projection sets is_projection=true, not silently unmarked", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "GGR_G01_GDP_PT"),
      res: () =>
        jsonRes(
          dmValuesBody("GGR_G01_GDP_PT", {
            BRB: { "2024": 30.1, "2025": 31.0, "2026": 32.0, "2027": 33.0, "2028": 34.0, "2029": 35.0, "2030": 36.0, "2031": 37.0 },
          }),
        ),
    },
  );
  const r = await verifyStat(newCtx(), { indicator: "govt_revenue_gdp", country: "BRB", period: "2026", claimed_value: 32.0 });
  assert.equal(r.verdict, "match");
  assert.equal(r.is_projection, true, "Fiscal Monitor projections must set is_projection, same as WEO");
});

test("guard: latest_only on a DataMapper series prefers the outturn over a later projection", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"),
      res: () =>
        jsonRes(
          dmValuesBody("NGDP_RPCH", {
            USA: { "2024": 2.8, "2025": 2.0, "2026": 1.9, "2027": 1.8, "2028": 1.8, "2029": 1.8, "2030": 1.8, "2031": 1.8 },
          }),
        ),
    },
  );
  const result = await getIndicator(newCtx(), "gdp_growth", "USA", { limit: 1 });
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].period, "2025", "2025 is the last non-projection year (boundary=2026)");
  // D11 wording: never "outturn" — a pre-boundary IMF value may itself be a staff estimate.
  assert.match(result.notes.join(" "), /Latest value not marked as a projection/);
  assert.ok(!/published outturn/.test(result.notes.join(" ")), "the note must not claim the value is an outturn");
});

test("guard: the unconditional heuristic caveat fires even when a country's series ends before the boundary year", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    // A Syria-like early-terminating series: last observation 2010, well before boundary 2026.
    { test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"), res: () => jsonRes(dmValuesBody("NGDP_RPCH", { SYR: { "2009": 5.9, "2010": 3.4 } })) },
  );
  const result = await getIndicator(newCtx(), "gdp_growth", "SYR", { limit: 5 });
  assert.match(
    result.notes.join(" "),
    /publishes no current-edition projections for .*; it ends at 2010/,
    "a series ending before the boundary must still get the heuristic caveat, not silence",
  );
});

// ——— 6. D6: verify_stat demotes to cannot_verify on a DataMapper->DBnomics vintage-crossing fallback ———

test("D6: verify_stat demotes to cannot_verify when the DataMapper primary fails and DBnomics serves a superseded vintage", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes("down", 503) },
    { test: (u) => isDataMapperValuesUrl(u, "GGXWDG_NGDP"), res: () => jsonRes("down", 503) },
    {
      test: (u) => u.includes("api.db.nomics.world") && u.includes("BRB.GGXWDG_NGDP"),
      res: () =>
        jsonRes(
          JSON.stringify({
            provider: { name: "International Monetary Fund" },
            dataset: { code: "WEO:2025-04", name: "World Economic Outlook" },
            series: {
              docs: [
                {
                  "@frequency": "annual",
                  dataset_code: "WEO:2025-04",
                  dataset_name: "World Economic Outlook",
                  provider_code: "IMF",
                  series_code: "BRB.GGXWDG_NGDP.pcent_gdp",
                  series_name: "Barbados general government gross debt",
                  period: ["2023"],
                  value: [115.3],
                },
              ],
            },
          }),
        ),
    },
  );
  const r = await verifyStat(newCtx(), { indicator: "govt_debt_gdp", country: "BRB", period: "2023", claimed_value: 115.3 });
  assert.equal(r.verdict, "cannot_verify");
  assert.equal(r.fallback_used, true);
  assert.match(r.explanation, /primary source was transiently unavailable/);
  assert.match(r.explanation, /vintage revisions/, "the DataMapper->DBnomics case keeps its vintage-specific wording");
  assert.match(r.explanation, /indicative only, not a verification/i);
});

// ——— 6b. Generalized fallback demotion: cross-PROVIDER substitution (WB primary
// fails, IMF DataMapper serves) must also demote — WB and IMF define e.g. the
// current account differently (1.8pp apart for the same country-year in this
// repo's own benchmark logs), so a verdict against the substitute is untrustworthy.

test("generalized demotion: WB-primary indicator served from IMF DataMapper fallback returns cannot_verify, not a verdict", async () => {
  installRoutes(
    { test: (u) => u.includes("api.worldbank.org"), res: () => jsonRes("down", 503) },
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "BCA_NGDPD"),
      res: () => jsonRes(dmValuesBody("BCA_NGDPD", { USA: { "2022": -3.8, "2023": -3.3, "2024": -4.0 } })),
    },
  );
  const r = await verifyStat(newCtx(), { indicator: "current_account_gdp", country: "USA", period: "2023", claimed_value: -3.3 });
  assert.equal(r.verdict, "cannot_verify", "an exact match against the substitute source must still not verify");
  assert.equal(r.fallback_used, true);
  assert.equal(r.official_value, -3.3, "the substitute's value is still reported as indicative");
  assert.match(r.explanation, /primary source was transiently unavailable/);
  assert.match(r.explanation, /indicative only, not a verification/i);
  assert.match(r.explanation, /different statistical definitions/);
});

test("definitive-absence fallback is judged normally with disclosure, not demoted: primary permanently lacks the country", async () => {
  installRoutes(
    {
      // World Bank's own "no rows" shape: a definitive ToolError, not a transient blip.
      test: (u) => u.includes("api.worldbank.org"),
      res: () => jsonRes(JSON.stringify([{ page: 1, pages: 0, total: 0 }, []])),
    },
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "BCA_NGDPD"),
      res: () => jsonRes(dmValuesBody("BCA_NGDPD", { TWN: { "2022": 13.3, "2023": 13.8, "2024": 14.0 } })),
    },
  );
  const r = await verifyStat(newCtx(), { indicator: "current_account_gdp", country: "TWN", period: "2023", claimed_value: 13.8 });
  assert.equal(r.verdict, "match", "the stable de-facto source for a country the primary lacks gets a real verdict");
  assert.equal(r.fallback_used, true, "disclosure stays");
  assert.ok(r.notes.some((n) => /does not have this indicator/.test(n)), "the definitive-absence note stays");
});

// ——— 6c. observation_status / status_method ———

test("observation_status: IMF pre-boundary is estimate_or_actual, post-boundary is projection, both horizon_heuristic", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "GGXWDG_NGDP"),
      res: () =>
        jsonRes(
          dmValuesBody("GGXWDG_NGDP", {
            USA: { "2024": 122.3, "2025": 123.9, "2026": 125.8, "2027": 128.6, "2028": 132.1, "2029": 135.5, "2030": 138.9, "2031": 142.1 },
          }),
        ),
    },
  );
  const pre = await verifyStat(newCtx(), { indicator: "govt_debt_gdp", country: "USA", period: "2025", claimed_value: 123.9 });
  assert.equal(pre.observation_status, "estimate_or_actual", "pre-boundary IMF values must never be presented as confirmed actuals");
  assert.equal(pre.status_method, "horizon_heuristic");
  assert.equal(pre.is_projection, false);
  const post = await verifyStat(newCtx(), { indicator: "govt_debt_gdp", country: "USA", period: "2027", claimed_value: 128.6 });
  assert.equal(post.observation_status, "projection");
  assert.equal(post.is_projection, true);
});

test("observation_status: an arbitrary explicit DBnomics id is 'unknown', never a false 'actual' — the series could be a forecast dataset", async () => {
  installRoutes({
    test: (u) => u.includes("api.db.nomics.world") && u.includes("OECD"),
    res: () =>
      jsonRes(
        JSON.stringify({
          provider: { name: "OECD" },
          dataset: { code: "EO", name: "Economic Outlook" },
          series: {
            docs: [
              {
                "@frequency": "annual",
                dataset_code: "EO",
                dataset_name: "Economic Outlook",
                provider_code: "OECD",
                series_code: "USA.GDPV_ANNPCT",
                series_name: "USA real GDP growth forecast",
                period: ["2027"],
                value: [1.2],
              },
            ],
          },
        }),
      ),
  });
  const r = await verifyStat(newCtx(), { indicator: "dbnomics/OECD/EO/USA.GDPV_ANNPCT", period: "2027", claimed_value: 1.2 });
  assert.equal(r.verdict, "match");
  assert.equal(r.observation_status, "unknown", "unclassified explicit ids must not claim 'actual' — this one is a forecast");
});

test("observation_status: non-IMF (World Bank) matches are actual / as_published; unmatched periods are unknown", async () => {
  installRoutes(
    {
      test: (u) => u.includes("api.worldbank.org"),
      res: () =>
        jsonRes(
          JSON.stringify([
            { page: 1, pages: 1, total: 1, lastupdated: "2026-07-13" },
            [
              {
                indicator: { id: "FP.CPI.TOTL.ZG", value: "Inflation, consumer prices (annual %)" },
                country: { id: "US", value: "United States" },
                countryiso3code: "USA",
                date: "2024",
                value: 2.949,
              },
            ],
          ]),
        ),
    },
  );
  const r = await verifyStat(newCtx(), { indicator: "inflation_cpi", country: "USA", period: "2024", claimed_value: 2.9 });
  assert.equal(r.observation_status, "actual");
  assert.equal(r.status_method, "as_published");
  const miss = await verifyStat(newCtx(), { indicator: "inflation_cpi", country: "USA", period: "1901", claimed_value: 5 });
  assert.equal(miss.verdict, "cannot_verify");
  assert.equal(miss.observation_status, "unknown");
});

// ——— 6d. Snapshot fallback propagation + REST no-store ———

const WB_USA_MULTI = () => {
  const row = (id: string, name: string, date: string, value: number) => ({
    indicator: { id, value: name },
    country: { id: "US", value: "United States" },
    countryiso3code: "USA",
    date,
    value,
  });
  return JSON.stringify([
    { page: 1, pages: 1, total: 2, lastupdated: "2026-07-13" },
    [row("NY.GDP.MKTP.KD.ZG", "GDP growth (annual %)", "2025", 2.16), row("SP.POP.TOTL", "Population, total", "2025", 342000000)],
  ]);
};

test("country_snapshot: a fallback-served debt item sets fallback_used + fallback_indicators; healthy path sets neither", async () => {
  const { countrySnapshot } = await import("../src/core/snapshot.ts");
  // Fallback case: DataMapper down, DBnomics serves debt.
  installRoutes(
    { test: (u) => u.includes("api.worldbank.org") && u.includes(";"), res: () => jsonRes(WB_USA_MULTI()) },
    { test: (u) => u.includes("api.worldbank.org") && u.includes("%3B"), res: () => jsonRes(WB_USA_MULTI()) },
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes("down", 503) },
    { test: (u) => isDataMapperValuesUrl(u, "GGXWDG_NGDP"), res: () => jsonRes("down", 503) },
    { test: (u) => u.includes("api.db.nomics.world") && u.includes("USA.GGXWDG_NGDP"), res: () => jsonRes(DBNOMICS_BRB_DEBT.replace(/BRB/g, "USA").replace("Barbados", "United States")) },
  );
  const snap = await countrySnapshot(newCtx(), "USA");
  assert.equal(snap.fallback_used, true);
  assert.deepEqual(snap.fallback_indicators, ["govt_debt_gdp"]);

  // Healthy case: DataMapper serves debt directly — no flag at all.
  installRoutes(
    { test: (u) => u.includes("api.worldbank.org") && (u.includes(";") || u.includes("%3B")), res: () => jsonRes(WB_USA_MULTI()) },
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "GGXWDG_NGDP"),
      res: () => jsonRes(dmValuesBody("GGXWDG_NGDP", { USA: { "2024": 122.3, "2025": 123.9, "2026": 125.8, "2031": 142.1 } })),
    },
  );
  const healthy = await countrySnapshot(newCtx(), "USA");
  assert.equal(healthy.fallback_used, undefined, "healthy snapshots must not carry the flag");
  assert.equal(healthy.fallback_indicators, undefined);
});

test("REST /v1/snapshot: no-store when any item was fallback-sourced, public cache otherwise", async () => {
  const { handleRequest } = await import("../src/index.ts");
  const env = {
    ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
    BASE_URL: "https://statcite.test",
  };
  // Fallback case.
  installRoutes(
    { test: (u) => u.includes("api.worldbank.org") && (u.includes(";") || u.includes("%3B")), res: () => jsonRes(WB_USA_MULTI()) },
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes("down", 503) },
    { test: (u) => isDataMapperValuesUrl(u, "GGXWDG_NGDP"), res: () => jsonRes("down", 503) },
    { test: (u) => u.includes("api.db.nomics.world") && u.includes("USA.GGXWDG_NGDP"), res: () => jsonRes(DBNOMICS_BRB_DEBT.replace(/BRB/g, "USA").replace("Barbados", "United States")) },
  );
  const res = await handleRequest(new Request("https://statcite.test/v1/snapshot/USA"), env as never);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/, "fallback-sourced snapshots must not be publicly cached");

  // Healthy case.
  installRoutes(
    { test: (u) => u.includes("api.worldbank.org") && (u.includes(";") || u.includes("%3B")), res: () => jsonRes(WB_USA_MULTI()) },
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    {
      test: (u) => isDataMapperValuesUrl(u, "GGXWDG_NGDP"),
      res: () => jsonRes(dmValuesBody("GGXWDG_NGDP", { USA: { "2024": 122.3, "2025": 123.9, "2026": 125.8, "2031": 142.1 } })),
    },
  );
  const ok = await handleRequest(new Request("https://statcite.test/v1/snapshot/USA"), env as never);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control") ?? "", /max-age/, "healthy snapshots stay cacheable");
});

// ——— 7. imf/{CODE} explicit series id round-trips through get_series ———

test("get_series: imf/{CODE} round-trips a DataMapper-sourced citation's own series_id", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(APRIL_2026_META) },
    { test: (u) => isDataMapperValuesUrl(u, "NGDP_RPCH"), res: () => jsonRes(dmValuesBody("NGDP_RPCH", { USA: { "2024": 2.8 } })) },
  );
  const result = await getSeries(newCtx(), "imf/NGDP_RPCH", { country: "USA" });
  assert.equal(result.series_id, "imf/NGDP_RPCH");
  const obs = result.observations.find((o) => o.period === "2024");
  assert.equal(obs?.value, 2.8);
});

test("get_series: an unrecognized imf/ code is a helpful ToolError, and a missing country is a helpful ToolError", async () => {
  await assert.rejects(() => getSeries(newCtx(), "imf/NOT_A_CODE", { country: "USA" }), /Unrecognized IMF DataMapper code/);
  await assert.rejects(() => getSeries(newCtx(), "imf/NGDP_RPCH", {}), /require a 'country' parameter/);
});

// ——— 8. Subrequest budget under a DataMapper outage (design D7/F1) ———
// Without the per-Ctx rejection-memoizing memo, 15 concurrent claims against the
// same DataMapper-backed indicator would each independently run the full 3-attempt
// retry schedule (45 DataMapper subrequests) before falling through to DBnomics
// (another 15). The memo collapses the DataMapper cost to one shared attempt-series
// regardless of how many claims/concurrency the batch uses.

const DBNOMICS_BRB_DEBT = JSON.stringify({
  provider: { name: "International Monetary Fund" },
  dataset: { code: "WEO:2025-04", name: "World Economic Outlook" },
  series: {
    docs: [
      {
        "@frequency": "annual",
        dataset_code: "WEO:2025-04",
        dataset_name: "World Economic Outlook",
        provider_code: "IMF",
        series_code: "BRB.GGXWDG_NGDP.pcent_gdp",
        series_name: "Barbados general government gross debt",
        period: ["2024"],
        value: [105.9],
      },
    ],
  },
});

test("budget: 15 concurrent claims against one DataMapper-down indicator share one retry series, staying well under the 50-subrequest cap", async () => {
  installRoutes(
    { test: (u) => isDataMapperMetadataUrl(u), res: () => jsonRes(JSON.stringify({ api: { version: "1" } })) },
    { test: (u) => isDataMapperValuesUrl(u, "GGXWDG_NGDP"), res: () => jsonRes(JSON.stringify({ api: { version: "1" } })) },
    { test: (u) => u.includes("api.db.nomics.world") && u.includes("BRB.GGXWDG_NGDP"), res: () => jsonRes(DBNOMICS_BRB_DEBT) },
  );
  const ctx = newCtx();
  const claims = Array.from({ length: 15 }, () => ({ indicator: "govt_debt_gdp", country: "BRB", period: "2024", claimed_value: 105.9 }));
  const result = await runVerifyClaims(ctx, claims);
  assert.equal(result.summary.error, 0, JSON.stringify(result.summary));
  // D6: DataMapper down -> DBnomics-served is a vintage-crossing fallback, so
  // every claim demotes to cannot_verify rather than a match/mismatch verdict
  // against a superseded vintage.
  assert.equal(result.summary.cannot_verify, 15, JSON.stringify(result.summary));
  assert.ok(result.results.every((r) => r.ok && r.verification.fallback_used === true));
  assert.ok(callLog.length < 50, `expected < 50 total subrequests, got ${callLog.length}`);
  // The specific claim this design makes: DataMapper's own attempt-series (values
  // shape failures, retried) is shared across all 15 claims, not run 15 times.
  const dmValuesCalls = callLog.filter((u) => isDataMapperValuesUrl(u, "GGXWDG_NGDP")).length;
  assert.ok(dmValuesCalls <= 3, `expected the memo to cap DataMapper values attempts at 3 total, got ${dmValuesCalls}`);
});

// ——— 9. Percent-kind detection for explicit ids must not hang on upstream free text ———
// The unit field is absent on the DBnomics path, so before the series-id-aware
// fix the tolerance model was chosen by regexing the provider's series NAME:
// "…– Percent of GDP" armed percentage-point bands while an upstream rename to
// "…general government gross debt" silently flipped the same numbers to
// relative bands — match became mismatch with no data change. The WEO series
// code suffix (.pcent_gdp) is the stable signal.
test("verify explicit dbnomics WEO id: percent-kind bands arm from the series CODE even when the name lacks a percent token", async () => {
  installRoutes({
    test: (u) => u.includes("api.db.nomics.world") && u.includes("BRB.GGXWDG_NGDP"),
    res: () =>
      jsonRes(
        JSON.stringify({
          provider: { name: "International Monetary Fund" },
          dataset: { code: "WEO:2025-04", name: "World Economic Outlook" },
          series: {
            docs: [
              {
                "@frequency": "annual",
                dataset_code: "WEO:2025-04",
                dataset_name: "World Economic Outlook",
                provider_code: "IMF",
                series_code: "BRB.GGXWDG_NGDP.pcent_gdp",
                series_name: "Barbados general government gross debt",
                period: ["2015"],
                value: [0.1],
              },
            ],
          },
        }),
      ),
  });
  const r = await verifyStat(newCtx(), {
    indicator: "dbnomics/IMF/WEO:2025-04/BRB.GGXWDG_NGDP.pcent_gdp",
    period: "2015",
    claimed_value: 0.15,
  });
  // 0.15 vs 0.1: 0.05pp is within the percentage-point close/match band; under
  // relative bands it is a 50% difference and would wrongly read as mismatch.
  assert.equal(r.verdict, "match", r.explanation);
  assert.match(r.explanation, /pp is within normal rounding|difference of 0\.050 pp/i);
});
