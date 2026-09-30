// Change detection for scheduled ingestion.
//
// Without this, every scheduled run rewrites every file with a fresh
// `retrieved_at`, so git records a change on every tick and the one question
// that matters — DID THE BANK PUBLISH ANYTHING NEW? — becomes invisible in a
// wall of noise. A daily cron would produce a year of commits saying nothing.
//
// The rule: two documents are the same OBSERVATION if everything except our
// own retrieval bookkeeping is identical. `retrieved_at` is ours and changes
// every run by definition; the bank's own currency stamp (`data_as_at` /
// `published_at`), the periods and the values are the source's and are exactly
// what we are watching.
//
// Consequences, all deliberate:
//   - an unchanged table leaves the dated snapshot untouched, so snapshots
//     stay a record of what the bank published, not of when we happened to look
//   - the `latest` file still refreshes its retrieved_at, so "when did we last
//     confirm this is current" remains answerable
//   - a run that finds nothing new exits cleanly and says so, which is a
//     meaningful signal rather than an empty diff

import { readFile } from "node:fs/promises";

/** Fields that are ours, not the source's. Differences here are not news. */
const OURS = new Set(["retrieved_at"]);

export function stripOurFields(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc ?? {})) if (!OURS.has(k)) out[k] = v;
  return out;
}

/** Stable stringify so key order can never masquerade as a data change. */
export function canonical(doc) {
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    return Object.fromEntries(
      Object.keys(v).sort().map((k) => [k, walk(v[k])]),
    );
  };
  return JSON.stringify(walk(stripOurFields(doc)));
}

/**
 * Compare a freshly-built document against what is already on disk.
 * Returns "new" (nothing there yet), "changed", or "unchanged".
 */
export async function compareWithExisting(file, doc) {
  let existing;
  try {
    existing = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return "new";
  }
  return canonical(existing) === canonical(doc) ? "unchanged" : "changed";
}

/**
 * Did the SOURCE republish, or did we just ask a different question?
 *
 * Change detection alone cannot tell these apart, and on a scheduled collector
 * that matters: widening the ingest window from end=2025 to end=2026 added a
 * 2026 column to 135 ECCB series and reported them all as CHANGED, while every
 * bank stamp stayed at 2026-07-28. Nothing had been republished. Left
 * unqualified, a run like that reads as "the region's statistics all moved
 * today", which is a false claim about the world rather than about our query.
 *
 * The banks' own currency stamps are the authority on this: ECCB prints
 * `data_as_at`, CBB gives `published_at`. If the stamp is unchanged, the source
 * did not republish, however much our extract differs.
 */
export function sourceStamp(doc) {
  return doc?.data_as_at ?? doc?.published_at;
}

/** The stamp fields, which say WHEN the bank vouched for a table, not WHAT it
 * published. Stripped only when a stamp is missing on one side, to ask whether
 * anything but the stamp moved. */
const STAMP_FIELDS = ["data_as_at", "data_as_at_raw", "published_at"];
const withoutStamp = (doc) => Object.fromEntries(Object.entries(doc ?? {}).filter(([k]) => !STAMP_FIELDS.includes(k)));

/** Everything except the observations must match, the series must be the same
 * rows in the same order, and every period BOTH documents hold must carry the
 * same value. True means the only difference is which periods are present. */
function sameContentOnOverlap(a, b) {
  const frame = (d) => canonical({ ...withoutStamp(d), periods: undefined, periods_raw: undefined, series: undefined });
  if (frame(a) !== frame(b)) return false;
  const as = a.series ?? [];
  const bs = b.series ?? [];
  if (as.length !== bs.length) return false;
  for (let i = 0; i < as.length; i++) {
    if (as[i].label !== bs[i].label || as[i].unit !== bs[i].unit) return false;
    const held = new Map((as[i].observations ?? []).map((o) => [o.period, o.value]));
    for (const o of bs[i].observations ?? []) {
      if (held.has(o.period) && held.get(o.period) !== o.value) return false;
    }
  }
  return true;
}

/** "2015..2026" -> { start: 2015, end: 2026 }. A window with an empty side
 * ("..", "2015..") is UNKNOWN, not unbounded: with no date posted the bank
 * picks the window itself, so neither side says what we asked for, and an
 * unknown window excuses nothing. Reading "" as infinite made every period
 * look requested (review, 2026-09-30). */
function parseWindow(w) {
  const m = /^(\d{4})\.\.(\d{4})$/.exec(String(w ?? ""));
  if (!m) return undefined;
  return { start: Number(m[1]), end: Number(m[2]) };
}
const inWindow = (year, w) => year >= w.start && year <= w.end;

/**
 * Can the move from `before` to `after` in OUR query window account for every
 * period that appeared or vanished? A period is explained only if the old
 * window never asked for it (added) or the new window no longer asks for it
 * (removed). Anything else is the bank's doing. Periods are keyed by their
 * leading year, which every normalised ECCB label carries ("2026",
 * "2026-Q2", "2026-06").
 */
function windowExplainsPeriods(a, b, windowBefore, windowAfter) {
  const wb = parseWindow(windowBefore);
  const wa = parseWindow(windowAfter);
  if (!wb || !wa || windowBefore === windowAfter) return false;
  const held = new Set(a.periods ?? []);
  const now = new Set(b.periods ?? []);
  const year = (p) => Number(String(p).slice(0, 4));
  for (const p of now) {
    if (held.has(p)) continue;
    const y = year(p);
    if (!Number.isFinite(y) || inWindow(y, wb) || !inWindow(y, wa)) return false;
  }
  for (const p of held) {
    if (now.has(p)) continue;
    const y = year(p);
    if (!Number.isFinite(y) || inWindow(y, wa)) return false;
  }
  return true;
}

/** Change states that carry no news about the bank's figures, so they write
 * no snapshot. Both callers (ECCB and CBB) test against this one set. */
export const QUIET_STATES = new Set(["unchanged", "stamp-withdrawn", "stamp-restored"]);

/**
 * "republished" | "our-query-changed" | "unchanged" | "stamp-withdrawn" |
 * "stamp-restored" | "new"
 *
 * `windowBefore` / `windowAfter` are OUR query windows ("2015..2026") for the
 * stored and the fresh document. They only matter when a stamp is missing,
 * and an unknown window excuses nothing. A per-country table whose extract
 * never uses our window must pass neither.
 *
 * WHEN A STAMP IS MISSING. ECCB stopped printing "Data as at" in September
 * 2026. The stamp rule below then compares undefined with undefined, calls them
 * equal, and would label EVERY genuine revision "our-query-changed", which is
 * the opposite of the 135-series false alarm it was written to prevent and
 * much worse, because it hides real news. So with a stamp absent on either
 * side the content decides instead:
 *   - only the stamp vanished                  -> stamp-withdrawn (values held)
 *   - only the stamp appeared                  -> stamp-restored  (values held)
 *   - a value, label, unit or row moved        -> republished
 *   - only periods moved, and our window move
 *     explains every one of them               -> our-query-changed
 *   - any other period movement                -> republished (the bank added
 *                                                  or withdrew a period)
 * The two stamp states are named rather than folded into "unchanged" because
 * the file DOES change and gets published: the run should say why.
 */
export async function classifyChange(file, doc, { windowBefore, windowAfter } = {}) {
  const { readFile } = await import("node:fs/promises");
  let existing;
  try {
    existing = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return "new";
  }
  if (canonical(existing) === canonical(doc)) return "unchanged";
  const before = sourceStamp(existing);
  const after = sourceStamp(doc);
  if (before && after) return before === after ? "our-query-changed" : "republished";
  if (canonical(withoutStamp(existing)) === canonical(withoutStamp(doc))) {
    if (before && !after) return "stamp-withdrawn";
    if (!before && after) return "stamp-restored";
    return "unchanged";
  }
  return sameContentOnOverlap(existing, doc) && windowExplainsPeriods(existing, doc, windowBefore, windowAfter)
    ? "our-query-changed"
    : "republished";
}

