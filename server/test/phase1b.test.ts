// Phase 1b (GROWTH-PLAN): licence ledger, citation export formats, fuzzy
// country resolution, honest-absence payloads, compare_sources.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFetchStub, call, mcpTool } from "./helpers.ts";

beforeEach(() => installFetchStub());

test("licence ledger: every source carries a verdict, note, and verified-on date; refused sources are present", async () => {
  const { payload } = await mcpTool("list_sources", {});
  const byId = new Map(payload.sources.map((s: any) => [s.id, s]));
  for (const s of payload.sources) {
    assert.ok(["served", "flow_through", "refused"].includes(s.license_verdict), `${s.id} lacks a licence verdict`);
    assert.ok(s.license_note?.length > 20, `${s.id} lacks a licence note`);
    assert.match(s.license_verified_on, /^\d{4}-\d{2}-\d{2}$/, `${s.id} lacks a verified-on date`);
  }
  for (const refused of ["fred", "un_comtrade", "eccb", "cbb"]) {
    assert.equal((byId.get(refused) as any)?.license_verdict, "refused", `refused source ${refused} missing from ledger`);
  }
  assert.equal((byId.get("worldbank") as any)?.license_verdict, "served");
  assert.equal((byId.get("dbnomics") as any)?.license_verdict, "flow_through");
});

test("citation export_formats: bibtex and apa derive from the citation fields", async () => {
  const { payload } = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB", latest_only: true });
  const c = payload.citation;
  assert.ok(c.export_formats, "citation lacks export_formats");
  assert.match(c.export_formats.bibtex, /^@misc\{world_/);
  assert.ok(c.export_formats.bibtex.includes(c.source_url), "bibtex must carry the source URL");
  assert.ok(c.export_formats.bibtex.includes(c.retrieved_at), "bibtex must carry the retrieval date");
  assert.match(c.export_formats.apa, /\(n\.d\.\)\. .+ \[Data set\]\./);
  assert.ok(c.export_formats.apa.includes(c.source_url));
  // BibTeX-special characters in series names must be escaped.
  assert.ok(!/[^\\][%&#$]/.test(c.export_formats.bibtex.split("title = ")[1].split("\n")[0].replace(/\\[%&#$_]/g, "")), "unescaped BibTeX specials in title");
});

test("fuzzy country: one-typo inputs resolve; ambiguous or short ones do not", async () => {
  const { resolveCountry } = await import("../src/core/countries.ts");
  assert.equal(resolveCountry("Jamiaca")?.iso3, "JAM"); // transposition
  assert.equal(resolveCountry("Barbadoss")?.iso3, "BRB"); // insertion
  assert.equal(resolveCountry("Germny")?.iso3, "DEU"); // deletion
  assert.equal(resolveCountry("Chin"), null); // too short for typo route; ambiguous prefix
  // 'Irap' is one edit from both Iran and Iraq — must refuse to guess.
  assert.equal(resolveCountry("Irap"), null);
});

test("honest absence: wrong-window errors report the published available range machine-readably", async () => {
  const windowed = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "BRB", start_year: 1800, end_year: 1801 });
  assert.equal(windowed.isError, true);
  const details = windowed.payload.details ?? {};
  assert.equal(details.no_published_data, false);
  assert.match(String(details.available_range?.start), /^\d{4}/);
  assert.match(JSON.stringify(windowed.payload), /adjust the year range/i);
});

test("compare_sources: multi-source indicator returns per-source values with citations and a spread", async () => {
  const { payload, isError, rpc } = await mcpTool("compare_sources", { indicator: "govt_debt_gdp", country: "BRB", period: "2023" });
  assert.equal(isError, false, JSON.stringify(rpc?.result ?? payload).slice(0, 400));
  assert.equal(payload.indicator, "govt_debt_gdp");
  assert.equal(payload.country.iso3, "BRB");
  assert.ok(payload.results.length >= 2, "expected at least two sources in the chain");
  for (const r of payload.results.filter((x: any) => x.ok)) {
    assert.ok(r.citation, `${r.source} result lacks a citation`);
  }
  const okCount = payload.results.filter((x: any) => x.ok).length;
  if (okCount >= 2) {
    assert.ok(payload.comparison, "expected a comparison block when 2+ sources responded");
    assert.equal(payload.comparison.period, "2023");
    assert.ok(payload.comparison.max >= payload.comparison.min);
  }
  assert.ok(payload.notes.some((n: string) => /methodological/i.test(n)), "methodological framing note missing");
});

test("compare_sources: a down source reports in place without sinking the comparison", async () => {
  // The stub only serves known fixture URLs; an indicator whose chain includes
  // a source with no fixture behaves exactly like that source being down.
  const { payload, isError } = await mcpTool("compare_sources", { indicator: "gdp_growth", country: "BRB" });
  assert.equal(isError, false);
  assert.ok(payload.results.length >= 2);
  const down = payload.results.filter((r: any) => !r.ok);
  for (const d of down) assert.ok(d.error?.length > 0, "down source must carry its error");
});

test("REST /v1/compare mirrors the tool", async () => {
  const res = await call("/v1/compare?indicator=govt_debt_gdp&country=BRB&period=2023");
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.indicator, "govt_debt_gdp");
  assert.ok(Array.isArray(body.results));
  const missing = await call("/v1/compare?indicator=govt_debt_gdp");
  assert.equal(missing.status, 400);
});
