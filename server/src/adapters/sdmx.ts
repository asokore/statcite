// SDMX-JSON adapter — BIS (stats.bis.org) and the ECB Data Portal.
//
// Both speak SDMX-JSON, but NOT the same generation, and the differences are
// exactly the kind that produce silently-wrong numbers rather than errors:
//
//   BIS  : SDMX-JSON 2.0 style — data lives under a `data` envelope, and
//          observation values arrive as STRINGS ("3.625").
//   ECB  : SDMX-JSON 1.0.0-wd — no envelope, values arrive as NUMBERS (2.25).
//
// In both, an `observations` map is keyed by STRINGIFIED INDICES into
// structure.dimensions.observation[0].values — not by period labels. The map
// can be sparse, so we iterate its entries and index into the period array
// rather than walking the array positionally.
//
// Two upstream behaviours this file defends against, both verified live
// 2026-08-08:
//  1. The ECB returns HTTP 200 with SDMX **XML** when the format parameter is
//     missing or misspelled — a typo would otherwise reach JSON.parse and throw
//     from inside a handler. We send the format param AND verify the payload
//     shape before trusting it.
//  2. A dataflow can go stale while still returning 200 with well-formed JSON:
//     the ECB's legacy `ICP` flow still served December 2025 inflation in
//     August 2026. Freshness is therefore ASSERTED per response, not assumed,
//     and a stale series carries a disclosure note instead of passing silently.

import { fetchJson } from "../core/upstream.ts";
import type { Observation } from "../core/types.ts";

export type SdmxProvider = "BIS" | "ECB";

/**
 * BIS WS_CBPOL reference areas, ENUMERATED from the dataflow itself
 * (2026-08-08) and keyed by StatCite ISO3 — never by assuming the BIS code
 * equals the country's ISO2.
 *
 * That assumption produced live wrong data: BIS uses `XM` for the EURO AREA,
 * while StatCite's country table uses `XM` as the ISO2 of "Low income
 * countries" (the euro area is `XC` there). Blind substitution therefore
 * served the ECB's policy rate under the label "Low income countries", and
 * made the real euro-area query 404. An explicit allowlist fixes both and
 * doubles as the published coverage list: an economy absent here returns an
 * honest no-published-data response instead of a 404 from upstream — or, far
 * worse, a coincidental hit on a different entity.
 */
export const BIS_POLICY_RATE_AREAS: Readonly<Record<string, string>> = {
  ARG: "AR", AUS: "AU", AUT: "AT", BEL: "BE", BRA: "BR", CAN: "CA", CHE: "CH",
  CHL: "CL", CHN: "CN", COL: "CO", CZE: "CZ", DEU: "DE", DNK: "DK", ESP: "ES",
  FRA: "FR", GBR: "GB", GRC: "GR", HKG: "HK", HRV: "HR", HUN: "HU", IDN: "ID",
  IND: "IN", ISL: "IS", ISR: "IL", ITA: "IT", JPN: "JP", KOR: "KR", KWT: "KW",
  MAR: "MA", MEX: "MX", MKD: "MK", MYS: "MY", NLD: "NL", NOR: "NO", NZL: "NZ",
  PER: "PE", PHL: "PH", POL: "PL", PRT: "PT", ROU: "RO", RUS: "RU", SAU: "SA",
  SRB: "RS", SWE: "SE", THA: "TH", TUR: "TR", USA: "US", ZAF: "ZA",
  // The euro area: BIS "XM", StatCite ISO3 "EMU". This single line is the bug fix.
  EMU: "XM",
};

export interface SdmxSeries {
  observations: Observation[];
  /** Human name of the flow, from the payload's own structure block. */
  name?: string;
  /** The exact URL called, for the citation's api_url. */
  apiUrl: string;
  /** Set when the newest observation is older than the freshness budget for
   * this frequency — a 200 with stale data is the failure mode that hides. */
  stalenessNote?: string;
}

function buildUrl(provider: SdmxProvider, flow: string, key: string, lastN: number): string {
  return provider === "BIS"
    ? // The documented contract is the Accept header; `format=sdmx-json` also
      // works but appears nowhere in the official OpenAPI spec, so it could
      // vanish without notice. We send both: the header is authoritative.
      `https://stats.bis.org/api/v2/data/dataflow/BIS/${flow}/1.0/${key}?lastNObservations=${lastN}&format=sdmx-json`
    : `https://data-api.ecb.europa.eu/service/data/${flow}/${key}?format=jsondata&lastNObservations=${lastN}`;
}

/** Months of tolerated lag before a series is called stale, by frequency
 * letter. Monthly official statistics routinely lag 1-2 months; a daily
 * policy-rate series more than ~2 months old means the flow has stopped. */
function stalenessBudgetMonths(freq: string): number {
  return freq === "D" ? 2 : freq === "M" ? 4 : 18;
}

function monthsBetween(latestPeriod: string, now: Date): number {
  const m = latestPeriod.match(/^(\d{4})-?(\d{2})?/);
  if (!m) return 0;
  const y = parseInt(m[1], 10);
  const mo = m[2] ? parseInt(m[2], 10) : 12;
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - mo);
}

export async function fetchSdmxSeries(
  provider: SdmxProvider,
  flow: string,
  key: string,
  opts: { lastN?: number; now?: Date; ttlSeconds?: number } = {},
): Promise<SdmxSeries> {
  const lastN = opts.lastN ?? 60;
  const apiUrl = buildUrl(provider, flow, key, lastN);
  const body = await fetchJson(apiUrl, {
    ttlSeconds: opts.ttlSeconds ?? 3600,
    timeoutMs: 8000,
    // BIS content-negotiates SDMX-JSON ONLY via this vendor media type; with a
    // plain application/json Accept it returns XML with a 200. The URL also
    // carries ?format=sdmx-json, which works but is absent from the published
    // OpenAPI spec — the header is the contractual path, the param the belt.
    ...(provider === "BIS" ? { accept: "application/vnd.sdmx.data+json" } : {}),
    // Shape validation doubles as the XML guard: an XML body never parses to
    // an object carrying these keys, and a 200-with-XML would otherwise be
    // cached and reparsed forever.
    validate: (d) => {
      const root = pickRoot(d);
      return Boolean(root && root.dataSets && root.structure);
    },
  });

  const root = pickRoot(body);
  if (!root) throw new Error(`${provider} returned an unexpected SDMX payload shape for ${flow}/${key}`);

  const periods: Array<{ id: string }> = root.structure?.dimensions?.observation?.[0]?.values ?? [];
  const seriesMap = root.dataSets?.[0]?.series ?? {};
  const first = Object.values(seriesMap)[0] as { observations?: Record<string, unknown[]> } | undefined;
  const obsMap = first?.observations ?? {};

  const observations: Observation[] = Object.entries(obsMap)
    .map(([idx, tuple]) => {
      const period = periods[Number(idx)]?.id;
      const raw = Array.isArray(tuple) ? tuple[0] : undefined;
      // BIS sends strings, the ECB sends numbers — normalize once, here.
      const value = raw == null || raw === "" ? null : Number(raw);
      return { period: period ?? "", value: value != null && Number.isFinite(value) ? value : null };
    })
    .filter((o) => o.period)
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));

  const out: SdmxSeries = {
    observations,
    name: root.structure?.name,
    apiUrl,
  };

  const latest = observations.filter((o) => o.value != null).at(-1);
  if (latest) {
    const lag = monthsBetween(latest.period, opts.now ?? new Date());
    const budget = stalenessBudgetMonths(key.split(".")[0] ?? "M");
    if (lag > budget) {
      out.stalenessNote =
        `Upstream freshness warning: the newest published observation for this ${provider} series is ${latest.period}, ` +
        `about ${lag} months old, beyond the ${budget}-month expectation for its frequency. The source is returning data ` +
        `successfully but may have stopped updating this flow — treat the latest value as possibly superseded and check the provider directly.`;
    }
  }
  return out;
}

/** BIS wraps everything in `data`; the ECB does not. */
function pickRoot(d: unknown): any {
  if (!d || typeof d !== "object") return undefined;
  const any = d as any;
  if (any.data && any.data.dataSets) return any.data;
  if (any.dataSets) return any;
  return undefined;
}
