// Citation builders — one per source. These strings are stable API surface.

import type { Citation, Ctx } from "./types.ts";
import { today } from "./types.ts";

export const FRED_NOTICE =
  "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";

export function worldBankCitation(
  ctx: Ctx,
  opts: { indicatorId: string; indicatorName: string; iso3?: string; apiUrl?: string; lastUpdated?: string },
): Citation {
  const loc = opts.iso3 ? `?locations=${opts.iso3}` : "";
  const sourceUrl = `https://data.worldbank.org/indicator/${opts.indicatorId}${loc}`;
  const date = today(ctx);
  return {
    source: "World Bank",
    dataset: "World Development Indicators",
    series_id: opts.indicatorId,
    series_name: opts.indicatorName,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: "CC BY 4.0",
    attribution: `The World Bank: World Development Indicators: ${opts.indicatorName}`,
    retrieved_at: date,
    citation_text: `World Bank, World Development Indicators, series ${opts.indicatorId} (${opts.indicatorName})${
      opts.lastUpdated ? `, data last updated ${opts.lastUpdated}` : ""
    }. Retrieved ${date} via StatCite. ${sourceUrl}`,
  };
}

export function dbnomicsCitation(
  ctx: Ctx,
  opts: {
    providerName: string;
    providerCode: string;
    datasetCode: string;
    datasetName: string;
    seriesCode: string;
    seriesName: string;
    apiUrl?: string;
  },
): Citation {
  const sourceUrl = `https://db.nomics.world/${opts.providerCode}/${encodeURIComponent(opts.datasetCode)}/${encodeURIComponent(opts.seriesCode)}`;
  const date = today(ctx);
  const isImf = opts.providerCode === "IMF";
  return {
    source: opts.providerName,
    dataset: opts.datasetName,
    series_id: `${opts.providerCode}/${opts.datasetCode}/${opts.seriesCode}`,
    series_name: opts.seriesName,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: isImf
      ? "IMF terms: free reuse and redistribution with attribution (Source: International Monetary Fund)"
      : `${opts.providerName} terms apply; retrieved via DBnomics (open aggregator)`,
    attribution: isImf ? "Source: International Monetary Fund" : `Source: ${opts.providerName} (via DBnomics)`,
    retrieved_at: date,
    citation_text: `${opts.providerName}, ${opts.datasetName}, series ${opts.seriesCode} (${opts.seriesName}). Retrieved ${date} via DBnomics/StatCite. ${sourceUrl}`,
  };
}

export function fredCitation(
  ctx: Ctx,
  opts: { seriesId: string; seriesName: string; units?: string; apiUrl?: string },
): Citation {
  const sourceUrl = `https://fred.stlouisfed.org/series/${opts.seriesId}`;
  const date = today(ctx);
  return {
    source: "Federal Reserve Bank of St. Louis (FRED)",
    dataset: "FRED, Federal Reserve Economic Data",
    series_id: opts.seriesId,
    series_name: opts.seriesName,
    source_url: sourceUrl,
    api_url: opts.apiUrl ? opts.apiUrl.replace(/api_key=[^&]+/, "api_key=REDACTED") : undefined,
    license: "FRED® API Terms of Use; check series page for third-party data owners",
    attribution: `Federal Reserve Bank of St. Louis, FRED series ${opts.seriesId}`,
    retrieved_at: date,
    citation_text: `Federal Reserve Bank of St. Louis, FRED, series ${opts.seriesId} (${opts.seriesName}). Retrieved ${date} via StatCite. ${sourceUrl}`,
    notices: [FRED_NOTICE],
  };
}

export function ecbFxCitation(ctx: Ctx, opts: { base: string; quote: string; rateDate: string; apiUrl?: string }): Citation {
  const date = today(ctx);
  const sourceUrl = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
  return {
    source: "European Central Bank",
    dataset: "Euro foreign exchange reference rates (via Frankfurter)",
    series_id: `ECB/${opts.base}${opts.quote}`,
    series_name: `${opts.base}/${opts.quote} reference exchange rate`,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: "ECB reference rates are published for information purposes; reuse with attribution",
    attribution: "Source: European Central Bank euro foreign exchange reference rates",
    retrieved_at: date,
    citation_text: `European Central Bank, euro foreign exchange reference rates, ${opts.base}/${opts.quote} as of ${opts.rateDate} (via Frankfurter). Retrieved ${date} via StatCite. ${sourceUrl}`,
    notices: [
      "ECB reference rates are indicative and 'for information purposes'; they are not transaction rates.",
    ],
  };
}
