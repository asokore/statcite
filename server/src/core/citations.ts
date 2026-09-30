// Citation builders — one per source. These strings are stable API surface.

import type { Citation, Ctx } from "./types.ts";
import { today } from "./types.ts";
import { stripControls } from "./text.ts";

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

/**
 * The "retrieved via" clause, in one place.
 *
 * Every citation_text ends with this clause and the publisher's own URL. The
 * link to statcite.com is here so a reader of a pasted citation can find the
 * service that produced it; the publisher stays the cited source, named first
 * and linked. Passing `through` names an intermediary the data actually came
 * through (DBnomics, the IMF DataMapper API), because saying "via StatCite"
 * alone there would understate the chain.
 */
export const STATCITE_URL = "https://statcite.com";
export function retrievedVia(date: string, through?: string): string {
  const chain = through ? `${through} and StatCite` : "StatCite";
  return `Retrieved ${date} via ${chain} (${STATCITE_URL}).`;
}

/** Make text safe inside a BibTeX field. Line breaks become spaces, and
 * braces and backslashes are removed, because they are structural: an
 * unbalanced brace in third-party or caller-influenced text could close the
 * field and inject another. The remaining specials (%, &, _, #, $) are escaped. */
function bibtexEscape(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/[{}\\]/g, "").replace(/([&%$#_])/g, "\\$1");
}

/** A URL inside a BibTeX url field stays verbatim (biblatex reads it that
 * way), so only the characters that could break the field are encoded. */
function bibtexUrl(u: string): string {
  return u.replace(/[\r\n]+/g, "").replace(/\{/g, "%7B").replace(/\}/g, "%7D");
}

/** Derive reference-manager export formats from the citation's own fields —
 * one derivation site so bibtex/apa can never disagree with citation_text.
 * APA 7 treats continuously updated datasets as (n.d.) works cited with a
 * retrieval date, which is exactly what these series are; BibTeX carries the
 * retrieval year as `year` with the full date in `note`. */
export function withExports(raw: Citation): Citation {
  // Every builder ends here, so this is the one place that strips control
  // characters from the free text any upstream (World Bank, DBnomics, IMF,
  // BIS, ECB, the CaribStat mirror) can put into a citation. Nothing else
  // changes: no length cap, no whitespace collapse.
  const c: Citation = {
    ...raw,
    source: stripControls(raw.source),
    dataset: stripControls(raw.dataset),
    series_name: stripControls(raw.series_name),
    attribution: stripControls(raw.attribution),
    citation_text: stripControls(raw.citation_text),
    ...(raw.notices ? { notices: raw.notices.map(stripControls) } : {}),
  };
  const year = c.retrieved_at.slice(0, 4);
  const key = `${c.source.split(/[^A-Za-z]/)[0].toLowerCase() || "statcite"}_${c.series_id.replace(/[^A-Za-z0-9]+/g, "_")}_${year}`;
  const bibtex =
    `@misc{${key},\n` +
    `  author = {{${bibtexEscape(c.source)}}},\n` +
    `  title = {{${bibtexEscape(c.dataset)}: ${bibtexEscape(c.series_name)}}},\n` +
    `  year = {${year}},\n` +
    `  url = {${bibtexUrl(c.source_url)}},\n` +
    `  note = {Series ${bibtexEscape(c.series_id)}. ${retrievedVia(c.retrieved_at)} ${bibtexEscape(c.attribution)}}\n` +
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
    }. ${retrievedVia(date)} ${sourceUrl}`,
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
    citation_text: `${opts.providerName}, ${opts.datasetName}, series ${opts.seriesCode} (${opts.seriesName}). ${retrievedVia(date, "DBnomics")} ${sourceUrl}`,
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
    citation_text: `International Monetary Fund, ${opts.editionLabel}${datasetSuffix}, ${opts.seriesName}, series ${opts.code}. ${retrievedVia(date, "the IMF DataMapper API")} ${opts.sourceUrl}`,
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
    citation_text: `Federal Reserve Bank of St. Louis, FRED, series ${opts.seriesId} (${opts.seriesName}). ${retrievedVia(date)} ${sourceUrl}`,
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
    citation_text: `European Central Bank, euro foreign exchange reference rates, ${opts.base}/${opts.quote} as of ${opts.rateDate} (via Frankfurter). ${retrievedVia(date)} ${sourceUrl}`,
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
    citation_text: `${source}, ${dataset}, series ${opts.key} (${opts.seriesName}). ${retrievedVia(date)} ${opts.sourceUrl}`,
  });
}

/**
 * The notice for an ECCB table collected after the bank withdrew its stamp.
 *
 * Verified live on 2026-09-30: the ECCB no longer prints "Data as at" on its
 * statistics table pages, in the rendered page or in the CSV and Excel
 * exports. The corpus collected on 2026-09-20 still carried stamps, so the
 * bank withdrew it between those two dates, which is why every surface says
 * "late September 2026" and keys the wording to the event, not to a month
 * boundary. The CaribStat ingest omits the stamp rather than borrowing one
 * from an earlier run or filling it with our own retrieval time. Without this
 * notice such a citation carried no date except StatCite's request date, which
 * a reader could take for the data's currency.
 *
 * The date in the notice is when StatCite collected the COPY BEING SERVED. It
 * is not StatCite's latest read of the bank: caribstat/tools/publish.mjs
 * compares documents with retrieved_at stripped, so a run whose only change is
 * retrieved_at never republishes, and the served retrieved_at can be weeks
 * older than the collector's most recent visit.
 */
export const ECCB_STAMP_WITHDRAWN =
  'The Eastern Caribbean Central Bank stopped printing a "Data as at" stamp on its statistics tables in late September 2026, so this figure carries no currency claim from the bank.';

export function eccbStamplessNotice(collected?: string): string {
  return collected
    ? `${ECCB_STAMP_WITHDRAWN} StatCite collected the copy served here from the bank on ${collected}. That is StatCite's collection date, and it says nothing about how current the bank considers the figure.`
    : ECCB_STAMP_WITHDRAWN;
}

/**
 * The calendar date on which StatCite collected the served copy, or undefined.
 *
 * The value comes from the mirror document, so it is third-party text as far
 * as a citation is concerned. Only a real calendar date survives, either a
 * bare YYYY-MM-DD or a strict ISO timestamp that parses, reduced to its UTC
 * date. Anything else yields undefined and the caller drops the sentence, so a
 * citation can never print "undefined" or "Invalid Date". The time part is
 * matched strictly rather than left to Date.parse, because the language lets
 * Date.parse fall back to implementation-defined parsing for anything outside
 * the ISO format. A timestamp with no zone keeps its written date,
 * because converting it would depend on the clock of the machine running this.
 */
export function collectionDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const cal = new Date(Date.UTC(y, mo - 1, d));
  if (cal.getUTCFullYear() !== y || cal.getUTCMonth() !== mo - 1 || cal.getUTCDate() !== d) return undefined;
  const written = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return written;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return undefined;
  return m[5] ? new Date(t).toISOString().slice(0, 10) : written;
}

/**
 * CaribStat citation — regional central-bank data ingested on a schedule.
 *
 * The distinguishing field is `data_as_at`: the ECCB stamped its tables with
 * its own currency date until late September 2026, and those stamps differ per
 * table and per country. Where a document carries one it is kept separate from
 * `retrieved_at` and stated in the citation text, because "when the bank says
 * this data is current to" and "when we fetched it" are different claims and
 * conflating them would misrepresent the source. ECCB documents collected
 * after the bank withdrew the stamp carry none, and their citation says so and
 * names our collection date as ours.
 */
export function caribstatCitation(
  ctx: Ctx,
  opts: {
    source: string;
    sourceUrl: string;
    /** Absent on CBB, whose documents identify a publication instead. */
    tableTitle?: string;
    rowLabel: string;
    countryName: string;
    frequency: string;
    dataAsAt?: string;
    dataAsAtRaw?: string;
    /**
     * For sources that publish no currency stamp. The Central Bank of Barbados
     * does not print one, so instead of inventing an equivalent we name the
     * PUBLICATION a figure came from and the date that publication carries.
     * That is a narrower claim and a checkable one: a reader can open the exact
     * workbook. Never merged into dataAsAt, because "the bank says this is
     * current to X" and "this appeared in a document dated X" are not the same
     * statement.
     */
    publicationTitle?: string;
    publishedAt?: string;
    attachmentUrl?: string;
    apiUrl: string;
    seriesId: string;
    /**
     * The provider parsed from the series id StatCite fetched ("ECCB" or
     * "CBB"), never taken from document text. It decides whether a document
     * with no date at all is an ECCB table collected after the bank withdrew
     * its stamp, which is the only case the withdrawal notice may describe.
     */
    provider?: string;
    /**
     * The document's `retrieved_at`: when StatCite collected the copy being
     * served. Not the collector's latest visit, because a run that changes
     * only retrieved_at is never published. Only ever stated as StatCite's
     * collection date, and only on a stampless ECCB document. Never merged
     * into dataAsAt.
     */
    collectedAt?: string;
  },
): Citation {
  const date = today(ctx);
  const freqWord = opts.frequency === "m" ? "monthly" : opts.frequency === "q" ? "quarterly" : "annual";
  const asAt = opts.dataAsAtRaw ?? opts.dataAsAt;
  const stampless = !asAt && !opts.publishedAt && opts.provider?.toUpperCase() === "ECCB";
  const collected = stampless ? collectionDate(opts.collectedAt) : undefined;
  return withExports({
    source: opts.source,
    dataset: opts.publicationTitle ?? opts.tableTitle ?? "",
    series_id: opts.seriesId,
    series_name: `${opts.rowLabel}, ${opts.countryName} (${freqWord})`,
    source_url: opts.sourceUrl,
    api_url: opts.apiUrl,
    license: "Reproduced with the publishing central bank's permission; see the source entry in /v1/sources for the scope of that grant",
    attribution: `Source: ${opts.source}`,
    retrieved_at: date,
    citation_text:
      `${opts.source}, ${opts.publicationTitle ?? opts.tableTitle}, ${opts.rowLabel}, ${opts.countryName} (${freqWord})` +
      (asAt
        ? `, data as at ${asAt}`
        : opts.publishedAt
          ? `, published ${opts.publishedAt}`
          : stampless
            ? `, no currency stamp from the bank${collected ? `, collected by StatCite on ${collected}` : ""}`
            : "") +
      `. ${retrievedVia(date)} ${opts.attachmentUrl ?? opts.sourceUrl}`,
    ...(asAt
      ? {
          notices: [
            `The publishing bank stamps this table "Data as at ${asAt}". That is the source's own currency claim and is not the same as the retrieval date above.`,
          ],
        }
      : opts.publishedAt
        ? {
            notices: [
              `This source publishes no "data as at" stamp. ${opts.publishedAt} is the date of the publication these figures were taken from, which is a weaker claim: it says when the document appeared, not how current the bank considers the figures. Neither is the retrieval date above.`,
            ],
          }
        : stampless
          ? { notices: [eccbStamplessNotice(collected)] }
          : {}),
  });
}
