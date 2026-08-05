// verify_stat — check a claimed economic figure against the official series.
// The differentiating tool: verdict + diagnosis + canonical citation.

import type { Citation, Ctx } from "./types.ts";
import { ToolError } from "./types.ts";
import { getIndicator, getIndicatorAsOf, getSeries } from "./series.ts";
import { getIndicatorDef } from "./indicators.ts";

export type Verdict = "match" | "close" | "mismatch" | "cannot_verify";

/**
 * Honest classification of the matched official observation.
 * - "actual": the series is one StatCite classifies as outturn data (registry
 *   WB indicators not flagged as modeled, explicit worldbank/ WDI ids) — still
 *   subject to routine revision.
 * - "modeled_estimate": the registry flags this indicator as a modeled series
 *   (e.g. the World Bank's ILO-modeled unemployment and labor-force-participation
 *   estimates) — a published figure, but a model output, never a directly
 *   measured outturn. Added in 1.4.1 (additive enum extension): "actual" was too
 *   strong a claim for these.
 * - "estimate_or_actual": IMF WEO/Fiscal Monitor observation BEFORE the projection
 *   boundary — the IMF's true "latest actual" year varies by country and series and
 *   is not exposed by the data path, so recent pre-boundary values may be IMF staff
 *   estimates rather than confirmed outturns. Never read this as "confirmed actual".
 * - "projection": at/after the heuristic boundary — an IMF estimate/projection.
 * - "unknown": no observation matched the claimed period, OR the series is an
 *   explicit id outside StatCite's classification (arbitrary DBnomics series
 *   can be forecast datasets) — consult the source's own documentation.
 */
export type ObservationStatus = "actual" | "modeled_estimate" | "estimate_or_actual" | "projection" | "unknown";

export interface VerifyResult {
  verdict: Verdict;
  claimed_value: number;
  official_value: number | null;
  /** True when the matched official observation is an IMF WEO/Fiscal Monitor
   * estimate/projection, not a final outturn. Kept for compatibility;
   * observation_status carries the finer-grained classification. */
  is_projection: boolean;
  /** See ObservationStatus. is_projection === (observation_status === "projection"). */
  observation_status: ObservationStatus;
  /** How observation_status was determined: "horizon_heuristic" for IMF WEO/Fiscal
   * Monitor series (boundary derived from the response's own data — the payload's
   * projection horizon on the DataMapper channel, the dataset-code vintage year on
   * the DBnomics channel; a heuristic, not IMF per-country metadata),
   * "as_published" otherwise (World Bank, FRED — or "unknown" status for
   * unclassified explicit series ids). */
  status_method: "horizon_heuristic" | "as_published";
  period: string;
  difference: number | null;
  relative_difference_pct: number | null;
  explanation: string;
  diagnostics: string[];
  series: { id: string; name: string; unit?: string };
  country?: { iso3: string; name: string };
  citation: Citation;
  notes: string[];
  /** Present and true when the official value came from a fallback source because
   * the primary failed. A TRANSIENT primary failure demotes the verdict to
   * cannot_verify (with the fallback value reported as indicative) — a substitute
   * source can differ by definition or vintage far beyond the verdict bands, and
   * the primary may recover and serve a different number for the same query. When
   * the primary permanently lacks the series/country (e.g. Taiwan in WDI), the
   * fallback is that country's stable serving source and the verdict is judged
   * normally with disclosure. Absent otherwise. */
  fallback_used?: boolean;
  /** Present when `as_of` was requested: historical IMF-VINTAGE verification —
   * the verdict was checked against a dated IMF WEO edition, not today's live
   * data. `resolution` is honest about precision: the vintage is resolved with a
   * conservative month calendar (editions flip May 1 / Nov 1), NOT the IMF's
   * exact release days, so a date late in a release month resolves to the
   * previous edition even if the new one already existed (a note says so).
   * `source_changed_for_as_of` is true when the indicator's live primary is a
   * different source (World Bank WDI) or IMF database (Fiscal Monitor) than the
   * WEO archive this verdict was judged against. */
  as_of?: {
    requested: string;
    resolved_vintage: string;
    resolution: "conservative_month_calendar";
    verification_scope: "imf_weo_historical_vintage";
    normal_primary_source: string;
    source_changed_for_as_of: boolean;
  };
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
  /** Reproducibility mode: never verify against a fallback source — error instead. */
  strict_source?: boolean;
  /** Historical IMF-vintage verification: judge the claim against the dated IMF
   * WEO edition resolved from this date — e.g. "2019-04", "2019", "2019-04-15" —
   * instead of today's live data. Resolution is a CONSERVATIVE month calendar
   * (editions flip May 1 / Nov 1), not the IMF's exact release days, and always
   * uses the WEO archive even for indicators whose live primary is another
   * source — both facts are disclosed in the response (as_of.resolution,
   * as_of.source_changed_for_as_of, and notes). Only registry indicators with a
   * dated IMF DBnomics definition support this (see asOfCapableIndicators in
   * series.ts); anything else rejects with advice. */
  as_of?: string;
}

/** Accepts "YYYY", "YYYY-MM", or "YYYY-MM-DD". A bare year resolves to 31 December
 * of that year — "as of the end of 2019" — so it picks up whichever WEO edition
 * (April or October) was the last one published that year. Impossible calendar
 * dates ("2019-02-31", "2019-13-05") are REJECTED, never silently normalized:
 * Date.UTC rolls them over to a different real date, which would resolve a
 * different vintage than the caller asked about. */
function parseAsOfDate(input: string): Date {
  const s = input.trim();
  const reject = (): never => {
    throw new ToolError(
      `'as_of' should be a real calendar date like '2019-04', '2019-04-15', or a bare year '2019' — got '${input}'.`,
      { as_of: input },
    );
  };
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) reject();
    return date;
  }
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const [y, mo] = [+m[1], +m[2]];
    if (mo < 1 || mo > 12) reject();
    return new Date(Date.UTC(y, mo - 1, 1));
  }
  m = /^(\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], 11, 31));
  return reject();
}

function isPercentKind(indicatorKey: string): boolean {
  const def = getIndicatorDef(indicatorKey);
  return def ? def.kind === "percent" : false;
}

export async function verifyStat(ctx: Ctx, p: VerifyParams): Promise<VerifyResult> {
  if (!Number.isFinite(p.claimed_value)) throw new ToolError("'claimed_value' must be a number.");
  const period = normalizePeriod(p.period);
  if (!/^\d{4}(-Q[1-4]|[QM-]?\d{0,2})?$/i.test(period)) {
    throw new ToolError("'period' should be a year like '2024' (or a period label matching the series, e.g. '2024-05' or '2024-Q1').", {
      period: p.period,
    });
  }
  const year = parseInt(period.slice(0, 4), 10);

  // Resolve the official series (registry key or explicit series id).
  const isRegistry = Boolean(getIndicatorDef(p.indicator));
  if (isRegistry && !p.country) {
    throw new ToolError(`Indicator '${p.indicator}' needs a 'country' (ISO3 code or name) to verify against.`);
  }
  if (p.as_of && !isRegistry) {
    throw new ToolError(
      `'as_of' only applies to registry indicator keys (see search_indicators). For an explicit series id, address the dated edition directly, e.g. 'dbnomics/IMF/WEO:2019-04/${p.country ?? "USA"}.NGDP_RPCH.pcent_change'.`,
      { indicator: p.indicator },
    );
  }
  let asOfResolved: VerifyResult["as_of"];
  const result = p.as_of
    ? await (async () => {
        const asOfDate = parseAsOfDate(p.as_of!);
        const { result: r, edition, sourceInfo } = await getIndicatorAsOf(ctx, p.indicator, p.country ?? "", asOfDate, {
          strictSource: p.strict_source,
        });
        asOfResolved = {
          requested: p.as_of!,
          resolved_vintage: edition,
          resolution: "conservative_month_calendar",
          verification_scope: sourceInfo.verification_scope,
          normal_primary_source: sourceInfo.normal_primary_source,
          source_changed_for_as_of: sourceInfo.source_changed_for_as_of,
        };
        return r;
      })()
    : isRegistry
      ? await getIndicator(ctx, p.indicator, p.country ?? "", { strictSource: p.strict_source })
      : await getSeries(ctx, p.indicator, { country: p.country, strictSource: p.strict_source });

  const obs = result.observations;
  const byPeriod = new Map(obs.map((o) => [o.period, o]));
  const lookup = (key: string) => {
    const o = byPeriod.get(key);
    return o?.value != null ? o : undefined;
  };
  let matched = lookup(period) ?? (period.length > 4 ? undefined : lookup(String(year)));
  if (!matched && period.length >= 6) {
    // Higher-frequency series label periods as dates ("2024-05-01"); accept "2024-05" prefixes.
    const hit = obs.find((o) => o.period.startsWith(period) && o.value != null);
    if (hit) matched = hit;
  }

  const diagnostics: string[] = [];
  const notes = [...result.notes];
  // Context-specific revision caveat: the generic "reflects the current published
  // figure" wording is TRUE for live verification but CONTRADICTS a historical
  // as_of result (which is pinned to an old edition precisely so it does NOT
  // reflect the current figure) — a response must never carry both claims.
  notes.push(
    asOfResolved
      ? `Historical-vintage verification: the official value reflects the IMF WEO ${asOfResolved.resolved_vintage} edition, which may differ from both earlier vintages and the source's currently published figure.`
      : "Macro data is revised: the official value reflects the source's current published figure, which may differ from what was published at the time of the claim.",
  );

  // For non-registry (explicit-id) series the unit field is often absent (the
  // DBnomics adapter carries no unit), so keying off the free-text series NAME
  // alone lets an upstream rename flip the tolerance model between
  // percentage-point and relative bands — identical numbers, opposite verdicts.
  // The series id itself is the stable signal: IMF WEO codes end in
  // pcent_gdp / pcent_change, so include id and unit alongside the name.
  const percentKind = isRegistry
    ? isPercentKind(p.indicator)
    : /%|percent|pcent/i.test([result.unit, result.series_id, result.name].filter(Boolean).join(" "));

  // IMF WEO/Fiscal Monitor series are the only ones whose actual-vs-projection
  // status comes from the boundary heuristic (design D3); the colon keeps
  // WEO-prefixed sibling datasets (e.g. WEOAGG), whose projections are never
  // marked, from being misclassified as heuristic series. Pre-boundary IMF
  // observations carry no per-obs note, so this keys off the series identity,
  // never the note.
  const imfHeuristicSeries = /^imf\//.test(result.series_id) || /^dbnomics\/IMF\/(WEO|FM):/i.test(result.series_id);
  const statusMethod: VerifyResult["status_method"] = imfHeuristicSeries ? "horizon_heuristic" : "as_published";

  if (!matched) {
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
      is_projection: false,
      observation_status: "unknown",
      status_method: statusMethod,
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
      ...(result.fallback_used ? { fallback_used: true } : {}),
      ...(asOfResolved ? { as_of: asOfResolved } : {}),
    };
  }

  const official = matched.value!;
  const isProjection = /WEO|Fiscal Monitor/i.test(matched.note ?? "") && /estimate|projection/i.test(matched.note ?? "");
  // "actual" is asserted only for series StatCite curates or can classify (registry
  // WB outturn series, explicit worldbank/ WDI ids). Two carve-outs keep it honest:
  // registry indicators flagged `modeled` (ILO-modeled unemployment/participation —
  // published figures, but model outputs, not measured outturns) report
  // "modeled_estimate"; and arbitrary explicit ids can point at forecast datasets
  // (OECD Economic Outlook via DBnomics) whose values are NOT outturns — those
  // stay "unknown" rather than gaining a false positive "actual" label.
  const registryDef = isRegistry ? getIndicatorDef(p.indicator) : undefined;
  const observationStatus: ObservationStatus = imfHeuristicSeries
    ? isProjection
      ? "projection"
      : "estimate_or_actual"
    : registryDef?.modeled
      ? "modeled_estimate"
      : isRegistry || result.series_id.startsWith("worldbank/")
        ? "actual"
        : "unknown";

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
      [1e12, "a trillions scaling difference"],
    ] as Array<[number, string]>) {
      if (within(ratio, factor, 0.02) || within(ratio, 1 / factor, 0.02)) {
        diagnostics.push(`The claimed value is ~${factor.toLocaleString("en-US")}× ${ratio > 1 ? "larger" : "smaller"} than the official figure — possibly ${label}.`);
      }
    }
  }
  if (ratio != null && ratio < 0 && within(-ratio, 1, 0.02)) {
    diagnostics.push(
      "The claimed value is approximately the official figure with the opposite sign — possibly a sign-convention mix-up (e.g. a fiscal deficit quoted as positive where the source reports net lending as negative).",
    );
  }
  // Adjacent-year check: does the claim match a neighboring year better?
  for (const offset of [-2, -1, 1, 2]) {
    const v = byPeriod.get(String(year + offset))?.value;
    if (v != null && closeEnough(p.claimed_value, v, percentKind, p)) {
      diagnostics.push(`The claimed value matches the ${year + offset} figure (${fmt(v)}) — the year may be misattributed.`);
    }
  }

  // A verification verdict is a claim about THE primary official series. When a
  // registry indicator was served from a fallback because the primary failed
  // TRANSIENTLY, the number in hand can differ from what the primary will serve
  // once it recovers — by definition (World Bank vs IMF current account: 1.8pp
  // for the same country-year in this repo's own benchmark logs) or by vintage
  // (IMF rebasings move fiscal series by whole points for identical historical
  // years) — so both "match" and "mismatch" would be untrustworthy and the
  // verdict demotes to cannot_verify with the substitute's value as indicative.
  // A DEFINITIVE fallback (the primary permanently lacks this series/country,
  // e.g. Taiwan in WDI) has no such same-query-different-answer risk: the
  // fallback is that country's stable serving source, so it is judged normally
  // with the disclosure note. get_indicator serves both classes with disclosure
  // — retrieval and verification carry different promises. (Generalizes the
  // v1.3.0 DataMapper→DBnomics rule; diagnostics above still run so scale and
  // sign slips are diagnosed even on demoted results.)
  if (isRegistry && result.fallback_used === true && result.fallback_reason !== "definitive") {
    const vintageFlavor =
      Boolean(registryDef?.datamapper) && result.series_id.startsWith("dbnomics/")
        ? " IMF vintage revisions (e.g. GDP rebasing) can move WEO/Fiscal Monitor series by more than a percentage point for the same historical year."
        : " Substitute sources can use different statistical definitions and report materially different values for the same nominal indicator.";
    const projFlag = isProjection ? " (an IMF estimate/projection-period value)" : "";
    return {
      verdict: "cannot_verify",
      claimed_value: p.claimed_value,
      official_value: official,
      is_projection: isProjection,
      observation_status: observationStatus,
      status_method: statusMethod,
      period,
      difference: null,
      relative_difference_pct: null,
      explanation:
        `This indicator's primary source was transiently unavailable; the fallback (${result.citation.source}, ${result.series_id}) shows ${fmt(official)}${result.unit ? ` ${result.unit}` : ""}${projFlag} for ${period} — indicative only, not a verification.${vintageFlavor} Retry when the primary source has recovered, or pass strict_source=true to fail hard instead.`,
      diagnostics,
      series: { id: result.series_id, name: result.name, unit: result.unit },
      country: result.country,
      citation: result.citation,
      notes,
      fallback_used: true,
      ...(asOfResolved ? { as_of: asOfResolved } : {}),
    };
  }

  const { verdict, why } = judge(p.claimed_value, official, percentKind, p);
  const unitText = result.unit ? ` ${result.unit}` : "";
  const projKind = /Fiscal Monitor/i.test(matched.note ?? "") ? "IMF Fiscal Monitor" : "IMF WEO";
  const officialLabel = isProjection ? `official (${projKind} projection)` : "official";
  const explanation =
    verdict === "match"
      ? `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period} — consistent (${why}).`
      : verdict === "close"
        ? `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period} — in the right neighborhood but not exact (${why}). Cite the official value.`
        : `Claimed ${fmt(p.claimed_value)} vs ${officialLabel} ${fmt(official)}${unitText} for ${period} — materially different (${why}).` +
          (diagnostics.length ? " See diagnostics for likely causes." : "");

  return {
    verdict,
    claimed_value: p.claimed_value,
    official_value: official,
    is_projection: isProjection,
    observation_status: observationStatus,
    status_method: statusMethod,
    period,
    difference: Number(diff.toFixed(6)),
    relative_difference_pct: relPct == null ? null : Number(relPct.toFixed(3)),
    explanation,
    diagnostics,
    series: { id: result.series_id, name: result.name, unit: result.unit },
    country: result.country,
    citation: result.citation,
    notes,
    ...(result.fallback_used ? { fallback_used: true } : {}),
    ...(asOfResolved ? { as_of: asOfResolved } : {}),
  };
}

function within(x: number, target: number, tolFrac: number): boolean {
  return Math.abs(x - target) / target <= tolFrac;
}

/** Normalize claim-period spellings to source labels: "2024Q1"/"2024 Q1" → "2024-Q1", "202405" → "2024-05". */
export function normalizePeriod(input: string): string {
  const s = input.trim();
  const q = s.match(/^(\d{4})[\s-]?Q([1-4])$/i);
  if (q) return `${q[1]}-Q${q[2]}`;
  const m = s.match(/^(\d{4})(0[1-9]|1[0-2])$/);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}

function closeEnough(claimed: number, official: number, percentKind: boolean, p: VerifyParams): boolean {
  return judge(claimed, official, percentKind, p).verdict !== "mismatch";
}

export function judge(
  claimed: number,
  official: number,
  percentKind: boolean,
  p: Pick<VerifyParams, "tolerance_abs" | "tolerance_pct">,
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
    // Rates in percentage points: rounding to 1 decimal is normal in prose,
    // and large ratios (e.g. debt at 250% of GDP) deserve a proportional band.
    if (absDiff <= 0.06 || relDiff <= 0.005) {
      return {
        verdict: "match",
        why:
          absDiff <= 0.06
            ? `difference of ${absDiff.toFixed(3)} pp is within normal rounding`
            : `relative difference ${(relDiff * 100).toFixed(2)}% is within normal rounding`,
      };
    }
    if (absDiff <= 0.3 || relDiff <= 0.02) {
      return {
        verdict: "close",
        why:
          absDiff <= 0.3
            ? `difference of ${absDiff.toFixed(2)} pp`
            : `difference of ${absDiff.toFixed(2)} pp (${(relDiff * 100).toFixed(1)}% relative)`,
      };
    }
    return { verdict: "mismatch", why: `difference of ${absDiff.toFixed(2)} percentage points (${(relDiff * 100).toFixed(1)}% relative)` };
  }
  if (relDiff <= 0.005) return { verdict: "match", why: `relative difference ${(relDiff * 100).toFixed(2)}% is within normal rounding` };
  if (relDiff <= 0.05) return { verdict: "close", why: `relative difference ${(relDiff * 100).toFixed(1)}%` };
  return { verdict: "mismatch", why: `relative difference ${(relDiff * 100).toFixed(1)}%` };
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1e6) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
