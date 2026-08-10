// Citation builders — one per source. These strings are stable API surface.

import type { Citation, Ctx } from "./types.ts";
import { today } from "./types.ts";

export const FRED_NOTICE =
  "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";

/** The one IMF license line, shared by every IMF citation builder and the sources
 * registry so the wording cannot drift.
 *
 * Corrected 2026-08-10 against the IMF's actual special terms for statistical
 * data (imf.org/en/About/copyright-and-terms, effective 2024-10-11). The
 * previous wording said commercial reuse "may require IMF permission" — that
 * is true of IMF *Content* (publications) but NOT of published statistical
 * Data, which is governed by a separate, permissive regime opening
 * "Notwithstanding the general prohibition on the commercial use of IMF
 * Content...". Conflating the two understated the permission and overstated
 * the restriction.
 *
 * Still deliberately NOT a categorical "free reuse" claim: the permission is
 * conditional, and every condition below is in the terms verbatim. */
export const IMF_LICENSE =
  "Published IMF statistical data may be copied, redistributed, and used (including in derivative works) with attribution to the IMF as source. Conditions: attribute as \"Source: International Monetary Fund, <database>, <link>\"; do not alter the data in ways affecting its accuracy, and state explicitly if it is materially transformed; anyone redistributing it downstream must take reasonable efforts to communicate these terms to their own users; and if sold as a standalone product, purchasers must be told the data is available free of charge from the IMF. Some statistical products incorporate third-party information under separate terms";

/** Escape the BibTeX-special characters that actually occur in series names
 * (%, &, _, #, $). Braces are structural and never appear in our field data. */
function bibtexEscape(s: string): string {
  return s.replace(/([&%$#_])/g, "\\$1");
}

/** Derive reference-manager export formats from the citation's own fields —
 * one derivation site so bibtex/apa can never disagree with citation_text.
 * APA 7 treats continuously updated datasets as (n.d.) works cited with a
 * retrieval date, which is exactly what these series are; BibTeX carries the
 * retrieval year as `year` with the full date in `note`. */
export function withExports(c: Citation): Citation {
  const year = c.retrieved_at.slice(0, 4);
  const key = `${c.source.split(/[^A-Za-z]/)[0].toLowerCase() || "statcite"}_${c.series_id.replace(/[^A-Za-z0-9]+/g, "_")}_${year}`;
  const bibtex =
    `@misc{${key},\n` +
    `  author = {{${c.source}}},\n` +
    `  title = {{${bibtexEscape(c.dataset)}: ${bibtexEscape(c.series_name)}}},\n` +
    `  year = {${year}},\n` +
    `  url = {${c.source_url}},\n` +
    `  note = {Series ${bibtexEscape(c.series_id)}. Retrieved ${c.retrieved_at} via StatCite. ${bibtexEscape(c.attribution)}}\n` +
    `}`;
  const apa = `${c.source}. (n.d.). ${c.series_name} [Data set]. ${c.dataset}. Retrieved ${c.retrieved_at}, from ${c.source_url}`;
  return { ...c, export_formats: { bibtex, apa } };
}

export function worldBankCitation(
  ctx: Ctx,
  opts: { indicatorId: string; indicatorName: string; iso3?: string; apiUrl?: string; lastUpdated?: string },
): Citation {
  const loc = opts.iso3 ? `?locations=${opts.iso3}` : "";
  const sourceUrl = `https://data.worldbank.org/indicator/${opts.indicatorId}${loc}`;
  const date = today(ctx);
  return withExports({
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
  });
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
  return withExports({
    source: opts.providerName,
    dataset: opts.datasetName,
    series_id: `${opts.providerCode}/${opts.datasetCode}/${opts.seriesCode}`,
    series_name: opts.seriesName,
    source_url: sourceUrl,
    api_url: opts.apiUrl,
    license: isImf ? IMF_LICENSE : `${opts.providerName} terms apply; retrieved via DBnomics (open aggregator)`,
    attribution: isImf
      ? `Source: International Monetary Fund, ${opts.datasetName}, ${sourceUrl}`
      : `Source: ${opts.providerName} (via DBnomics)`,
    retrieved_at: date,
    citation_text: `${opts.providerName}, ${opts.datasetName}, series ${opts.seriesCode} (${opts.seriesName}). Retrieved ${date} via DBnomics/StatCite. ${sourceUrl}`,
  });
}

export function imfDataMapperCitation(
  ctx: Ctx,
  opts: {
    code: string;
    dataset: "WEO" | "FM";
    seriesName: string;
    editionLabel: string;
    sourceUrl: string;
    apiUrl: string;
    lastModified?: string;
  },
): Citation {
  const date = today(ctx);
  const datasetName = opts.dataset === "FM" ? "IMF Fiscal Monitor" : "IMF World Economic Outlook";
  // The verbatim IMF edition label already names the dataset ("World Economic
  // Outlook (April 2026)", "Fiscal Monitor (April 2026)") — only append the
  // parenthetical in degraded mode, where the label is a synthesized
  // "20XX vintage (edition metadata unavailable...)" string that doesn't.
  const alreadyNamed = /world economic outlook|fiscal monitor/i.test(opts.editionLabel);
  const datasetSuffix = alreadyNamed ? "" : ` (${datasetName})`;
  return withExports({
    source: "International Monetary Fund",
    dataset: opts.editionLabel,
    series_id: `imf/${opts.code}`,
    series_name: opts.seriesName,
    source_url: opts.sourceUrl,
    api_url: opts.apiUrl,
    license: IMF_LICENSE,
    // The IMF's terms specify this exact attribution shape: "Source:
    // International Monetary Fund, Database Name, <<link to the dataset>>."
    // A bare "Source: IMF" omits the database and link the terms ask for.
    attribution: `Source: International Monetary Fund, ${opts.editionLabel}, ${opts.sourceUrl}`,
    retrieved_at: date,
    citation_text: `International Monetary Fund, ${opts.editionLabel}${datasetSuffix}, ${opts.seriesName}, series ${opts.code}. Retrieved ${date} via the IMF DataMapper API/StatCite. ${opts.sourceUrl}`,
    ...(opts.lastModified ? { notices: [`IMF data load timestamp: ${opts.lastModified} UTC.`] } : {}),
  });
}

export function fredCitation(
  ctx: Ctx,
  opts: { seriesId: string; seriesName: string; units?: string; apiUrl?: string },
): Citation {
  const sourceUrl = `https://fred.stlouisfed.org/series/${opts.seriesId}`;
  const date = today(ctx);
  return withExports({
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
  });
}

export function ecbFxCitation(ctx: Ctx, opts: { base: string; quote: string; rateDate: string; apiUrl?: string }): Citation {
  const date = today(ctx);
  const sourceUrl = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
  return withExports({
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
  });
}

/** BIS / ECB SDMX citation. Both licences permit reproduction with
 * attribution (licence ledger entries in core/sources.ts carry the verbatim
 * basis and verification dates). */
export function sdmxCitation(
  ctx: Ctx,
  opts: {
    provider: "BIS" | "ECB" | "IMF";
    flow: string;
    key: string;
    seriesName: string;
    sourceUrl: string;
    apiUrl: string;
    /** IMF only: the human edition label ("World Economic Outlook, October 2025
     * vintage") that belongs in the dataset field and the attribution. */
    datasetLabel?: string;
  },
): Citation {
  const date = today(ctx);
  const source =
    opts.provider === "BIS"
      ? "Bank for International Settlements"
      : opts.provider === "IMF"
        ? "International Monetary Fund"
        : "European Central Bank";
  const dataset =
    opts.provider === "BIS"
      ? `BIS ${opts.flow}`
      : opts.provider === "IMF"
        ? (opts.datasetLabel ?? opts.flow)
        : `ECB Data Portal ${opts.flow}`;
  return withExports({
    source,
    dataset,
    series_id: `${opts.provider.toLowerCase()}/${opts.flow}/${opts.key}`,
    series_name: opts.seriesName,
    source_url: opts.sourceUrl,
    api_url: opts.apiUrl,
    license:
      opts.provider === "BIS"
        ? "BIS statistics may be reproduced and redistributed with attribution; see the BIS terms and conditions for statistics"
        : opts.provider === "IMF"
          ? IMF_LICENSE
          : "ECB content may be reproduced with attribution; see the ECB disclaimer and copyright notice",
    attribution:
      opts.provider === "BIS"
        ? "Source: Bank for International Settlements"
        : opts.provider === "IMF"
          ? // Same shape the IMF's terms specify for every IMF citation here.
            `Source: International Monetary Fund, ${dataset}, ${opts.sourceUrl}`
          : "Source: European Central Bank",
    retrieved_at: date,
    citation_text: `${source}, ${dataset}, series ${opts.key} (${opts.seriesName}). Retrieved ${date} via StatCite. ${opts.sourceUrl}`,
  });
}
