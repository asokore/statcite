// Shared IMF DataMapper fixture builders for tests. Real payloads carry
// 150-229 country keys and 130+ metadata entries — datamapper.ts's shape
// validation (MIN_COUNTRY_KEYS=150, >50 metadata entries) rejects anything
// smaller, so these builders pad with filler entries rather than shipping
// giant static JSON files.

export function dmValuesBody(code: string, real: Record<string, Record<string, number>>): string {
  const values: Record<string, Record<string, number>> = { ...real };
  for (let i = 0; i < 160; i++) {
    const key = `Z${String(i).padStart(3, "0")}`;
    if (!values[key]) values[key] = { "2024": 1.0 };
  }
  return JSON.stringify({ values: { [code]: values }, api: { version: "1", "output-method": "json" } });
}

export interface DmMetaEntry {
  label: string;
  source: string; // verbatim edition string, e.g. "World Economic Outlook (April 2026)"
  dataset: "WEO" | "FM";
  lastModified?: string;
}

export function dmMetadataBody(entries: Record<string, DmMetaEntry>): string {
  const indicators: Record<string, unknown> = {};
  for (const [code, e] of Object.entries(entries)) {
    indicators[code] = {
      label: e.label,
      description: "Test indicator.",
      source: e.source,
      unit: "percent",
      dataset: e.dataset,
      "last-modified": e.lastModified ?? "2026-04-08 16:07:34",
    };
  }
  for (let i = 0; i < 60; i++) {
    const key = `FILLER${i}`;
    if (!indicators[key]) {
      indicators[key] = {
        label: "Filler indicator",
        description: "Filler.",
        source: "Filler Dataset (April 2026)",
        unit: "x",
        dataset: "WEO",
        "last-modified": "2026-04-08 16:07:34",
      };
    }
  }
  return JSON.stringify({ indicators, api: { version: "1", "output-method": "json" } });
}

/** The 6 WEO/FM-backed indicator codes + a standard April-2026 metadata table
 * matching them, reused across test files so route tables stay short. */
export const DM_CODES = {
  gdp_growth: "NGDP_RPCH",
  current_account_gdp: "BCA_NGDPD",
  govt_debt_gdp: "GGXWDG_NGDP",
  fiscal_balance_gdp: "GGXCNL_NGDP",
  govt_revenue_gdp: "GGR_G01_GDP_PT",
  govt_expenditure_gdp: "G_X_G01_GDP_PT",
} as const;

export const STANDARD_DM_METADATA = dmMetadataBody({
  NGDP_RPCH: { label: "Real GDP growth", source: "World Economic Outlook (April 2026)", dataset: "WEO" },
  BCA_NGDPD: { label: "Current account balance, percent of GDP", source: "World Economic Outlook (April 2026)", dataset: "WEO" },
  GGXWDG_NGDP: { label: "General government gross debt", source: "World Economic Outlook (April 2026)", dataset: "WEO" },
  GGXCNL_NGDP: { label: "General government net lending/borrowing", source: "World Economic Outlook (April 2026)", dataset: "WEO" },
  GGR_G01_GDP_PT: { label: "Revenue", source: "Fiscal Monitor (April 2026)", dataset: "FM" },
  G_X_G01_GDP_PT: { label: "Expenditure", source: "Fiscal Monitor (April 2026)", dataset: "FM" },
});

export function isDataMapperValuesUrl(url: string, code: string): boolean {
  return url.includes("imf.org/external/datamapper/api/v1/") && url.endsWith(`/v1/${code}`);
}

export function isDataMapperMetadataUrl(url: string): boolean {
  return url.includes("imf.org/external/datamapper/api/v1/indicators");
}
