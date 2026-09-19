// World Bank Indicators API v2 adapter.
// Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392

import { fetchJson } from "../core/upstream.ts";
import { ToolError } from "../core/types.ts";
import type { Observation } from "../core/types.ts";

const BASE = "https://api.worldbank.org/v2";

interface WbRow {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
  obs_status?: string;
}

export interface WbSeries {
  indicatorId: string;
  indicatorName: string;
  countryIso3: string;
  countryName: string;
  observations: Observation[]; // ascending by period
  lastUpdated?: string;
  apiUrl: string;
}

function parseEnvelope(
  data: unknown,
  apiUrl: string,
  ctx: { countryCode?: string; indicatorId?: string; countryUnverified?: boolean } = {},
): { meta: Record<string, unknown>; rows: WbRow[] } {
  if (!Array.isArray(data)) throw new ToolError("World Bank API returned an unexpected payload", { api_url: apiUrl });
  const first = data[0] as Record<string, unknown> | undefined;
  if (first && Array.isArray((first as { message?: unknown[] }).message)) {
    const msgs = (first as { message: Array<{ key?: string; value?: string }> }).message;
    const text = msgs.map((m) => `${m.key ?? ""}: ${m.value ?? ""}`).join("; ");
    // An economy the World Bank does not report at all comes back as a
    // PARAMETER-VALIDATION error ("Invalid value: The provided parameter value
    // is not valid"), not as an empty result set. Passed through raw that reads
    // as a StatCite fault, and it is inconsistent with the sibling case: on
    // 2026-08-10 Anguilla returned a clean "no data found" while Montserrat —
    // in exactly the same situation, neither is a WB reporting economy —
    // surfaced the raw upstream string. Both are the same COVERAGE FACT and
    // must carry the same honest-absence contract, so a caller can distinguish
    // "the source does not publish this" from "our request was malformed".
    if (/invalid value/i.test(text) || /not valid/i.test(text)) {
      // The SAME upstream string means two different things depending on
      // whether the code names a real economy. For a known economy it is a
      // coverage fact. For a code we never recognised it is simply not a
      // country, and reporting it as coverage invents a country and then
      // reports on it.
      if (ctx.countryUnverified) {
        throw new ToolError(
          `'${ctx.countryCode ?? "(unknown)"}' was not recognised as a country or economy, and the World Bank rejected it as an unknown code. Use an ISO3 code (e.g. USA, BRB, DEU) or a standard English name.`,
          { api_url: apiUrl, country: ctx.countryCode, unknown_country: true },
        );
      }
      const err = new ToolError(
        `The World Bank does not publish indicator ${ctx.indicatorId ?? "(unknown)"} for '${ctx.countryCode ?? "(unknown)"}'. This is a coverage fact at the source, not a lookup failure, some economies (e.g. Anguilla, Montserrat) are not World Bank reporting economies at all.`,
        { api_url: apiUrl, no_published_data: true, country: ctx.countryCode, indicator: ctx.indicatorId },
      );
      // The same refusal also comes back for an unknown indicator code, so a
      // caller that supplied the code can check which one it was.
      (err as ToolError & { wbParameterRefusal?: boolean }).wbParameterRefusal = true;
      throw err;
    }
    throw new ToolError(`World Bank API error, ${text}`, { api_url: apiUrl });
  }
  const rows = (data[1] ?? []) as WbRow[];
  // Keep only rows with the fields the adapters dereference. A malformed row
  // used to throw a TypeError and surface as a 500. Genuine WDI rows always
  // carry these, so nothing legitimate is dropped.
  const usable = Array.isArray(rows)
    ? rows.filter((r) => r && typeof r === "object" && typeof r.date === "string" && typeof r.indicator?.id === "string" && r.country && typeof r.country === "object")
    : [];
  return { meta: first ?? {}, rows: usable };
}

/** True only when the World Bank's indicator endpoint positively refuses the
 * code. Any other outcome, including a failed check, returns false so the
 * caller keeps the coverage answer rather than inventing a typo. */
async function wbIndicatorIsUnknown(indicatorId: string): Promise<boolean> {
  try {
    const d = await fetchJson(`${BASE}/indicator/${encodeURIComponent(indicatorId)}?format=json`, { ttlSeconds: 86400 });
    const first = Array.isArray(d) ? (d[0] as { message?: Array<{ id?: string; key?: string }> } | undefined) : undefined;
    return Boolean(first?.message?.some((m) => m.id === "120" || /invalid value/i.test(m.key ?? "")));
  } catch {
    return false;
  }
}

/** Fetch one indicator for one country (ascending observations). */
export async function fetchWbSeries(
  countryCode: string,
  indicatorId: string,
  opts: { perPage?: number; mrv?: number; countryUnverified?: boolean; checkIndicatorOnRefusal?: boolean; hostState?: Map<string, number> } = {},
): Promise<WbSeries> {
  const params = new URLSearchParams({ format: "json", per_page: String(opts.perPage ?? 1000) });
  if (opts.mrv) params.set("mrv", String(opts.mrv));
  const apiUrl = `${BASE}/country/${encodeURIComponent(countryCode)}/indicator/${encodeURIComponent(indicatorId)}?${params}`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 21600, hostState: opts.hostState });
  let parsed: ReturnType<typeof parseEnvelope>;
  try {
    parsed = parseEnvelope(data, apiUrl, { countryCode, indicatorId, countryUnverified: opts.countryUnverified });
  } catch (e) {
    if (opts.checkIndicatorOnRefusal && (e as { wbParameterRefusal?: boolean }).wbParameterRefusal) {
      if (await wbIndicatorIsUnknown(indicatorId)) {
        throw new ToolError(
          `Unknown World Bank indicator code '${indicatorId}'. The World Bank does not recognise it, so this is not a coverage gap. Check the code at https://data.worldbank.org/indicator, or find a registry key with search_indicators.`,
          { indicator: indicatorId, unknown_indicator: true, api_url: `${BASE}/indicator/${encodeURIComponent(indicatorId)}?format=json` },
        );
      }
    }
    throw e;
  }
  const { meta, rows } = parsed;
  if (rows.length === 0) {
    throw new ToolError(
      `No World Bank data found for indicator ${indicatorId}, country ${countryCode}. The indicator code or country may be wrong, or the series may not be reported for this economy.`,
      // Same honest-absence contract as the parameter-validation path above:
      // both mean "the source publishes nothing here", and a caller must not
      // have to parse prose to tell them apart.
      { indicator: indicatorId, country: countryCode, no_published_data: true },
    );
  }
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return {
    indicatorId: sorted[0].indicator.id,
    indicatorName: sorted[0].indicator.value,
    countryIso3: sorted[0].countryiso3code || countryCode.toUpperCase(),
    countryName: sorted[0].country.value,
    observations: sorted.map((r) => ({ period: r.date, value: r.value })),
    lastUpdated: typeof meta.lastupdated === "string" ? meta.lastupdated : undefined,
    apiUrl,
  };
}

/**
 * Fetch several indicators for one country in a single request
 * (semicolon-joined ids require an explicit source=2 for WDI).
 */
export async function fetchWbMulti(
  countryCode: string,
  indicatorIds: string[],
  opts: { mrv?: number; hostState?: Map<string, number> } = {},
): Promise<Map<string, WbSeries>> {
  const params = new URLSearchParams({ format: "json", source: "2", per_page: "2000" });
  if (opts.mrv) params.set("mrv", String(opts.mrv));
  const joined = indicatorIds.map(encodeURIComponent).join(";");
  const apiUrl = `${BASE}/country/${encodeURIComponent(countryCode)}/indicator/${joined}?${params}`;
  const data = await fetchJson(apiUrl, { ttlSeconds: 21600, hostState: opts.hostState });
  const { meta, rows } = parseEnvelope(data, apiUrl, { countryCode, indicatorId: indicatorIds.join(";") });
  const out = new Map<string, WbSeries>();
  for (const r of rows) {
    const id = r.indicator.id;
    let s = out.get(id);
    if (!s) {
      s = {
        indicatorId: id,
        indicatorName: r.indicator.value,
        countryIso3: r.countryiso3code || countryCode.toUpperCase(),
        countryName: r.country.value,
        observations: [],
        lastUpdated: typeof meta.lastupdated === "string" ? meta.lastupdated : undefined,
        apiUrl,
      };
      out.set(id, s);
    }
    s.observations.push({ period: r.date, value: r.value });
  }
  for (const s of out.values()) s.observations.sort((a, b) => a.period.localeCompare(b.period));
  return out;
}
