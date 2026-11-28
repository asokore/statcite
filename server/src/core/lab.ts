// Lab tools: WEO edition records (revision_records) and the cited definitions
// they rest on (method_rules). Served only on /lab/mcp and /all/mcp, never on
// /mcp, whose tool list stays exactly as it was.
//
// Three rules hold everywhere in this file:
//  1. Every value carries its own citation naming the edition, the series id
//     and the retrieval date. A value without one is never emitted.
//  2. An edition StatCite cannot reach is listed as missing, with the reason.
//     It is never filled from a neighbouring edition, never interpolated.
//  3. Coverage is checked before any upstream call, and the check fails
//     closed: an input it cannot place as a covered single economy is refused.
//
// Values are read live through the cached upstream layer, never from a stored
// archive. One DBnomics request carries every DBnomics-served edition, and one
// request per IMF dated vintage carries the rest, so a call costs
// 1 + (number of IMF vintage flows) upstream requests.
//
// Size. Each citation names its own edition's source and single-series API
// URL, never the shared multi-series request URL, and lab citations carry no
// export_formats. Measured live for USA gdp_growth 2007 on 2026-11-28, before
// these cuts and the DBnomics metadata=false request: 330,888 bytes of MCP
// response from a 278,180-byte DBnomics body.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { resolveCountry, suggestCountries, COUNTRIES, type Country } from "./countries.ts";
import { getIndicatorDef } from "./indicators.ts";
import { asOfCapableIndicators, dbnomicsCodeForEdition, olderSubjectCodeDetail, IMF_VINTAGE_FLOWS, imfVintageCitation } from "./series.ts";
import { dbnomicsCitation } from "./citations.ts";
import { expectedWeoEdition } from "./weo-calendar.ts";
import { fetchDbnomicsMulti, dbnomicsSeriesApiUrl, type DbnMultiItem } from "../adapters/dbnomics.ts";
import { fetchSdmxSeries } from "../adapters/sdmx.ts";
import { hostStateOf, isTransientUpstreamError } from "./upstream.ts";

// --- Coverage ---

/** Economies the lab tools do not cover. Data, so the guard is one line to
 * audit. The neutral refusal below states no reason, by design. */
const LAB_EXCLUDED_ISO3: ReadonlySet<string> = new Set(["BRB"]);

/** The one message every coverage refusal uses, whatever triggered it. */
export const LAB_NOT_COVERED_MESSAGE =
  "The lab tools do not cover this request. Some jurisdictions and all regional or income aggregates are outside their coverage. Single economies outside that set can be queried.";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Codes and name forms of every excluded economy, derived from the country
 * table so a renamed row cannot slip past a hand-written list. */
const EXCLUDED = COUNTRIES.filter((c) => LAB_EXCLUDED_ISO3.has(c.iso3)).map((c) => ({
  codes: new Set([c.iso3.toLowerCase(), c.iso2.toLowerCase()]),
  // The name with spaces removed, and a stem two letters short of it, so a
  // typo near the end or an inflected form is caught as well.
  stems: (() => {
    const n = fold(c.name).replace(/ /g, "");
    return [n, n.slice(0, Math.max(5, n.length - 2))];
  })(),
}));

function refuseCoverage(): never {
  throw new ToolError(LAB_NOT_COVERED_MESSAGE, { not_covered: true }, "invalid_request");
}

/** True when free text names an excluded economy by code or by name. */
function namesExcluded(text: string): boolean {
  const f = fold(text);
  if (!f) return false;
  const compact = f.replace(/ /g, "");
  const tokens = f.split(" ");
  return EXCLUDED.some((e) => e.stems.some((s) => s.length >= 4 && compact.includes(s)) || tokens.some((t) => e.codes.has(t)));
}

/** Scan every string anywhere in a lab tool's arguments. Runs before the
 * handler on every lab tool, so a tool added later is covered without a
 * per-tool check, and a country passed under an unexpected key is still seen. */
export function assertLabArgsCovered(value: unknown, depth = 0): void {
  if (depth > 4) refuseCoverage();
  if (typeof value === "string") {
    if (namesExcluded(value)) refuseCoverage();
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) assertLabArgsCovered(v, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (namesExcluded(k)) refuseCoverage();
      assertLabArgsCovered(v, depth + 1);
    }
  }
}

/**
 * Resolve a country for a lab tool, failing closed. Refused: an excluded
 * economy by code or name, every aggregate (StatCite cannot show that an
 * aggregate leaves an excluded economy out), and any code the country table
 * does not know (an unverified pass-through could be anything).
 */
export function labCountry(input: string): Country {
  if (namesExcluded(input)) refuseCoverage();
  const c = resolveCountry(input);
  if (!c) {
    const suggestions = suggestCountries(input).filter((s) => !namesExcluded(s));
    throw new ToolError(
      `Could not resolve country '${input}'. Use an ISO3 code (e.g. USA, JAM, DEU) or a standard English name.` +
        (suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""),
      { input, suggestions },
      "unknown_country",
    );
  }
  if (c.unverified || c.aggregate || isLabExcluded(c)) refuseCoverage();
  return c;
}

/** True when a resolved country is outside lab coverage by its code or by
 * its name. Each half is tested on its own. */
export function isLabExcluded(c: { iso3: string; name: string }): boolean {
  return LAB_EXCLUDED_ISO3.has(c.iso3) || namesExcluded(c.name);
}

// --- Editions ---

/** The first dated WEO edition StatCite can reach (DBnomics, verified
 * 2026-11-28: WEO:2008-04 is its oldest WEO dataset). */
export const FIRST_REACHABLE_EDITION = "2008-04";

/** Every April and October edition from `first` to `last` inclusive. The
 * calendar, not an archive listing: an edition the archive lacks still
 * appears, so its absence is shown rather than skipped. */
export function weoEditionsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${m === 4 ? "04" : "10"}`);
    if (m === 4) m = 10;
    else {
      m = 4;
      y += 1;
    }
  }
  return out;
}

export type MissingReason = "not_in_archive" | "subject_code_not_mapped" | "no_value_for_year" | "not_retrievable" | "upstream_unavailable";

const EDITION_MONTHS: Record<string, string> = { "04": "April", "10": "October" };

/** The edition in words, "April 2025 edition", so a citation names its
 * edition even where the upstream dataset name is generic (DBnomics names
 * WEO:2022-04 to WEO:2025-04 "World Economic Outlook by countries"). */
export function editionInWords(edition: string): string {
  const [y, m] = edition.split("-");
  return `${EDITION_MONTHS[m] ?? m} ${y} edition`;
}

/** Lab citations leave out export_formats. Over thirty-odd editions the
 * BibTeX and APA strings were a tenth of the response and nothing in the
 * record needs them. */
function labCitation(c: Citation): Citation {
  const { export_formats: _omit, ...rest } = c;
  return rest;
}

export interface EditionRecord {
  edition: string;
  status: "value" | "missing";
  /** The value exactly as that edition published it. null when missing. */
  value: number | null;
  source: "imf_dated_vintage" | "dbnomics_dated_edition";
  /** Present with every value, and only with a value. */
  citation?: Citation;
  period_status?: "actual" | "estimate_or_projection" | "unclassified";
  period_status_basis?: "imf_latest_actual_annual_data" | "edition_year_heuristic";
  base_year?: string;
  latest_actual_annual_data?: string;
  /** Set when this edition and the nearest earlier edition in the record both
   * state BASE_YEAR. */
  base_year_compared_with?: string;
  base_year_changed?: boolean;
  missing_reason?: MissingReason;
  missing_detail?: string;
}

export interface RevisionRecordsResult {
  indicator: string;
  label: string;
  unit: string;
  country: { iso3: string; name: string };
  year: string;
  editions_listed: number;
  editions_with_value: number;
  editions_missing: number;
  records: EditionRecord[];
  notes: string[];
}

function valueAt(obs: Array<{ period: string; value: number | null }>, year: string): number | null {
  const o = obs.find((x) => x.period === year);
  return o && typeof o.value === "number" && Number.isFinite(o.value) ? o.value : null;
}

function heuristicStatus(edition: string, year: string): EditionRecord["period_status"] {
  return Number(year) >= Number(edition.slice(0, 4)) ? "estimate_or_projection" : "unclassified";
}

function parseYear(input: string, now: Date): string {
  const y = input.trim();
  const max = now.getUTCFullYear() + 6;
  if (!/^\d{4}$/.test(y) || Number(y) < 1980 || Number(y) > max) {
    throw new ToolError(`'year' must be a four-digit year from 1980 to ${max}, got '${input}'.`, { year: input }, "invalid_parameter");
  }
  return y;
}

export async function revisionRecords(ctx: Ctx, indicatorInput: string, countryInput: string, yearInput: string): Promise<RevisionRecordsResult> {
  // Coverage first, before anything else can reach an upstream.
  const country = labCountry(countryInput);
  const capable = asOfCapableIndicators();
  const def = getIndicatorDef(indicatorInput);
  if (!def || !def.dbnomics || !capable.includes(def.key)) {
    throw new ToolError(
      `revision_records covers only the indicators with dated WEO editions: ${capable.join(", ")}. Got '${indicatorInput}'.`,
      { indicator: indicatorInput, accepted: capable },
      def ? "invalid_parameter" : "unknown_indicator",
    );
  }
  const now = ctx.now ? ctx.now() : new Date();
  const year = parseYear(yearInput, now);

  const editions = weoEditionsBetween(FIRST_REACHABLE_EDITION, expectedWeoEdition(now));
  const [, datasetTemplate, codeTemplate] = def.dbnomics;
  const imfCode = codeTemplate.split(".")[1];
  const dbnEditions = editions.filter((e) => !IMF_VINTAGE_FLOWS[e]);
  const imfEditions = editions.filter((e) => IMF_VINTAGE_FLOWS[e]);
  const dbnIds = dbnEditions.map((e) => ({
    edition: e,
    datasetCode: datasetTemplate.replace(/:latest$/, `:${e}`),
    seriesCode: dbnomicsCodeForEdition(codeTemplate, e).replace("{ISO3}", country.iso3),
  }));

  const dbnCall = dbnIds.length
    ? fetchDbnomicsMulti("IMF", dbnIds.map(({ datasetCode, seriesCode }) => ({ datasetCode, seriesCode })), {
        hostState: hostStateOf(ctx),
        // The metadata=false body carries no provider block, so the name is
        // given here. It is the name DBnomics's own provider record gives.
        providerName: "International Monetary Fund",
      }).then(
        (r) => ({ ok: true as const, ...r }),
        (e: unknown) => ({ ok: false as const, error: e }),
      )
    : Promise.resolve({ ok: true as const, items: [] as DbnMultiItem[], apiUrl: "" });
  const key = `${country.iso3}.${imfCode}.A`;
  const imfCalls = imfEditions.map((e) =>
    fetchSdmxSeries("IMF", IMF_VINTAGE_FLOWS[e], key, { now, attributes: true }).then(
      (s) => ({ edition: e, ok: true as const, s }),
      (err: unknown) => ({ edition: e, ok: false as const, error: err }),
    ),
  );
  const [dbn, ...imf] = await Promise.all([dbnCall, ...imfCalls]);

  const byEdition = new Map<string, EditionRecord>();
  const seriesName = `${def.label}, ${country.name}`;

  dbnIds.forEach((id, i) => {
    const base = { edition: id.edition, source: "dbnomics_dated_edition" as const };
    if (!dbn.ok) {
      byEdition.set(id.edition, {
        ...base,
        status: "missing",
        value: null,
        missing_reason: isTransientUpstreamError(dbn.error) ? "upstream_unavailable" : "not_retrievable",
        missing_detail: "The DBnomics request for the dated editions failed.",
      });
      return;
    }
    const item = dbn.items[i];
    if (!item?.series) {
      // A pre-2010 edition that files the figure under an older subject code
      // is not an absence, so it is not reported as one.
      const older = olderSubjectCodeDetail(codeTemplate, id.edition);
      if (older) {
        byEdition.set(id.edition, { ...base, status: "missing", value: null, missing_reason: "subject_code_not_mapped", missing_detail: older });
        return;
      }
      byEdition.set(id.edition, {
        ...base,
        status: "missing",
        value: null,
        missing_reason: "not_in_archive",
        missing_detail: item?.error
          ? `DBnomics reported for ${id.datasetCode}: ${item.error}`
          : `DBnomics holds no series ${id.seriesCode} in ${id.datasetCode}.`,
      });
      return;
    }
    const v = valueAt(item.series.observations, year);
    if (v === null) {
      byEdition.set(id.edition, {
        ...base,
        status: "missing",
        value: null,
        missing_reason: "no_value_for_year",
        missing_detail: `${id.datasetCode} carries ${id.seriesCode} but publishes no value for ${year}.`,
      });
      return;
    }
    byEdition.set(id.edition, {
      ...base,
      status: "value",
      value: v,
      // This edition's own single-series API URL, never the shared request
      // URL, and the edition in words beside DBnomics's dataset name.
      citation: labCitation(
        dbnomicsCitation(ctx, {
          providerName: item.series.providerName,
          providerCode: item.series.providerCode,
          datasetCode: item.series.datasetCode,
          datasetName: `${item.series.datasetName}, ${editionInWords(id.edition)}`,
          seriesCode: item.series.seriesCode,
          seriesName: item.series.seriesName,
          apiUrl: dbnomicsSeriesApiUrl(item.series.providerCode, item.series.datasetCode, item.series.seriesCode),
        }),
      ),
      period_status: heuristicStatus(id.edition, year),
      period_status_basis: "edition_year_heuristic",
    });
  });

  for (const r of imf) {
    const base = { edition: r.edition, source: "imf_dated_vintage" as const };
    if (!r.ok) {
      byEdition.set(r.edition, {
        ...base,
        status: "missing",
        value: null,
        missing_reason: isTransientUpstreamError(r.error) ? "upstream_unavailable" : "not_retrievable",
        missing_detail: `The IMF dated vintage ${IMF_VINTAGE_FLOWS[r.edition]} returned no usable series for ${key}.`,
      });
      continue;
    }
    const attrs = r.s.groupAttributes ?? {};
    const v = valueAt(r.s.observations, year);
    if (v === null) {
      byEdition.set(r.edition, {
        ...base,
        status: "missing",
        value: null,
        missing_reason: "no_value_for_year",
        missing_detail: `The IMF dated vintage ${IMF_VINTAGE_FLOWS[r.edition]} publishes no value for ${year}.`,
        ...(attrs.BASE_YEAR ? { base_year: attrs.BASE_YEAR } : {}),
        ...(attrs.LATEST_ACTUAL_ANNUAL_DATA ? { latest_actual_annual_data: attrs.LATEST_ACTUAL_ANNUAL_DATA } : {}),
      });
      continue;
    }
    const la = attrs.LATEST_ACTUAL_ANNUAL_DATA;
    const laYear = la && /^\d{4}$/.test(la) ? Number(la) : undefined;
    byEdition.set(r.edition, {
      ...base,
      status: "value",
      value: v,
      citation: labCitation(imfVintageCitation(ctx, { flow: IMF_VINTAGE_FLOWS[r.edition], key, seriesName, apiUrl: r.s.apiUrl })),
      ...(laYear !== undefined
        ? { period_status: Number(year) <= laYear ? "actual" : "estimate_or_projection", period_status_basis: "imf_latest_actual_annual_data" }
        : { period_status: heuristicStatus(r.edition, year), period_status_basis: "edition_year_heuristic" }),
      ...(attrs.BASE_YEAR ? { base_year: attrs.BASE_YEAR } : {}),
      ...(la ? { latest_actual_annual_data: la } : {}),
    });
  }

  // The listing, in edition order, with base-year comparisons between
  // editions that both state one. A comparison is a fact about two published
  // attributes, never a judgement about the values.
  const records = editions.map((e) => byEdition.get(e)!);
  let lastBase: { edition: string; base: string } | undefined;
  for (const rec of records) {
    if (!rec.base_year) continue;
    if (lastBase) {
      rec.base_year_compared_with = lastBase.edition;
      rec.base_year_changed = rec.base_year !== lastBase.base;
    }
    lastBase = { edition: rec.edition, base: rec.base_year };
  }

  // A value never travels without its citation. This is the last line, so a
  // future edit that drops one cannot ship a bare number.
  for (const rec of records) {
    if (rec.status === "value" && (!rec.citation || rec.value === null)) {
      throw new Error(`revision_records built a value for ${rec.edition} without a citation`);
    }
    if (rec.status === "missing" && (rec.value !== null || rec.citation)) {
      throw new Error(`revision_records filled the missing edition ${rec.edition}`);
    }
  }

  const withValue = records.filter((r) => r.status === "value").length;
  if (withValue === 0 && records.some((r) => r.missing_reason === "upstream_unavailable")) {
    throw new ToolError(
      `No WEO edition of '${def.key}' for ${country.name} could be read, because an upstream source failed. Retry shortly.`,
      { indicator: def.key, country: country.iso3, year },
      "upstream_unavailable",
    );
  }

  return {
    indicator: def.key,
    label: def.label,
    unit: def.unit,
    country: { iso3: country.iso3, name: country.name },
    year,
    editions_listed: records.length,
    editions_with_value: withValue,
    editions_missing: records.length - withValue,
    records,
    notes: [
      `One record per April and October WEO edition from ${FIRST_REACHABLE_EDITION} to ${editions.at(-1)}. Each value is as that edition published it, with its own citation. Missing editions are listed with the reason and are never filled from another edition.`,
      "The record lists published values and carries no score. method_rules defines edition, first release, the actual or projection boundary and the base-year flag used here.",
      "The current edition is also served live by get_indicator on /mcp. An edition with no dated vintage StatCite can reach is listed as missing here.",
      "Citations here carry no export_formats (BibTeX and APA strings), to keep the response small.",
    ],
  };
}

// --- Method rules (static, cited) ---

export interface MethodSource {
  publisher: string;
  title: string;
  url: string;
  read_on: string;
}

export interface MethodRule {
  id: string;
  title: string;
  basis: "imf_published" | "statcite_convention";
  text: string;
  citations: MethodSource[];
}

const READ_ON = "2026-11-28";

const SRC_IMF_WEO_DESCRIPTION: MethodSource = {
  publisher: "International Monetary Fund",
  title: "World Economic Outlook (WEO) 2026 April vintage, dataset-level FULL_DESCRIPTION attribute returned with a series request",
  url: "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO_2026_APR_VINTAGE/1.0.0/USA.NGDP_RPCH.A?format=sdmx-json&attributes=all",
  read_on: READ_ON,
};
const SRC_IMF_VINTAGE_ATTRIBUTES: MethodSource = {
  publisher: "International Monetary Fund",
  title: "WEO dated vintage dataflow, dimension-group attributes LATEST_ACTUAL_ANNUAL_DATA and BASE_YEAR (COUNTRY x INDICATOR)",
  url: "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO_2026_APR_VINTAGE/1.0.0/USA.NGDP_RPCH.A?format=sdmx-json&attributes=all",
  read_on: READ_ON,
};
const SRC_IMF_VINTAGE_LISTING: MethodSource = {
  publisher: "International Monetary Fund",
  title: "IMF.RES dataflow listing (WEO_2025_OCT_VINTAGE and WEO_2026_APR_VINTAGE)",
  url: "https://api.imf.org/external/sdmx/3.0/structure/dataflow/IMF.RES/*/+?format=sdmx-json",
  read_on: READ_ON,
};
const SRC_DBNOMICS_EDITIONS: MethodSource = {
  publisher: "DBnomics",
  title: "IMF datasets on DBnomics, dated WEO editions WEO:2008-04 to WEO:2025-04 (WEO:2011-10 not loadable)",
  url: "https://api.db.nomics.world/v22/datasets/IMF",
  read_on: READ_ON,
};

export const METHOD_RULES: readonly MethodRule[] = [
  {
    id: "edition",
    title: "What an edition is",
    basis: "imf_published",
    text:
      "An edition is one release of the IMF World Economic Outlook database. The IMF describes the WEO as released in April and in September or October each year. StatCite names editions by year and month on that calendar, 2019-04 or 2019-10. Interim WEO Updates (January and July) are not editions in these records. Older editions are read from the dated WEO datasets DBnomics holds, and the newest from the IMF's own dated vintage dataflows.",
    citations: [SRC_IMF_WEO_DESCRIPTION, SRC_IMF_VINTAGE_LISTING, SRC_DBNOMICS_EDITIONS],
  },
  {
    id: "actual_or_projection",
    title: "The actual or projection boundary",
    basis: "imf_published",
    text:
      "In its dated vintages the IMF states LATEST_ACTUAL_ANNUAL_DATA for each country and indicator: the last year for which that edition holds actual data. A later year in that edition is an IMF staff estimate or projection. Where an edition states it, revision_records classifies the requested year against it. Where it does not, as in the editions read through DBnomics, a year on or after the edition's own year is marked as an estimate or projection, and an earlier year is left unclassified, because some earlier years are also staff estimates.",
    citations: [SRC_IMF_VINTAGE_ATTRIBUTES],
  },
  {
    id: "first_release",
    title: "What first release means here",
    basis: "statcite_convention",
    text:
      "In these records the first release of a value is the earliest edition in which the requested year is at or before that edition's LATEST_ACTUAL_ANNUAL_DATA, so the edition publishes it as actual data. Earlier editions that carry the year hold it as an estimate or projection. Where the attribute is missing, the first release cannot be read from the record, and StatCite does not infer it.",
    citations: [SRC_IMF_VINTAGE_ATTRIBUTES],
  },
  {
    id: "base_year_change",
    title: "How a base-year change is flagged",
    basis: "statcite_convention",
    text:
      "BASE_YEAR is the base year the IMF states for the series in that edition. When an edition and the nearest earlier edition in the record both state it, the later record carries base_year_compared_with and base_year_changed. A change of base year can move a whole series, so part or all of a revision across that pair may come from the new base. Where an edition does not state a base year, no change is flagged or inferred.",
    citations: [SRC_IMF_VINTAGE_ATTRIBUTES],
  },
  {
    id: "missing_editions",
    title: "Missing editions",
    basis: "statcite_convention",
    text:
      "Every April and October edition in the covered range is listed, including those StatCite cannot reach. A missing edition carries a reason (not_in_archive, subject_code_not_mapped, no_value_for_year, not_retrievable or upstream_unavailable) and a null value. subject_code_not_mapped marks an edition before 2010-04 that files, or may file, the figure under an older subject code StatCite does not map. It says nothing about whether the edition holds the figure. A missing edition is never filled from a neighbouring edition or interpolated.",
    citations: [SRC_DBNOMICS_EDITIONS],
  },
];

export const METHOD_RULE_IDS = METHOD_RULES.map((r) => r.id);

export function methodRules(ruleId?: string): { rules: MethodRule[]; note: string } {
  const rules = ruleId ? METHOD_RULES.filter((r) => r.id === ruleId) : [...METHOD_RULES];
  if (ruleId && rules.length === 0) {
    throw new ToolError(`Unknown rule '${ruleId}'. Accepted: ${METHOD_RULE_IDS.join(", ")}.`, { rule: ruleId, accepted: METHOD_RULE_IDS }, "invalid_parameter");
  }
  return {
    rules: rules.map((r) => ({ ...r, citations: r.citations.map((c) => ({ ...c })) })),
    note: "Static text. basis 'imf_published' restates what the cited IMF source states. basis 'statcite_convention' is how these records apply it.",
  };
}
