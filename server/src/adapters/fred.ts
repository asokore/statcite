// FRED adapter (optional — requires FRED_API_KEY secret).
// Per FRED terms the key identifies THIS deployment's operator; the required
// disclaimer notice is attached to every FRED citation in citations.ts.

import { fetchJson } from "../core/upstream.ts";
import { ToolError } from "../core/types.ts";
import type { Ctx, Observation } from "../core/types.ts";

const BASE = "https://api.stlouisfed.org/fred";

export interface FredSeries {
  seriesId: string;
  seriesName: string;
  units?: string;
  frequency?: string;
  observations: Observation[];
  apiUrl: string;
}

export function fredAvailable(ctx: Ctx): boolean {
  return Boolean(ctx.fredApiKey);
}

function requireKey(ctx: Ctx): string {
  if (!ctx.fredApiKey) {
    throw new ToolError(
      "FRED series require this server to be configured with a FRED_API_KEY (free from https://fredaccount.stlouisfed.org/apikeys). " +
        "Cross-country equivalents are available without FRED: try the `worldbank/...` series or a registry indicator key instead.",
    );
  }
  return ctx.fredApiKey;
}

export async function fetchFredSeries(
  ctx: Ctx,
  seriesId: string,
  opts: { start?: string; end?: string } = {},
): Promise<FredSeries> {
  const key = requireKey(ctx);
  const id = seriesId.toUpperCase();

  const metaUrl = `${BASE}/series?series_id=${encodeURIComponent(id)}&api_key=${key}&file_type=json`;
  const meta = (await fetchJson(metaUrl, { ttlSeconds: 86400 })) as {
    seriess?: Array<{ id: string; title: string; units: string; frequency: string }>;
    error_message?: string;
  };
  const info = meta.seriess?.[0];
  if (!info) {
    throw new ToolError(`FRED series '${id}' not found${meta.error_message ? ` (${meta.error_message})` : ""}.`, {
      series: id,
    });
  }

  const params = new URLSearchParams({ series_id: id, api_key: key, file_type: "json" });
  if (opts.start) params.set("observation_start", opts.start.length === 4 ? `${opts.start}-01-01` : opts.start);
  if (opts.end) params.set("observation_end", opts.end.length === 4 ? `${opts.end}-12-31` : opts.end);
  const obsUrl = `${BASE}/series/observations?${params}`;
  const data = (await fetchJson(obsUrl, { ttlSeconds: 21600 })) as {
    observations?: Array<{ date: string; value: string }>;
  };
  const observations: Observation[] = (data.observations ?? []).map((o) => ({
    period: o.date,
    value: o.value === "." ? null : Number(o.value),
  }));

  return {
    seriesId: info.id,
    seriesName: info.title,
    units: info.units,
    frequency: info.frequency,
    observations,
    apiUrl: obsUrl,
  };
}
