// DBnomics API v22 adapter (free aggregator of IMF/OECD/Eurostat/… series).
// Docs: https://docs.db.nomics.world/

import { fetchJson } from "../core/upstream.ts";
import { ToolError } from "../core/types.ts";
import type { Observation } from "../core/types.ts";

const BASE = "https://api.db.nomics.world/v22";

export interface DbnSeries {
  providerCode: string;
  providerName: string;
  datasetCode: string;
  datasetName: string;
  seriesCode: string;
  seriesName: string;
  frequency?: string;
  observations: Observation[];
  apiUrl: string;
}

interface DbnDoc {
  "@frequency"?: string;
  dataset_code: string;
  dataset_name: string;
  provider_code: string;
  series_code: string;
  series_name: string;
  period: string[];
  value: Array<number | string | null>;
}

/** The v22 API URL for one series in one dataset. */
export function dbnomicsSeriesApiUrl(providerCode: string, datasetCode: string, seriesCode: string): string {
  return `${BASE}/series/${encodeURIComponent(providerCode)}/${encodeURIComponent(datasetCode)}/${encodeURIComponent(seriesCode)}?observations=1`;
}

/**
 * Fetch a series. `seriesCode` may be a full code or a prefix (DBnomics matches
 * by mask); when several docs match, the exact code wins, then the shortest.
 */
export async function fetchDbnomicsSeries(
  providerCode: string,
  datasetCode: string,
  seriesCode: string,
  opts: { hostState?: Map<string, number> } = {},
): Promise<DbnSeries> {
  const apiUrl = dbnomicsSeriesApiUrl(providerCode, datasetCode, seriesCode);
  const data = (await fetchJson(apiUrl, { ttlSeconds: 21600, hostState: opts.hostState })) as {
    provider?: { name?: string };
    dataset?: { code?: string; name?: string };
    series?: { docs?: DbnDoc[] };
    message?: string;
  };
  const docs = data.series?.docs ?? [];
  if (docs.length === 0) {
    throw new ToolError(
      `No DBnomics series found for ${providerCode}/${datasetCode}/${seriesCode}. Check the series code (browse at https://db.nomics.world/${providerCode}).`,
      { provider: providerCode, dataset: datasetCode, series: seriesCode },
    );
  }
  const exact = docs.find((d) => d.series_code === seriesCode);
  const doc =
    exact ??
    [...docs].sort((a, b) => a.series_code.length - b.series_code.length).find((d) => d.series_code.startsWith(seriesCode)) ??
    docs[0];

  const observations: Observation[] = doc.period.map((p, i) => {
    const raw = doc.value[i];
    const v =
      typeof raw === "number"
        ? raw
        : raw == null || raw === "NA" || (typeof raw === "string" && raw.trim() === "")
          ? null
          : Number(raw);
    return { period: p, value: v == null || Number.isNaN(v) ? null : v };
  });

  return {
    providerCode: doc.provider_code,
    providerName: data.provider?.name ?? doc.provider_code,
    datasetCode: data.dataset?.code ?? doc.dataset_code,
    datasetName: data.dataset?.name ?? doc.dataset_name,
    seriesCode: doc.series_code,
    seriesName: doc.series_name,
    frequency: doc["@frequency"],
    observations,
    apiUrl,
  };
}

/** One requested series in a multi-series call, and what DBnomics returned
 * for it. `doc` is absent when DBnomics returned no series under that exact
 * code, and `error` carries DBnomics's own per-dataset error when it gave one
 * (for example "Could not load dataset" for WEO:2011-10, verified 2026-11-28). */
export interface DbnMultiItem {
  datasetCode: string;
  seriesCode: string;
  series?: Omit<DbnSeries, "apiUrl">;
  error?: string;
}

/**
 * Fetch several exact series in ONE call through the v22 `/series?series_ids=`
 * endpoint, which accepts ids across datasets (verified live 2026-11-28 with
 * three WEO editions in one request). Used by the lab revision records so that
 * thirty-odd dated WEO editions cost one upstream request, not thirty.
 * Matching is by exact code only: no prefix fallback, so a missing edition can
 * never be answered by a neighbouring series.
 *
 * `metadata=false` drops the per-dataset dimension labels, which were most of
 * the body. Live on 2026-11-28, the 36-edition USA gdp_growth request returned
 * 278,180 bytes without it and 55,043 bytes with it, each doc still carrying
 * period, value, dataset_name and series_name. The parameter echo in `_meta`
 * lists the others v22 accepts here (align_periods, facets, format, limit,
 * offset, observations), and an unknown one such as `fields` is a 400, so no
 * further cut is available. The body then carries no provider block, so the
 * caller may pass the provider's name.
 */
export async function fetchDbnomicsMulti(
  providerCode: string,
  ids: Array<{ datasetCode: string; seriesCode: string }>,
  opts: { hostState?: Map<string, number>; providerName?: string } = {},
): Promise<{ items: DbnMultiItem[]; apiUrl: string }> {
  const list = ids.map((i) => `${providerCode}/${i.datasetCode}/${i.seriesCode}`).join(",");
  const apiUrl = `${BASE}/series?series_ids=${encodeURIComponent(list)}&observations=1&metadata=false&limit=1000`;
  const data = (await fetchJson(apiUrl, {
    ttlSeconds: 21600,
    hostState: opts.hostState,
    validate: (d) => Boolean(d && typeof d === "object" && Array.isArray((d as any).series?.docs)),
  })) as {
    providers?: Record<string, { name?: string }>;
    datasets?: Record<string, { code?: string; name?: string }>;
    series?: { docs?: DbnDoc[] };
    errors?: Array<{ dataset_code?: string; series_code?: string | null; message?: string }>;
  };
  const docs = data.series?.docs ?? [];
  const errors = data.errors ?? [];
  const providerName = data.providers?.[providerCode]?.name ?? opts.providerName ?? providerCode;
  const items = ids.map((i): DbnMultiItem => {
    const doc = docs.find((d) => d.provider_code === providerCode && d.dataset_code === i.datasetCode && d.series_code === i.seriesCode);
    const err = errors.find((e) => e.dataset_code === i.datasetCode && (e.series_code == null || e.series_code === i.seriesCode));
    if (!doc) return { ...i, ...(err?.message ? { error: err.message } : {}) };
    const observations: Observation[] = doc.period.map((p, k) => {
      const raw = doc.value[k];
      const v =
        typeof raw === "number"
          ? raw
          : raw == null || raw === "NA" || (typeof raw === "string" && raw.trim() === "")
            ? null
            : Number(raw);
      return { period: p, value: v == null || Number.isNaN(v) ? null : v };
    });
    return {
      ...i,
      series: {
        providerCode: doc.provider_code,
        providerName,
        datasetCode: doc.dataset_code,
        datasetName: data.datasets?.[`${providerCode}/${doc.dataset_code}`]?.name ?? doc.dataset_name,
        seriesCode: doc.series_code,
        seriesName: doc.series_name,
        frequency: doc["@frequency"],
        observations,
      },
    };
  });
  return { items, apiUrl };
}

export interface DbnDatasetHit {
  providerCode: string;
  providerName: string;
  datasetCode: string;
  datasetName: string;
  nbSeries: number;
  url: string;
}

/** Full-text search across DBnomics datasets (secondary discovery aid). */
export async function searchDbnomicsDatasets(query: string, limit = 5): Promise<DbnDatasetHit[]> {
  const apiUrl = `${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const data = (await fetchJson(apiUrl, { ttlSeconds: 86400 })) as {
    results?: { docs?: Array<{ provider_code: string; provider_name: string; code: string; name: string; nb_series: number }> };
  };
  return (data.results?.docs ?? []).map((d) => ({
    providerCode: d.provider_code,
    providerName: d.provider_name,
    datasetCode: d.code,
    datasetName: d.name,
    nbSeries: d.nb_series,
    url: `https://db.nomics.world/${d.provider_code}/${encodeURIComponent(d.code)}`,
  }));
}
