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

/** "republished" | "our-query-changed" | "unchanged" | "new" */
export async function classifyChange(file, doc) {
  const { readFile } = await import("node:fs/promises");
  let existing;
  try {
    existing = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return "new";
  }
  if (canonical(existing) === canonical(doc)) return "unchanged";
  return sourceStamp(existing) === sourceStamp(doc) ? "our-query-changed" : "republished";
}

