// The limits of a served figure, as a short machine-readable list.
//
// WHY: every result already carries a citation, so a caller knows WHERE a
// number came from. This says what the number is NOT: a projection, a
// fallback source's figure, a model estimate, a rounded value, a StatCite
// computation. The same facts already live in `notes` as prose, which an agent
// can drop or misread. `limitations` carries them as codes.
//
// RULE: every entry is derived from a STRUCTURED field the code itself sets
// or holds: an observation's projection marker, fallback_used and
// fallback_reason, stale_primary, the registry's `modeled` flag, the registry's
// DataMapper dataset for an imf/ code, the series id of an IMF vintage, the
// citation's retrieved_at, the latest-only request, and the transform. The prose in `notes`
// is never read, so a reworded note can never add or drop a limitation. An
// empty list means none of these conditions was detected. It is not a warranty
// that the figure has no other limits.

import { LIMITATION_CODES, type Limitation, type SeriesResult } from "./types.ts";
import { INDICATORS } from "./indicators.ts";

export { LIMITATION_CODES };

/** Set by series.ts on observations in the source's estimate/projection
 * period: `${kind} estimate/projection`. Matched on that suffix only. */
const PROJECTION_MARK = / estimate\/projection$/;

function wdiDefFor(seriesId: string) {
  const m = /^worldbank\/(.+)$/i.exec(seriesId);
  return m ? INDICATORS.find((d) => d.wb === m[1]) : undefined;
}

/** The registry's DataMapper dataset for an imf/<CODE> series id. Read from the
 * registry, so a degraded edition label in the citation cannot hide it. */
function dataMapperDataset(seriesId: string): "WEO" | "FM" | undefined {
  const m = /^imf\/([A-Z0-9_]+)$/i.exec(seriesId);
  if (!m) return undefined;
  return INDICATORS.find((d) => d.datamapper?.[0] === m[1].toUpperCase())?.datamapper?.[1];
}

/**
 * A "latest" value more than this many years before the year it was retrieved
 * is stale. Shared with the stale_primary note in series.ts, which carries the
 * first measurement. Re-measured for the World Bank-only registry series on
 * 2026-10-14 against a 2026 clock: population 0 of 217 economies past it, life
 * expectancy 0 of 217, GDP per capita 10 of 214, while Gini 106 of 171 and
 * tourism receipts 191 of 191 (the World Bank series ends at 2020). No annual
 * series publishes the current year, so a gap of 1 or 2 is an ordinary
 * publication lag and must never fire.
 */
export const STALE_YEARS = 3;

/** A DataMapper code (WEO or Fiscal Monitor), or a DBnomics IMF vintage whose
 * dataset code carries the year the projection marker is anchored on. These
 * are the IMF series where StatCite infers the projection boundary itself. */
function imfInferredBoundary(seriesId: string): boolean {
  return dataMapperDataset(seriesId) !== undefined || /^dbnomics\/IMF\/(WEO|FM):\d{4}/i.test(seriesId);
}

export interface LimitationOpts {
  transform?: string;
  /** The caller asked for the latest value: latest_only, with no end year pinned. */
  latestOnly?: boolean;
}

export function deriveLimitations(r: SeriesResult, opts: LimitationOpts = {}): Limitation[] {
  const out: Limitation[] = [];
  const valued = r.observations.filter((o) => o.value != null);
  const transformed = !!opts.transform && opts.transform !== "none";

  const projected = valued.filter((o) => PROJECTION_MARK.test(o.note ?? ""));
  if (projected.length) {
    out.push({
      code: "projection",
      detail:
        `${projected.length} of ${valued.length} returned value(s) fall in the source's estimate/projection period ` +
        `(${projected[0].period}${projected.length > 1 ? ` to ${projected[projected.length - 1].period}` : ""}). ` +
        "The boundary is a heuristic, so earlier values may also be staff estimates.",
    });
  }

  // Checked live on 2026-10-14: the DataMapper values and /indicators
  // metadata, DBnomics WEO series and the IMF's own SDMX 3.0 WEO flow carry no
  // per-country "estimates start after" year. So StatCite cannot tell an
  // outturn from a staff estimate before its inferred boundary, and says only
  // that. It never says a value IS an estimate.
  const unmarked = valued.length - projected.length;
  if (unmarked > 0 && imfInferredBoundary(r.series_id)) {
    out.push({
      code: "outturn_unconfirmed",
      detail:
        `${unmarked} of ${valued.length} returned value(s) fall before the projection boundary StatCite infers. ` +
        "The IMF data StatCite reads does not mark which years are outturns and which are staff estimates, so any of these values may be a staff estimate.",
    });
  }

  if (r.fallback_used) {
    out.push({
      code: "fallback_source",
      detail:
        r.fallback_reason === "transient"
          ? "Served by a fallback source because a source ranked above it failed for this request. The same query can return a different source's value once that source recovers."
          : "Served by a fallback source because the primary had no data for this series, country or period. The fallback may use a different statistical definition.",
    });
  }

  if (r.stale_primary) {
    out.push({
      code: "stale_primary",
      detail: `The latest value is ${r.stale_primary_years ?? "several"} year(s) behind the current year. This describes the serving source's own horizon only.`,
    });
  }

  if (opts.latestOnly && valued.length) {
    const latest = valued[valued.length - 1];
    const periodYear = Number(String(latest.period).slice(0, 4));
    const retrievedYear = Number(String(r.citation?.retrieved_at ?? "").slice(0, 4));
    // An unreadable date gives NaN or a negative gap, and neither passes. An
    // empty period reads as year 0, so it needs its own guard.
    const gap = retrievedYear - periodYear;
    if (periodYear > 0 && gap > STALE_YEARS) {
      out.push({
        code: "stale_latest",
        detail:
          `The latest value returned is for ${latest.period}, ${gap} years before ${retrievedYear}, the year it was retrieved. ` +
          `This fires only past ${STALE_YEARS} years, so an ordinary publication lag of 1 or 2 years never triggers it.`,
      });
    }
  }

  if (wdiDefFor(r.series_id)?.modeled) {
    out.push({
      code: "modeled_estimate",
      detail: "The source publishes this series as a modelled estimate, the output of a model.",
    });
  }

  if (dataMapperDataset(r.series_id) === "WEO") {
    out.push({
      code: "rounded_source",
      detail: transformed
        ? "The IMF DataMapper serves WEO values rounded to one decimal place, and the values here are computed from those rounded inputs, so their rounding error can exceed 0.05 by a wide margin on small bases."
        : "The IMF DataMapper serves WEO values rounded to one decimal place, so a value can differ from the unrounded figure by up to 0.05.",
    });
  }

  if (transformed) {
    out.push({
      code: "computed_values",
      detail: `StatCite computed these values (${opts.transform}) from the cited series. The source published the inputs.`,
    });
  }

  return out;
}

/** Attach `limitations` to a result in place and return it. */
export function withLimitations(r: SeriesResult, opts: LimitationOpts = {}): SeriesResult {
  r.limitations = deriveLimitations(r, opts);
  return r;
}
