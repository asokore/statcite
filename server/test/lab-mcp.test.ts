// Lab routes: /lab/mcp (lab tools only) and /all/mcp (core tools plus lab).
//
// What these tests hold, each one a property a mutation run has to break:
//   - /mcp is byte-identical to the capture taken before the lab routes existed
//     (tools/list, initialize, GET descriptor), so no lab tool can leak onto it.
//   - revision_records gives every value its own citation, naming the edition.
//   - every record's source resolves to a sources block carrying the licence,
//     printed once per source, and lab citations match the core builders.
//   - an edition the archive lacks stays missing, never filled from a neighbour,
//     and the newest calendar edition says only what StatCite knows of it.
//   - some economies and every aggregate are refused on every lab tool and on
//     both lab routes, by code and by name, before any upstream call.
//   - method_rules returns its text with citations.
//   - a batch cannot push revision_records past the per-request work budget.
//   - /lab/mcp serves no core resources.
// Self-contained fetch stub, in the style of imf-vintage.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";
import { IMF_VINTAGE_FLOWS, dbnomicsCodeForEdition, imfVintageCitation } from "../src/core/series.ts";
import { TOOLS } from "../src/tools.ts";
import { LAB_TOOLS } from "../src/lab-tools.ts";
import { weoEditionsBetween, assertLabArgsCovered, isLabExcluded, API_URL_FROM_SOURCE_URL, newestEditionDetail, datasetWithEditionInWords } from "../src/core/lab.ts";
import { IMF_LICENSE, dbnomicsCitation } from "../src/core/citations.ts";
import { dbnomicsSeriesApiUrl } from "../src/adapters/dbnomics.ts";
import { expectedWeoEdition } from "../src/core/weo-calendar.ts";
import { resolveCountry } from "../src/core/countries.ts";

const env: Env = {
  ASSETS: { fetch: async () => new Response("site") },
  BASE_URL: "https://statcite.test",
} as unknown as Env;

// --- Upstream stub ---

/** Distinct value per edition for 2023, so a filled gap is detectable. */
function editionValue(edition: string): number {
  const [y, m] = edition.split("-").map(Number);
  return Math.round(((y - 2000) * 0.1 + (m === 10 ? 0.05 : 0)) * 1000) / 1000;
}

/** Editions the stubbed DBnomics archive lacks, beyond its real gap. */
let dbnAbsent = new Set<string>(["2011-10"]);
let calls: string[] = [];

/** Fiscal subject codes the pre-2010 DBnomics editions do not carry (checked
 * live 2026-11-28: those editions file gross debt as GGD_NGDP). */
const PRE_2010_ABSENT = /\.(GGXWDG_NGDP|GGXCNL_NGDP|GGR_NGDP|GGX_NGDP)\.pcent_gdp$/;

function dbnomicsMultiBody(url: string): string {
  const params = new URL(url).searchParams;
  const ids = (params.get("series_ids") ?? "").split(",").filter(Boolean);
  const docs: unknown[] = [];
  const errors: unknown[] = [];
  const datasets: Record<string, unknown> = {};
  for (const id of ids) {
    const [provider, dataset, series] = id.split("/");
    const edition = dataset.replace(/^WEO:/, "");
    if (dbnAbsent.has(edition)) {
      errors.push({ cause: 'Could not load "dataset.json"', dataset_code: dataset, message: "Could not load dataset", provider_code: provider, series_code: null });
      continue;
    }
    if (edition < "2010-04" && PRE_2010_ABSENT.test(series)) {
      errors.push({ dataset_code: dataset, message: "Could not load series", provider_code: provider, series_code: series });
      continue;
    }
    // The names DBnomics gives (live 2026-11-28): "WEO by countries
    // (2008-04 release)" up to WEO:2021-10, and the generic "World Economic
    // Outlook by countries" from WEO:2022-04. Neither names the edition in
    // words, so a citation that relies on the dataset name alone fails the
    // edition-in-words check.
    const name = edition < "2022-04" ? `WEO by countries (${edition} release)` : "World Economic Outlook by countries";
    datasets[`${provider}/${dataset}`] = { code: dataset, name };
    docs.push({
      "@frequency": "annual",
      provider_code: provider,
      dataset_code: dataset,
      dataset_name: name,
      series_code: series,
      series_name: `${series.split(".")[0]} – Gross domestic product, constant prices`,
      period: ["2022", "2023", "2024"],
      value: [1.5, editionValue(edition), "NA"],
    });
  }
  // metadata=false drops the datasets and providers blocks, as it does live.
  const meta = params.get("metadata") !== "false";
  return JSON.stringify({
    _meta: { version: "22.1.17" },
    ...(meta ? { datasets } : {}),
    errors,
    ...(meta ? { providers: { IMF: { code: "IMF", name: "International Monetary Fund" } } } : {}),
    series: { docs, limit: 1000, num_found: docs.length, offset: 0 },
  });
}

/** IMF SDMX 3.0 vintage body with the dimension-group attributes the real
 * payload carries under attributes=all (verified live 2026-11-28). */
function imfVintageBody(flow: string): string {
  const april = flow.includes("2026_APR");
  const groupDefs = Array.from({ length: 26 }, (_, i) => ({ id: `ATTR_${i}` }));
  groupDefs[23] = { id: "LATEST_ACTUAL_ANNUAL_DATA" };
  groupDefs[25] = { id: "BASE_YEAR" };
  const groupValues: unknown[] = Array(26).fill(null);
  groupValues[23] = [april ? "2025" : "2024"];
  groupValues[25] = [april ? "2017" : "2012"];
  // Other dimension groups come first, each with its own values, so a reader
  // that takes the first entry holding a value reads the wrong series. The
  // live payload carries an INDICATOR-only group (":0::") beside "0:0::".
  const indicatorOnly: unknown[] = Array(26).fill(null);
  indicatorOnly[23] = ["1999"];
  indicatorOnly[25] = ["1990"];
  const otherCountry: unknown[] = Array(26).fill(null);
  otherCountry[23] = ["2001"];
  otherCountry[25] = ["2000"];
  return JSON.stringify({
    meta: {},
    data: {
      dataSets: [
        {
          structure: 0,
          action: "Replace",
          series: { "0:0:0": { attributes: [0, 0, 0, "3/30/2026"], observations: { "0": ["1.9"], "1": [april ? "2.934535" : "2.935"], "2": ["2.8"] } } },
          dimensionGroupAttributes: { ":0::": indicatorOnly, "1:0::": otherCountry, "0:0::": groupValues },
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
            observation: [{ id: "TIME_PERIOD", keyPosition: 3, values: [{ value: "2022" }, { value: "2023" }, { value: "2024" }] }],
          },
          attributes: { dimensionGroup: groupDefs, series: [], observation: [] },
          measures: { observation: [{ id: "OBS_VALUE" }] },
        },
      ],
    },
  });
}

function installStub(): void {
  _clearMemCache();
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.includes("api.db.nomics.world/v22/series?")) {
      return new Response(dbnomicsMultiBody(url), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("api.imf.org")) {
      const flow = Object.values(IMF_VINTAGE_FLOWS).find((f) => url.includes(f)) ?? "";
      return new Response(imfVintageBody(flow), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "unstubbed " + url }), { status: 599 });
  }) as typeof fetch;
}

async function rpc(path: string, body: unknown): Promise<{ status: number; text: string; json: any }> {
  const res = await handleRequest(
    new Request(`https://statcite.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(body),
    }),
    env,
  );
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
}

async function tool(path: string, name: string, args: Record<string, unknown>): Promise<{ payload: any; isError: boolean; rpc: any }> {
  const r = await rpc(path, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } });
  const t = r.json?.result?.content?.[0]?.text;
  return { payload: t ? JSON.parse(t) : undefined, isError: Boolean(r.json?.result?.isError), rpc: r.json };
}

async function toolNames(path: string): Promise<string[]> {
  const r = await rpc(path, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  return r.json.result.tools.map((t: { name: string }) => t.name);
}

const LAB_ROUTES = ["/lab/mcp", "/all/mcp"];
const CORE_NAMES = TOOLS.map((t) => t.name);

// --- /mcp unchanged ---

const capture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/mcp-main-surface.json", import.meta.url)), "utf8"),
) as { tools_list_response: string; initialize_response: string; get_status: number; get_body: string };

test("/mcp tools/list is byte-identical to the capture taken before the lab routes", async () => {
  installStub();
  const r = await rpc("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.equal(r.text, capture.tools_list_response);
  assert.equal(r.json.result.tools.length, 12);
  for (const n of ["revision_records", "method_rules"]) assert.ok(!r.text.includes(n), `${n} leaked onto /mcp`);
});

test("/mcp initialize (instructions and server info) is byte-identical to the capture", async () => {
  const r = await rpc("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
  assert.equal(r.text, capture.initialize_response);
});

test("/mcp GET descriptor is byte-identical to the capture", async () => {
  const res = await handleRequest(new Request("https://statcite.test/mcp", { method: "GET" }), env);
  assert.equal(res.status, capture.get_status);
  assert.equal(await res.text(), capture.get_body);
});

test("/mcp does not serve the lab tools", async () => {
  installStub();
  const r = await rpc("/mcp", {
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "revision_records", arguments: { indicator: "gdp_growth", country: "USA", year: "2023" } },
  });
  assert.equal(r.json.error?.code, -32602, r.text);
  assert.equal(calls.length, 0, "an unknown tool on /mcp must reach no upstream");
});

// --- Lab and combined routes ---

test("/lab/mcp lists only the lab tools, /all/mcp lists the 12 core tools plus the lab tools", async () => {
  assert.deepEqual(await toolNames("/lab/mcp"), ["revision_records", "method_rules"]);
  assert.deepEqual(await toolNames("/all/mcp"), [...CORE_NAMES, "revision_records", "method_rules"]);
  assert.equal(CORE_NAMES.length, 12);
});

test("each route has its own instructions, server name and GET description", async () => {
  const seen = new Map<string, { instructions: string; name: string; get: string }>();
  for (const path of ["/mcp", "/lab/mcp", "/all/mcp"]) {
    const init = await rpc(path, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
    const res = await handleRequest(new Request(`https://statcite.test${path}`, { method: "GET" }), env);
    assert.equal(res.status, 405);
    seen.set(path, { instructions: init.json.result.instructions, name: init.json.result.serverInfo.name, get: await res.text() });
  }
  const [main, lab, all] = ["/mcp", "/lab/mcp", "/all/mcp"].map((p) => seen.get(p)!);
  assert.equal(new Set([main.instructions, lab.instructions, all.instructions]).size, 3);
  assert.equal(new Set([main.name, lab.name, all.name]).size, 3);
  assert.equal(new Set([main.get, lab.get, all.get]).size, 3);
  assert.match(lab.instructions, /revision_records/);
  assert.ok(!/verify_claims/.test(lab.instructions), "lab instructions must not direct clients to tools the route does not serve");
  assert.ok(all.instructions.startsWith(main.instructions), "/all/mcp keeps the core instructions and adds the lab paragraph");
  assert.match(JSON.parse(lab.get).mcp.name, /statcite-lab/);
  // Public text names no excluded jurisdiction and gives no reason.
  for (const t of [lab.instructions, lab.get, all.get, all.instructions.slice(main.instructions.length)]) {
    assert.ok(!/barbad/i.test(t), `public lab text names an excluded jurisdiction: ${t}`);
    assert.match(t, /not covered by the lab tools/);
  }
});

test("modern-era results on /lab/mcp carry the lab identity in _meta", async () => {
  const res = await handleRequest(
    new Request("https://statcite.test/lab/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } }),
    }),
    env,
  );
  const j: any = await res.json();
  assert.equal(j.result._meta["io.modelcontextprotocol/serverInfo"].name, "statcite-lab");
});

// --- revision_records ---

for (const path of LAB_ROUTES) {
  test(`${path} revision_records: one citation per value, each naming its edition`, async () => {
    installStub();
    dbnAbsent = new Set(["2011-10"]);
    const { payload, isError } = await tool(path, "revision_records", { indicator: "gdp_growth", country: "USA", year: "2023" });
    assert.equal(isError, false, JSON.stringify(payload));
    const values = payload.records.filter((r: any) => r.status === "value");
    assert.ok(values.length >= 30, `expected most editions to carry a value, got ${values.length}`);
    const ids = new Set<string>();
    for (const r of values) {
      assert.equal(typeof r.value, "number");
      assert.ok(r.citation, `edition ${r.edition} has a value without a citation`);
      assert.match(r.citation.retrieved_at, /^\d{4}-\d{2}-\d{2}/);
      assert.match(r.citation.citation_text, /\S/);
      const ed = r.edition;
      const named = r.citation.series_id.includes(`WEO:${ed}/`) ||
        r.citation.series_id.includes(IMF_VINTAGE_FLOWS[ed]?.split("/")[1] ?? "never");
      assert.ok(named, `citation for ${ed} does not name its edition: ${r.citation.series_id}`);
      // The edition in words in the sentence a reader pastes, even where the
      // upstream dataset name is the generic one.
      const [y, m] = ed.split("-");
      const words = `${m === "04" ? "April" : "October"} ${y}`;
      assert.ok(r.citation.citation_text.includes(words), `citation_text for ${ed} does not name "${words}": ${r.citation.citation_text}`);
      // Each citation points at its own edition, never at the shared request.
      assert.ok(!/series_ids=/.test(JSON.stringify(r.citation)), `citation for ${ed} carries the shared multi-series URL`);
      assert.ok(r.citation.source_url.length < 300, `citation source_url for ${ed} is ${r.citation.source_url.length} characters`);
      assert.ok(r.citation.source_url.includes(encodeURIComponent(ed)) || r.citation.source_url.includes(IMF_VINTAGE_FLOWS[ed] ?? "never"), `source_url for ${ed} is not its own: ${r.citation.source_url}`);
      // What is the same for every value lives in the sources block, once.
      for (const k of ["export_formats", "license", "attribution", "api_url", "source", "series_name"]) {
        assert.equal(r.citation[k], undefined, `citation for ${ed} still carries ${k}`);
      }
      // The edition is stated once in the dataset name, in words.
      assert.doesNotMatch(r.citation.dataset, /\d{4}-\d{2} release/, `dataset for ${ed} states the edition twice: ${r.citation.dataset}`);
      ids.add(r.citation.series_id);
    }
    assert.equal(ids.size, values.length, "each value must carry its own citation, not a shared one");
    // The DBnomics request asks for no dataset metadata, the bulk of the body.
    const dbnCall = calls.find((u) => u.includes("api.db.nomics.world")) ?? "";
    assert.match(dbnCall, /[?&]metadata=false(&|$)/, dbnCall);
    assert.equal(payload.editions_with_value, values.length);
    // The value is the one that edition published, not a neighbour's.
    const e2019 = payload.records.find((r: any) => r.edition === "2019-04");
    assert.equal(e2019.value, editionValue("2019-04"));
    const e2026 = payload.records.find((r: any) => r.edition === "2026-04");
    assert.equal(e2026.value, 2.934535);
    assert.equal(e2026.source, "imf_dated_vintage");
    // A handful of upstream calls: one DBnomics request plus one per IMF vintage.
    assert.equal(calls.length, 1 + Object.keys(IMF_VINTAGE_FLOWS).length, JSON.stringify(calls));
  });

  test(`${path} revision_records: every record's source resolves to a block that carries the licence`, async () => {
    installStub();
    dbnAbsent = new Set(["2011-10"]);
    const { payload, isError, rpc: raw } = await tool(path, "revision_records", { indicator: "gdp_growth", country: "USA", year: "2023" });
    assert.equal(isError, false, JSON.stringify(payload));
    assert.deepEqual(raw.result.structuredContent, payload, "structuredContent and the text copy must agree");
    const keys = Object.keys(payload.sources).sort();
    assert.deepEqual(keys, ["dbnomics_dated_edition", "imf_dated_vintage"]);
    for (const rec of payload.records) {
      const block = payload.sources[rec.source];
      assert.ok(block, `record ${rec.edition} names source '${rec.source}', which has no block`);
      assert.equal(block.license, IMF_LICENSE, `the ${rec.source} block does not carry the IMF licence`);
      assert.equal(block.publisher, "International Monetary Fund");
      assert.match(block.terms_url, /^https:\/\/www\.imf\.org\//);
      assert.equal(block.attribution_format, "Source: International Monetary Fund, <database name>, <link to the dataset>");
    }
    // The licence is printed once per source, never per value.
    const text = JSON.stringify(payload);
    assert.equal(text.split(IMF_LICENSE.slice(0, 60)).length - 1, keys.length, "the licence appears more often than once per source block");
    for (const rec of payload.records.filter((r: any) => r.status === "value")) {
      const block = payload.sources[rec.source];
      // Filling the block's attribution format with the citation's own fields
      // gives the attribution the core builders write for the same value.
      const filled = block.attribution_format.replace("<database name>", rec.citation.dataset).replace("<link to the dataset>", rec.citation.source_url);
      assert.equal(filled, `Source: International Monetary Fund, ${rec.citation.dataset}, ${rec.citation.source_url}`);
      // The block's api_url_rule rebuilds the API call for the value.
      const api = API_URL_FROM_SOURCE_URL[rec.source as keyof typeof API_URL_FROM_SOURCE_URL](rec.citation.source_url);
      if (rec.source === "dbnomics_dated_edition") {
        const [provider, dataset, series] = rec.citation.series_id.split("/");
        assert.equal(api, dbnomicsSeriesApiUrl(provider, dataset, series), `dbnomics api_url_rule fails for ${rec.edition}`);
      } else {
        assert.ok(calls.includes(api), `imf api_url_rule gives ${api}, which was never called`);
      }
    }
  });

  test(`${path} revision_records: lab citations match the core builders field for field`, async () => {
    installStub();
    dbnAbsent = new Set(["2011-10"]);
    const { payload } = await tool(path, "revision_records", { indicator: "gdp_growth", country: "USA", year: "2023" });
    const ctx = { now: () => new Date(`${payload.records.find((r: any) => r.citation).citation.retrieved_at}T12:00:00Z`) } as any;
    const seriesName = `${payload.label}, ${payload.country.name}`;
    const fields = ["dataset", "series_id", "source_url", "retrieved_at", "citation_text"] as const;
    for (const rec of payload.records.filter((r: any) => r.status === "value")) {
      const core =
        rec.source === "dbnomics_dated_edition"
          ? (() => {
              const [providerCode, datasetCode, seriesCode] = rec.citation.series_id.split("/");
              return dbnomicsCitation(ctx, { providerName: "International Monetary Fund", providerCode, datasetCode, datasetName: rec.citation.dataset, seriesCode, seriesName });
            })()
          : imfVintageCitation(ctx, { flow: IMF_VINTAGE_FLOWS[rec.edition], key: "USA.NGDP_RPCH.A", seriesName, apiUrl: "" });
      for (const f of fields) assert.equal(rec.citation[f], core[f], `${rec.edition} ${f} differs from the core builder`);
      assert.equal(payload.sources[rec.source].license, core.license, `${rec.edition}: the block licence differs from the core builder's`);
    }
  });

  test(`${path} revision_records: a missing edition stays missing`, async () => {
    installStub();
    dbnAbsent = new Set(["2011-10", "2016-04"]);
    const { payload, isError } = await tool(path, "revision_records", { indicator: "gdp_growth", country: "USA", year: "2023" });
    assert.equal(isError, false, JSON.stringify(payload));
    for (const ed of ["2011-10", "2016-04"]) {
      const r = payload.records.find((x: any) => x.edition === ed);
      assert.ok(r, `${ed} must be listed, not skipped`);
      assert.equal(r.status, "missing");
      assert.equal(r.value, null, `${ed} was filled`);
      assert.equal(r.citation, undefined);
      assert.equal(r.missing_reason, "not_in_archive");
    }
    // Neighbours keep their own values.
    assert.equal(payload.records.find((x: any) => x.edition === "2015-10").value, editionValue("2015-10"));
    assert.equal(payload.records.find((x: any) => x.edition === "2016-10").value, editionValue("2016-10"));
    // An edition before the newest keeps DBnomics's own report, with no
    // current-edition wording.
    assert.equal(payload.records.find((x: any) => x.edition === "2016-04").missing_detail, "DBnomics reported for WEO:2016-04: Could not load dataset");
    dbnAbsent = new Set(["2011-10"]);
  });

  test(`${path} revision_records: the newest calendar edition, when missing, says what StatCite knows and no more`, async () => {
    installStub();
    const newest = expectedWeoEdition(new Date());
    dbnAbsent = new Set(["2011-10", newest]);
    const { payload, isError } = await tool(path, "revision_records", { indicator: "gdp_growth", country: "USA", year: "2023" });
    assert.equal(isError, false, JSON.stringify(payload));
    const r = payload.records.at(-1);
    assert.equal(r.edition, newest, "the newest calendar edition must be the last record");
    assert.equal(r.status, "missing");
    assert.equal(r.value, null);
    assert.equal(r.missing_reason, "not_in_archive");
    const [y, m] = newest.split("-");
    assert.ok(r.missing_detail.includes(`${m === "04" ? "April" : "October"} ${y} edition`), r.missing_detail);
    assert.match(r.missing_detail, /is the current edition/);
    assert.match(r.missing_detail, /StatCite has no dated vintage for it yet/);
    assert.match(r.missing_detail, /DBnomics has not loaded it/);
    // Nothing about the IMF's own release of it, either way.
    assert.doesNotMatch(r.missing_detail, /publish|released|IMF has|not yet out/i, r.missing_detail);
    // The older gap keeps its plain wording.
    assert.doesNotMatch(payload.records.find((x: any) => x.edition === "2011-10").missing_detail, /current edition/);
    dbnAbsent = new Set(["2011-10"]);
  });
}

test("the newest-edition detail says DBnomics has not loaded it only when DBnomics reports the dataset unloadable", () => {
  const loaded = newestEditionDetail("2026-10", "Could not load series", "DBnomics reported for WEO:2026-10: Could not load series");
  assert.match(loaded, /^2026-10 \(October 2026 edition\) is the current edition/);
  assert.match(loaded, /StatCite has no dated vintage for it yet\./);
  assert.doesNotMatch(loaded, /has not loaded/);
  const none = newestEditionDetail("2026-10", undefined, "DBnomics holds no series USA.X in WEO:2026-10.");
  assert.doesNotMatch(none, /has not loaded/);
  assert.match(newestEditionDetail("2026-10", "Could not load dataset", "r"), /DBnomics has not loaded it\. r$/);
});

test("the dataset name states the edition once, in words", () => {
  assert.equal(datasetWithEditionInWords("WEO by countries (2019-04 release)", "2019-04"), "WEO by countries, April 2019 edition");
  assert.equal(datasetWithEditionInWords("World Economic Outlook by countries", "2024-10"), "World Economic Outlook by countries, October 2024 edition");
  // A parenthetical naming another edition is DBnomics's text and stays.
  assert.equal(datasetWithEditionInWords("WEO by countries (2019-10 release)", "2019-04"), "WEO by countries (2019-10 release), April 2019 edition");
});

test("the revision_records outputSchema requires a licence on every source block and a source on every record", () => {
  const schema: any = LAB_TOOLS.find((t) => t.name === "revision_records")!.outputSchema;
  assert.ok(schema.required.includes("sources"));
  assert.ok(schema.properties.sources.additionalProperties.required.includes("license"));
  assert.ok(schema.properties.records.items.required.includes("source"));
  assert.deepEqual(schema.properties.records.items.properties.source.enum.sort(), ["dbnomics_dated_edition", "imf_dated_vintage"]);
  assert.ok(!schema.properties.records.items.properties.citation.required.includes("license"), "the licence moved to the sources block");
});

test("revision_records carries BASE_YEAR and LATEST_ACTUAL_ANNUAL_DATA from the IMF vintage and flags a base-year change", async () => {
  installStub();
  const { payload } = await tool("/lab/mcp", "revision_records", { indicator: "gdp_growth", country: "USA", year: "2023" });
  const oct = payload.records.find((r: any) => r.edition === "2025-10");
  const apr = payload.records.find((r: any) => r.edition === "2026-04");
  assert.equal(oct.base_year, "2012");
  assert.equal(oct.latest_actual_annual_data, "2024");
  assert.equal(oct.period_status, "actual");
  assert.equal(oct.period_status_basis, "imf_latest_actual_annual_data");
  assert.equal(apr.base_year, "2017");
  assert.equal(apr.base_year_compared_with, "2025-10");
  assert.equal(apr.base_year_changed, true);
  // DBnomics editions state no base year, so nothing is flagged or inferred.
  const old = payload.records.find((r: any) => r.edition === "2019-04");
  assert.equal(old.base_year, undefined);
  assert.equal(old.base_year_changed, undefined);
  assert.equal(old.period_status_basis, "edition_year_heuristic");
  assert.ok(calls.filter((u) => u.includes("api.imf.org")).every((u) => u.includes("attributes=all")));
});

test("revision_records uses the pre-2010 DBnomics unit for growth editions before 2010-04", async () => {
  installStub();
  await tool("/lab/mcp", "revision_records", { indicator: "gdp_growth", country: "USA", year: "2008" });
  const dbn = decodeURIComponent(calls.find((u) => u.includes("api.db.nomics.world")) ?? "");
  assert.match(dbn, /IMF\/WEO:2008-04\/USA\.NGDP_RPCH\.annual_pcent_change/);
  assert.match(dbn, /IMF\/WEO:2010-04\/USA\.NGDP_RPCH\.pcent_change/);
  assert.equal(dbnomicsCodeForEdition("{ISO3}.NGDP_RPCH.pcent_change", "2009-10"), "{ISO3}.NGDP_RPCH.annual_pcent_change");
  assert.equal(dbnomicsCodeForEdition("{ISO3}.NGDP_RPCH.pcent_change", "2010-04"), "{ISO3}.NGDP_RPCH.pcent_change");
  assert.equal(dbnomicsCodeForEdition("{ISO3}.GGXWDG_NGDP.pcent_gdp", "2008-04"), "{ISO3}.GGXWDG_NGDP.pcent_gdp");
});

test("a pre-2010 fiscal edition is listed as an unmapped older subject code, never as an absence", async () => {
  installStub();
  const { payload, isError } = await tool("/lab/mcp", "revision_records", { indicator: "govt_debt_gdp", country: "USA", year: "2023" });
  assert.equal(isError, false, JSON.stringify(payload));
  for (const ed of ["2008-04", "2008-10", "2009-04", "2009-10"]) {
    const r = payload.records.find((x: any) => x.edition === ed);
    assert.equal(r.status, "missing");
    assert.equal(r.value, null);
    assert.equal(r.missing_reason, "subject_code_not_mapped", `${ed}: ${JSON.stringify(r)}`);
    assert.match(r.missing_detail, /older subject code GGD_NGDP/);
    assert.match(r.missing_detail, /not a claim that the edition lacks the figure/);
    assert.doesNotMatch(r.missing_detail, /holds no series|Could not load/);
  }
  // 2010-04 onward reads the mapped code as before.
  assert.equal(payload.records.find((x: any) => x.edition === "2010-04").status, "value");
});

test("revision_records is restricted to the as_of-capable indicators", async () => {
  installStub();
  const { payload, isError } = await tool("/lab/mcp", "revision_records", { indicator: "inflation_cpi", country: "USA", year: "2023" });
  assert.equal(isError, true);
  assert.match(payload.error, /covers only the indicators with dated WEO editions/);
  assert.equal(calls.length, 0);
});

test("the IMF vintage map carries the April 2026 edition beside October 2025", () => {
  assert.equal(IMF_VINTAGE_FLOWS["2025-10"], "IMF.RES/WEO_2025_OCT_VINTAGE/1.0.0");
  assert.equal(IMF_VINTAGE_FLOWS["2026-04"], "IMF.RES/WEO_2026_APR_VINTAGE/1.0.0");
  assert.deepEqual(weoEditionsBetween("2010-10", "2011-10"), ["2010-10", "2011-04", "2011-10"]);
});

// --- Coverage refusals ---

/** Misspellings the text scan does not catch but the country resolver
 * fuzzy-matches to an excluded economy. Only the resolved-ISO3 backstop in
 * labCountry refuses these, so they are what keeps that backstop tested. */
const FUZZY_ONLY_INPUTS = ["Babados", "Barbdos", "Brabados", "Brbados"];

const REFUSED_INPUTS = ["BRB", "BB", "brb", "Barbados", "barbados", "BARBADOS", "Barbadoss", ...FUZZY_ONLY_INPUTS, "LCN", "Latin America & Caribbean", "World", "XYZ"];

test("the fuzzy-only inputs really do pass the text scan and resolve to an excluded economy", () => {
  // If either half stops holding, these inputs no longer exercise the
  // backstop and the refusal tests below would pass without it.
  for (const s of FUZZY_ONLY_INPUTS) {
    assert.doesNotThrow(() => assertLabArgsCovered({ country: s }), `${s} is caught by the text scan, so it does not test the backstop`);
    assert.equal(resolveCountry(s)?.iso3, "BRB", `${s} no longer resolves to the excluded economy`);
  }
});

for (const path of LAB_ROUTES) {
  for (const country of REFUSED_INPUTS) {
    test(`${path} revision_records refuses '${country}' before any upstream call`, async () => {
      installStub();
      const { payload, isError } = await tool(path, "revision_records", { indicator: "gdp_growth", country, year: "2023" });
      assert.equal(isError, true, JSON.stringify(payload));
      assert.equal(payload.details?.not_covered, true, JSON.stringify(payload));
      assert.equal(payload.code, "invalid_request");
      assert.equal(calls.length, 0, `refusal reached upstream: ${JSON.stringify(calls)}`);
      // Neutral: the message states no reason and names nobody.
      assert.ok(!/barbad/i.test(payload.error));
    });
  }

  test(`${path} method_rules refuses an excluded jurisdiction in any argument`, async () => {
    installStub();
    for (const rule of ["BRB", "Barbados"]) {
      const { payload, isError } = await tool(path, "method_rules", { rule });
      assert.equal(isError, true);
      assert.equal(payload.details?.not_covered, true, JSON.stringify(payload));
    }
  });
}

test("a covered economy is not refused", async () => {
  installStub();
  const { isError, payload } = await tool("/lab/mcp", "revision_records", { indicator: "gdp_growth", country: "Jamaica", year: "2023" });
  assert.equal(isError, false, JSON.stringify(payload));
  assert.equal(payload.country.iso3, "JAM");
});

// --- Batch work budget ---

for (const path of LAB_ROUTES) {
  test(`${path} a batch is refused the revision_records call that would pass the work budget`, async () => {
    installStub();
    // The budget is BATCH_WORK_BUDGET in mcp.ts (15 claim-equivalents), and
    // revision_records weighs what it reads: one DBnomics request plus one per
    // IMF dated vintage. So floor(15 / weight) calls fit and the next is refused.
    const budget = 15;
    const weight = 1 + Object.keys(IMF_VINTAGE_FLOWS).length;
    const fit = Math.floor(budget / weight);
    assert.ok(fit >= 1 && fit * weight <= budget && (fit + 1) * weight > budget);
    const batch = Array.from({ length: fit + 1 }, (_, i) => ({
      jsonrpc: "2.0", id: i + 1, method: "tools/call",
      params: { name: "revision_records", arguments: { indicator: "gdp_growth", country: "USA", year: String(2010 + i) } },
    }));
    const r = await rpc(path, batch);
    assert.equal(r.status, 200);
    const byId = new Map((r.json as any[]).map((b) => [b.id, b]));
    for (let i = 1; i <= fit; i++) {
      assert.equal(byId.get(i)?.result?.isError, false, `call ${i} of ${fit} should fit the budget: ${JSON.stringify(byId.get(i))}`);
    }
    const over = byId.get(fit + 1);
    assert.equal(over?.result?.isError, true, `call ${fit + 1} should be refused: ${JSON.stringify(over)}`);
    const text = over.result.content[0].text;
    assert.match(text, /more upstream work than one request may make/);
    assert.match(text, new RegExp(`a budget of ${budget} claim-equivalents`), "the budget in mcp.ts changed: update this test");
  });
}

// --- Resources ---

test("/lab/mcp serves no core resources, /all/mcp and /mcp still do", async () => {
  const lab = await rpc("/lab/mcp", { jsonrpc: "2.0", id: 1, method: "resources/list" });
  assert.deepEqual(lab.json.result.resources, []);
  for (const uri of ["statcite://registry/indicators", "statcite://registry/sources", "statcite://registry/sids"]) {
    const read = await rpc("/lab/mcp", { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri } });
    assert.ok(read.json.error, `/lab/mcp served ${uri}: ${read.text.slice(0, 200)}`);
    assert.ok(!/barbad/i.test(read.text), `/lab/mcp resource error names an excluded jurisdiction: ${read.text}`);
  }
  for (const path of ["/all/mcp", "/mcp"]) {
    const list = await rpc(path, { jsonrpc: "2.0", id: 3, method: "resources/list" });
    const uris = list.json.result.resources.map((x: { uri: string }) => x.uri);
    assert.ok(uris.includes("statcite://registry/sources"), `${path} lost its core resources`);
    const read = await rpc(path, { jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "statcite://registry/sources" } });
    assert.match(read.json.result.contents[0].text, /StatCite data sources/);
  }
});

// --- method_rules ---

for (const path of LAB_ROUTES) {
  test(`${path} method_rules returns its text with citations`, async () => {
    const { payload, isError } = await tool(path, "method_rules", {});
    assert.equal(isError, false, JSON.stringify(payload));
    const ids = payload.rules.map((r: any) => r.id);
    for (const id of ["edition", "first_release", "actual_or_projection", "base_year_change", "missing_editions"]) {
      assert.ok(ids.includes(id), `missing rule ${id}`);
    }
    for (const r of payload.rules) {
      assert.ok(r.text.length > 80, `rule ${r.id} has no text`);
      assert.ok(r.citations.length >= 1, `rule ${r.id} has no citation`);
      for (const c of r.citations) {
        assert.match(c.url, /^https:\/\//);
        assert.match(c.read_on, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(c.publisher && c.title);
      }
      assert.ok(["imf_published", "statcite_convention"].includes(r.basis));
      assert.ok(!/barbad/i.test(r.text));
    }
    const one = await tool(path, "method_rules", { rule: "first_release" });
    assert.equal(one.payload.rules.length, 1);
    assert.equal(one.payload.rules[0].id, "first_release");
  });
}

test("lab coverage backstop: the code check and the name check each refuse on their own", () => {
  // A resolved row whose code is excluded but whose name is not, and the
  // reverse. Each half of isLabExcluded must catch its own case.
  assert.equal(isLabExcluded({ iso3: "BRB", name: "Placeholder" }), true);
  assert.equal(isLabExcluded({ iso3: "ZZZ", name: "Barbados" }), true);
  assert.equal(isLabExcluded({ iso3: "JAM", name: "Jamaica" }), false);
});
