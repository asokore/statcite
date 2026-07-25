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
