// verify_stat — check a claimed economic figure against the official series.
// The differentiating tool: verdict + diagnosis + canonical citation.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { getIndicator, getSeries } from "./series.ts";
import { getIndicatorDef } from "./indicators.ts";

export type Verdict = "match" | "close" | "mismatch" | "cannot_verify";

export interface VerifyResult {
  verdict: Verdict;
  claimed_value: number;
  official_value: number | null;
  period: string;
  difference: number | null;
  relative_difference_pct: number | null;
  explanation: string;
  diagnostics: string[];
  series: { id: string; name: string; unit?: string };
  country?: { iso3: string; name: string };
  citation: Citation;
  notes: string[];
}

interface VerifyParams {
  indicator: string;
  country?: string;
  period: string; // "2024" (annual) — the dominant case for macro claims
  claimed_value: number;
  /** Absolute tolerance in the series' own units (e.g. percentage points for rates). */
  tolerance_abs?: number;
  /** Relative tolerance in percent (levels default: 0.5 match / 5 close). */
  tolerance_pct?: number;
}

function isPercentKind(indicatorKey: string): boolean {
  const def = getIndicatorDef(indicatorKey);
  return def ? def.kind === "percent" : false;
}

export async function verifyStat(ctx: Ctx, p: VerifyParams): Promise<VerifyResult> {
  if (!Number.isFinite(p.claimed_value)) throw new ToolError("'claimed_value' must be a number.");
  if (!/^\d{4}([QM-]?\d{0,2})?$/i.test(p.period.trim())) {
    throw new ToolError("'period' should be a year like '2024' (or a period label matching the series, e.g. '2024-05').", {
      period: p.period,
    });
  }
  const period = p.period.trim();
  const year = parseInt(period.slice(0, 4), 10);

  // Resolve the official series (registry key or explicit series id).
  const isRegistry = Boolean(getIndicatorDef(p.indicator));
  if (isRegistry && !p.country) {
    throw new ToolError(`Indicator '${p.indicator}' needs a 'country' (ISO3 code or name) to verify against.`);
  }
  const result = isRegistry
    ? await getIndicator(ctx, p.indicator, p.country ?? "", {})
    : await getSeries(ctx, p.indicator, { country: p.country });

  const obs = result.observations;
  const byPeriod = new Map(obs.map((o) => [o.period, o.value]));
  let exact = byPeriod.get(period) ?? (period.length > 4 ? undefined : byPeriod.get(String(year)));
  if (exact == null && period.length >= 6) {
    // Higher-frequency series label periods as dates ("2024-05-01"); accept "2024-05" prefixes.
    const hit = obs.find((o) => o.period.startsWith(period) && o.value != null);
    if (hit) exact = hit.value;
  }

  const diagnostics: string[] = [];
  const notes = [...result.notes];
  notes.push(
    "Macro data is revised: the official value reflects the source's current published figure, which may differ from what was published at the time of the claim.",
  );

  const percentKind = isRegistry ? isPercentKind(p.indicator) : /%|percent/i.test(result.unit ?? result.name);

  if (exact == null) {
    // Look for nearby periods to explain what we *do* have (capped for readability).
    const near = obs.filter((o) => Math.abs(parseInt(o.period.slice(0, 4), 10) - year) <= 2 && o.value != null).slice(-6);
    const range = obs.length ? `${obs[0].period}–${obs[obs.length - 1].period}` : "none";
    const freqHint =
      obs.some((o) => o.period.length > 4) && period.length === 4
        ? " This series is higher-frequency — specify the period as YYYY-MM."
        : "";
    return {
      verdict: "cannot_verify",
      claimed_value: p.claimed_value,
      official_value: null,
      period,
      difference: null,
      relative_difference_pct: null,
      explanation:
        `No official observation for ${period} in ${result.series_id}` +
        `${result.country ? ` (${result.country.name})` : ""}. Available range: ${range}.` +
        (near.length ? ` Nearby values: ${near.map((o) => `${o.period}: ${fmt(o.value!)}`).join(", ")}.` : "") +
        freqHint,
      diagnostics,
      series: { id: result.series_id, name: result.name, unit: result.unit },
      country: result.country,
      citation: result.citation,
      notes,
    };
  }

  const official = exact;
  const diff = p.claimed_value - official;
  const relPct = official !== 0 ? (diff / Math.abs(official)) * 100 : null;

  // Diagnostics for classic errors.
  const ratio = official !== 0 ? p.claimed_value / official : null;
  if (ratio != null && ratio > 0) {
    for (const [factor, label] of [
      [100, "a percent-vs-decimal mix-up (e.g. 0.05 vs 5%)"],
      [1000, "a thousands scaling difference"],
      [1e6, "a millions scaling difference"],
      [1e9, "a billions scaling difference"],
    ] as Array<[number, string]>) {
      if (within(ratio, factor, 0.02) || within(ratio, 1 / factor, 0.02)) {
        diagnostics.push(`The claimed value is ~${factor.toLocaleString("en-US")}× ${ratio > 1 ? "larger" : "smaller"} than the official figure — possibly ${label}.`);
      }
    }
  }
  // Adjacent-year check: does the claim match a neighboring year better?
  for (const offset of [-2, -1, 1, 2]) {
    const v = byPeriod.get(String(year + offset));
    if (v != null && closeEnough(p.claimed_value, v, percentKind, p)) {
      diagnostics.push(`The claimed value matches the ${year + offset} figure (${fmt(v)}) — the year may be misattributed.`);
    }
  }

  const { verdict, why } = judge(p.claimed_value, official, percentKind, p);
  const unitText = result.unit ? ` ${result.unit}` : "";
  const explanation =
    verdict === "match"
      ? `Claimed ${fmt(p.claimed_value)} vs official ${fmt(official)}${unitText} for ${period} — consistent (${why}).`
      : verdict === "close"
        ? `Claimed ${fmt(p.claimed_value)} vs official ${fmt(official)}${unitText} for ${period} — in the right neighborhood but not exact (${why}). Cite the official value.`
        : `Claimed ${fmt(p.claimed_value)} vs official ${fmt(official)}${unitText} for ${period} — materially different (${why}).` +
          (diagnostics.length ? " See diagnostics for likely causes." : "");

  return {
    verdict,
    claimed_value: p.claimed_value,
    official_value: official,
    period,
    difference: Number(diff.toFixed(6)),
    relative_difference_pct: relPct == null ? null : Number(relPct.toFixed(3)),
    explanation,
    diagnostics,
    series: { id: result.series_id, name: result.name, unit: result.unit },
    country: result.country,
    citation: result.citation,
    notes,
  };
}

function within(x: number, target: number, tolFrac: number): boolean {
  return Math.abs(x - target) / target <= tolFrac;
}

function closeEnough(claimed: number, official: number, percentKind: boolean, p: VerifyParams): boolean {
  return judge(claimed, official, percentKind, p).verdict !== "mismatch";
}

function judge(
  claimed: number,
  official: number,
  percentKind: boolean,
  p: VerifyParams,
): { verdict: Exclude<Verdict, "cannot_verify">; why: string } {
  const absDiff = Math.abs(claimed - official);
  if (absDiff === 0) return { verdict: "match", why: "exact match" };
  if (official === 0) {
    // No meaningful relative difference against a zero official value.
    return absDiff <= 0.05
      ? { verdict: "close", why: `official value is 0; claimed ${claimed}` }
      : { verdict: "mismatch", why: `official value is 0; claimed ${claimed}` };
  }
  const relDiff = Math.abs(claimed - official) / Math.abs(official);

  if (p.tolerance_abs != null || p.tolerance_pct != null) {
    const okAbs = p.tolerance_abs != null && absDiff <= p.tolerance_abs;
    const okRel = p.tolerance_pct != null && relDiff * 100 <= p.tolerance_pct;
    if (okAbs || okRel) return { verdict: "match", why: "within your specified tolerance" };
    const nearAbs = p.tolerance_abs != null && absDiff <= p.tolerance_abs * 3;
    const nearRel = p.tolerance_pct != null && relDiff * 100 <= p.tolerance_pct * 3;
    if (nearAbs || nearRel) return { verdict: "close", why: "within 3× your specified tolerance" };
    return { verdict: "mismatch", why: "outside your specified tolerance" };
  }

  if (percentKind) {
    // Rates in percentage points: rounding to 1 decimal is normal in prose.
    if (absDiff <= 0.06) return { verdict: "match", why: `difference of ${absDiff.toFixed(3)} pp is within normal rounding` };
    if (absDiff <= 0.3) return { verdict: "close", why: `difference of ${absDiff.toFixed(2)} pp` };
    return { verdict: "mismatch", why: `difference of ${absDiff.toFixed(2)} percentage points` };
  }
  if (relDiff <= 0.005) return { verdict: "match", why: `relative difference ${(relDiff * 100).toFixed(2)}% is within normal rounding` };
  if (relDiff <= 0.05) return { verdict: "close", why: `relative difference ${(relDiff * 100).toFixed(1)}%` };
  return { verdict: "mismatch", why: `relative difference ${(relDiff * 100).toFixed(1)}%` };
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1e6) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
