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

/**
 * Fetch a series. `seriesCode` may be a full code or a prefix (DBnomics matches
 * by mask); when several docs match, the exact code wins, then the shortest.
 */
export async function fetchDbnomicsSeries(
  providerCode: string,
  datasetCode: string,
  seriesCode: string,
): Promise<DbnSeries> {
  const apiUrl = `${BASE}/series/${encodeURIComponent(providerCode)}/${encodeURIComponent(datasetCode)}/${encodeURIComponent(seriesCode)}?observations=1`;
  const data = (await fetchJson(apiUrl, { ttlSeconds: 21600 })) as {
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
