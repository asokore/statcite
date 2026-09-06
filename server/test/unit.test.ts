import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCountry, suggestCountries } from "../src/core/countries.ts";
import { searchIndicatorDefs, getIndicatorDef } from "../src/core/indicators.ts";
import { applyTransform, filterPeriodRange, latestNonNull } from "../src/core/transforms.ts";

test("country resolution: codes, names, aliases", () => {
  assert.equal(resolveCountry("USA")?.iso3, "USA");
  assert.equal(resolveCountry("us")?.iso3, "USA");
  assert.equal(resolveCountry("United States")?.iso3, "USA");
  assert.equal(resolveCountry("america")?.iso3, "USA");
  assert.equal(resolveCountry("Barbados")?.iso3, "BRB");
  assert.equal(resolveCountry("BB")?.iso3, "BRB");
  assert.equal(resolveCountry("uk")?.iso3, "GBR");
  assert.equal(resolveCountry("south korea")?.iso3, "KOR");
  assert.equal(resolveCountry("Côte d'Ivoire")?.iso3, "CIV");
  assert.equal(resolveCountry("ivory coast")?.iso3, "CIV");
  assert.equal(resolveCountry("eurozone")?.iso3, "EMU");
  assert.equal(resolveCountry("world")?.iso3, "WLD");
  assert.equal(resolveCountry("czech republic")?.iso3, "CZE");
  assert.equal(resolveCountry("türkiye")?.iso3, "TUR");
  assert.equal(resolveCountry("xx_not_a_country_xx"), null);
});

test("country suggestions help with typos/partials", () => {
  const s = suggestCountries("barbado");
  assert.ok(s.some((x) => x.includes("BRB")), `expected Barbados in ${s}`);
});

test("indicator registry search", () => {
  const inflation = searchIndicatorDefs("inflation");
  assert.equal(inflation[0].def.key, "inflation_cpi");
  const debt = searchIndicatorDefs("government debt");
  assert.equal(debt[0].def.key, "govt_debt_gdp");
  const unemp = searchIndicatorDefs("jobless rate");
  assert.equal(unemp[0].def.key, "unemployment_rate");
  assert.ok(getIndicatorDef("gdp_growth"));
  assert.equal(getIndicatorDef("nope_nope"), undefined);
});

test("transforms: yoy on annual data", () => {
  const obs = [
    { period: "2020", value: 100 },
    { period: "2021", value: 110 },
    { period: "2022", value: 121 },
  ];
  const t = applyTransform(obs, "yoy", { frequency: "annual" });
  assert.equal(t.observations.length, 2);
  assert.ok(Math.abs(t.observations[0].value! - 10) < 1e-9);
  assert.ok(Math.abs(t.observations[1].value! - 10) < 1e-9);
  assert.match(t.note!, /year-over-year/);
});

test("transforms: index rebase to first non-null", () => {
  const obs = [
    { period: "2020", value: 50 },
    { period: "2021", value: 75 },
  ];
  const t = applyTransform(obs, "index", {});
  assert.equal(t.observations[0].value, 100);
  assert.equal(t.observations[1].value, 150);
});

test("period filtering and latest non-null", () => {
  const obs = [
    { period: "2019", value: 1 },
    { period: "2020", value: 2 },
    { period: "2021", value: null },
  ];
  assert.equal(filterPeriodRange(obs, "2020", undefined).length, 2);
  assert.equal(latestNonNull(obs)?.period, "2020");
});

test("every citation links back to statcite.com without displacing the publisher", async () => {
  // ~3,000 citations a day leave the service and get pasted into documents.
  // Each named StatCite in words and linked only the publisher, so nothing in
  // a pasted citation led back here. The publisher must STAY first and keep
  // its own link: this adds a pointer, it does not move the credit.
  const cit = await import("../src/core/citations.ts");
  const ctx = { now: () => new Date("2026-09-05T00:00:00Z"), baseUrl: "https://statcite.com" } as any;
  const all = [
    cit.worldBankCitation(ctx, { indicatorId: "FP.CPI.TOTL.ZG", indicatorName: "Inflation", iso3: "BRB" }),
    cit.dbnomicsCitation(ctx, { providerName: "IMF", providerCode: "IMF", datasetCode: "WEO:2025-04", datasetName: "WEO", seriesCode: "BRB.NGDP_RPCH", seriesName: "GDP growth" } as any),
    cit.imfDataMapperCitation(ctx, { code: "GGXWDG_NGDP", dataset: "WEO", seriesName: "Debt", editionLabel: "World Economic Outlook (April 2026)", sourceUrl: "https://www.imf.org/x", apiUrl: "https://www.imf.org/api" }),
    cit.ecbFxCitation(ctx, { base: "USD", quote: "EUR", rateDate: "2026-09-04" }),
    cit.sdmxCitation(ctx, { provider: "BIS", flow: "WS_CBPOL", key: "M.US", seriesName: "Policy rate", sourceUrl: "https://data.bis.org/x", apiUrl: "https://stats.bis.org/api" }),
    cit.caribstatCitation(ctx, { source: "Eastern Caribbean Central Bank", sourceUrl: "https://www.eccb-centralbank.org/x", tableTitle: "Debt", rowLabel: "Central Government Debt", countryName: "Anguilla", frequency: "a", dataAsAt: "08 June 2026", apiUrl: "https://statcite.com/v1/series?id=x", seriesId: "caribstat/ECCB/x/AIA.a" }),
  ];
  for (const c of all) {
    assert.match(c.citation_text, /via [^.]*StatCite \(https:\/\/statcite\.com\)\./, `${c.source}: citation_text must link statcite.com`);
    assert.ok(c.citation_text.startsWith(c.source), `${c.source}: the publisher must come first`);
    assert.ok(c.citation_text.endsWith(c.source_url) || c.citation_text.includes(c.source_url), `${c.source}: the publisher keeps its own link`);
    assert.ok(c.citation_text.indexOf(c.source) < c.citation_text.indexOf("statcite.com"), `${c.source}: publisher before StatCite`);
    assert.match(c.export_formats!.bibtex, /StatCite \(https:\/\/statcite\.com\)/, `${c.source}: bibtex note must link statcite.com`);
    assert.match(c.export_formats!.bibtex, new RegExp("url = \\{" + c.source_url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${c.source}: bibtex url stays the publisher's`);
  }
});
