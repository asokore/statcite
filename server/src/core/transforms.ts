// Numeric transforms with provenance notes.

import type { Observation } from "./types.ts";
import { ToolError } from "./types.ts";

export type Transform = "none" | "yoy" | "pct_change" | "index";

const TRANSFORM_VALUES: Transform[] = ["none", "yoy", "pct_change", "index"];

/** Parse a user-supplied transform string; unknown values are an error, not a silent index rebase. */
export function parseTransform(v: unknown): Transform {
  if (v == null || v === "") return "none";
  const s = String(v).toLowerCase().trim();
  if ((TRANSFORM_VALUES as string[]).includes(s)) return s as Transform;
  throw new ToolError(`Unknown transform '${String(v)}'. Valid: ${TRANSFORM_VALUES.join(", ")}.`);
}

/** Lag (in observations) for a year-over-year comparison, by frequency. */
function yoyLag(frequency?: string): number {
  switch ((frequency || "annual").toLowerCase()) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "daily":
      return 0; // not meaningful — treated as unsupported
    default:
      return 1; // annual
  }
}

export function applyTransform(
  observations: Observation[],
  transform: Transform,
  opts: { frequency?: string; indexBasePeriod?: string } = {},
): { observations: Observation[]; note?: string } {
  if (transform === "none") return { observations };

  const obs = observations;
  if (transform === "yoy" || transform === "pct_change") {
    const lag = transform === "yoy" ? yoyLag(opts.frequency) : 1;
    if (lag === 0) throw new ToolError("year-over-year transform is not supported for daily series");
    const out: Observation[] = [];
    for (let i = lag; i < obs.length; i++) {
      const cur = obs[i].value;
      const prev = obs[i - lag].value;
      out.push({
        period: obs[i].period,
        value: cur == null || prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100,
      });
    }
    return {
      observations: out,
      note:
        transform === "yoy"
          ? `Computed by StatCite: year-over-year % change (lag ${lag} period${lag > 1 ? "s" : ""}).`
          : "Computed by StatCite: period-over-period % change.",
    };
  }

  // index rebase
  let base = obs.find((o) => o.period === opts.indexBasePeriod);
  if (!base) base = obs.find((o) => o.value != null);
  if (!base || base.value == null || base.value === 0) {
    throw new ToolError("cannot rebase to an index: no usable base observation", {
      requested_base: opts.indexBasePeriod ?? null,
    });
  }
  const b = base.value;
  return {
    observations: obs.map((o) => ({ period: o.period, value: o.value == null ? null : (o.value / b) * 100 })),
    note: `Computed by StatCite: rebased to index, ${base.period} = 100.`,
  };
}

/** Keep observations within [start, end] (inclusive), comparing on the leading year. */
export function filterPeriodRange(observations: Observation[], start?: string, end?: string): Observation[] {
  if (!start && !end) return observations;
  const startY = start ? parseInt(start, 10) : -Infinity;
  const endY = end ? parseInt(end, 10) : Infinity;
  return observations.filter((o) => {
    const y = parseInt(o.period.slice(0, 4), 10);
    return !Number.isNaN(y) && y >= startY && y <= endY;
  });
}

/** The most recent observation with a non-null value. */
export function latestNonNull(observations: Observation[]): Observation | undefined {
  for (let i = observations.length - 1; i >= 0; i--) {
    if (observations[i].value != null) return observations[i];
  }
  return undefined;
}
