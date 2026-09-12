// Caribbean usage must be visible in the operator's metrics. caribstat/ and
// imf/ ids were logged as "other", and a failed caribstat call had no country.

import { test } from "node:test";
import assert from "node:assert/strict";
import { indicatorLabel, countryLabel, seriesIdCountry } from "../src/core/analytics.ts";

test("series ids from every served provider get a provider label, not 'other'", () => {
  assert.equal(indicatorLabel("caribstat/ECCB/debt-to-gdp/AIA.a#Total Public Sector Debt to GDP"), "caribstat/*");
  assert.equal(indicatorLabel("imf/GGXWDG_NGDP"), "imf/*");
  assert.equal(indicatorLabel("bis/WS_CBPOL/M.US"), "bis/*");
  assert.equal(indicatorLabel("ecb/HICP/M.U2.N.000000.4D0.ANR"), "ecb/*");
  assert.equal(indicatorLabel("madeup/thing"), "other", "an unknown provider still collapses to other");
});

test("the country inside a caribstat id is recorded, and only as a resolved ISO3", () => {
  assert.equal(countryLabel(seriesIdCountry("caribstat/ECCB/debt-to-gdp/AIA.a")), "AIA");
  assert.equal(countryLabel(seriesIdCountry("caribstat/ECCB/consumer-price-index/MSR.q#Inflation Rate - end of period")), "MSR");
  assert.equal(countryLabel(seriesIdCountry("caribstat/CBB/inflation-and-retail-price-index/jul2001-eop")), "BRB");
  assert.equal(countryLabel(seriesIdCountry("caribstat/ECCB/debt-to-gdp/ZZZ.a")), undefined, "an unknown code is dropped");
  assert.equal(seriesIdCountry("worldbank/NY.GDP.MKTP.KD.ZG"), undefined);
  assert.equal(seriesIdCountry(42), undefined);
});
