// FRED adapter — permanently disabled (2026-07-26).
// FRED's Terms of Use (updated June 2024) prohibit both (1) using FRED content
// in connection with development or training of AI/ML/LLM/generative-AI systems,
// and (2) storing/caching FRED content or serving cached/archived content to
// third parties. StatCite is an AI-agent-facing MCP/REST service that edge-caches
// every response, so there is no compliant way to serve FRED through it — not
// even operator-key-gated. Do not re-enable by wiring ctx.fredApiKey back in
// here without re-reading the current ToU; the disable is a policy decision,
// not a missing-credential state.

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

export function fredAvailable(_ctx: Ctx): boolean {
  return false;
}

function requireKey(_ctx: Ctx): string {
  throw new ToolError(
    "FRED series are disabled on this server: FRED's terms of use prohibit AI/ML use and caching/redistribution of its content, which conflicts with how StatCite serves data. " +
      "Cross-country equivalents are available without FRED: try the `worldbank/...` series or a registry indicator key instead.",
  );
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
