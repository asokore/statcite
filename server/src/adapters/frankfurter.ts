// Frankfurter adapter — ECB euro foreign exchange reference rates.
// Canonical host is api.frankfurter.dev (the .app host 301-redirects).

import { fetchJson } from "../core/upstream.ts";
import { ToolError } from "../core/types.ts";

const BASE = "https://api.frankfurter.dev/v1";

export interface EcbRateResult {
  base: string;
  date: string; // actual working day the rate refers to
  rates: Record<string, number>;
  apiUrl: string;
}

export async function listEcbCurrencies(): Promise<Record<string, string>> {
  return (await fetchJson(`${BASE}/currencies`, { ttlSeconds: 86400 })) as Record<string, string>;
}

/**
 * Rate(s) for a base currency. `date` = YYYY-MM-DD for historical (>= 1999-01-04),
 * otherwise latest. Frankfurter snaps to the nearest previous working day.
 */
export async function getEcbRates(base: string, symbols: string[], date?: string): Promise<EcbRateResult> {
  if (date && date < "1999-01-04") {
    throw new ToolError(
      "ECB reference rates begin on 1999-01-04. For earlier periods use annual official rates (World Bank series PA.NUS.FCRF).",
      { requested_date: date },
    );
  }
  const path = date ? `/${date}` : "/latest";
  const apiUrl = `${BASE}${path}?base=${encodeURIComponent(base)}&symbols=${symbols.map(encodeURIComponent).join(",")}`;
  const data = (await fetchJson(apiUrl, { ttlSeconds: date ? 604800 : 1800 })) as {
    base?: string;
    date?: string;
    rates?: Record<string, number>;
  };
  if (!data.rates || !data.date) {
    throw new ToolError("Frankfurter returned an unexpected payload", { api_url: apiUrl });
  }
  return { base: data.base ?? base, date: data.date, rates: data.rates, apiUrl };
}

/** Annual average of ECB daily reference rates for one year (one range request). */
export async function getEcbAnnualAverage(
  base: string,
  symbol: string,
  year: number,
): Promise<{ average: number; days: number; apiUrl: string }> {
  if (year < 1999) {
    throw new ToolError("ECB reference rates begin in 1999; earlier years use World Bank annual official rates.", { year });
  }
  const apiUrl = `${BASE}/${year}-01-01..${year}-12-31?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(symbol)}`;
  const data = (await fetchJson(apiUrl, { ttlSeconds: 604800 })) as {
    rates?: Record<string, Record<string, number>>;
  };
  const days = Object.values(data.rates ?? {});
  const values = days.map((d) => d[symbol]).filter((v) => typeof v === "number");
  if (values.length === 0) {
    throw new ToolError(`No ECB daily rates found for ${base}/${symbol} in ${year}.`, { year });
  }
  return { average: values.reduce((a, b) => a + b, 0) / values.length, days: values.length, apiUrl };
}
