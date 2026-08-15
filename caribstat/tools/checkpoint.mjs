// The check ledger: when did we last CONFIRM a series was current?
//
// This exists because "the bank published nothing new" and "we did not look"
// are different facts, and the data files alone cannot tell them apart. Before
// this ledger, the pipeline answered "when did we last confirm this?" by
// rewriting every latest file with a fresh `retrieved_at` on every run. That
// worked, but it meant a quiet day still churned ~196 files, and the scheduled
// task's own notes had to carry a paragraph explaining that the mtimes were
// not evidence of a write. Recording the check ONCE, here, is the honest form
// of the same claim and leaves the data files alone.
//
// The ledger is bookkeeping, never data. Nothing in it is published or cited,
// and a corrupt or missing ledger must only ever cost a redundant fetch, never
// a wrong answer — every consumer treats an unreadable ledger as "we have not
// checked", which fails toward doing the work rather than skipping it.
//
// It also records the QUERY WINDOW each series was built with. That is the
// part a source stamp cannot cover: widening --start/--end legitimately
// changes our extract while the bank's stamp stays put (this repo has already
// seen that produce 135 false CHANGED verdicts). A skip decision that ignored
// the window would silently serve a narrower extract than the operator asked
// for.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const LEDGER = "_last_check.json";

export const ledgerPath = (dataDir) => path.join(dataDir, LEDGER);

/** Read the ledger. An unreadable or absent ledger is an empty one: the caller
 * then has no basis to skip anything, which is the safe direction. */
export async function loadLedger(dataDir) {
  try {
    const raw = JSON.parse(await readFile(ledgerPath(dataDir), "utf8"));
    return raw && typeof raw === "object" && raw.entries ? raw : { entries: {} };
  } catch {
    return { entries: {} };
  }
}

export async function saveLedger(dataDir, ledger) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(ledgerPath(dataDir), JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

/**
 * Record that we checked `key` at `checkedAt`.
 *
 * `action` is what we DID, and it is deliberately part of the record: a run
 * that skipped a fetch and a run that fetched and found nothing new are both
 * "no new data", but only the second one actually re-read the bank's numbers.
 * Keeping them distinct is what makes a later "when was this last genuinely
 * re-read?" answerable, which is exactly the question a deep run exists for.
 */
export function noteCheck(ledger, key, { checkedAt, sourceStamp, window, action, fetched }) {
  const prior = ledger.entries[key] ?? {};
  ledger.entries[key] = {
    ...prior,
    checked_at: checkedAt,
    source_stamp: sourceStamp ?? null,
    window: window ?? null,
    action,
    // The last time we actually pulled the numbers down, as opposed to
    // confirming a stamp and skipping. A skip carries the previous value
    // forward so it never looks fresher than it is.
    last_full_fetch_at: fetched ? checkedAt : (prior.last_full_fetch_at ?? null),
  };
  return ledger;
}

/** Serialise a query window so two runs' windows compare exactly. */
export const windowKey = (startDate, endDate) => `${startDate ?? ""}..${endDate ?? ""}`;

/**
 * May we skip fetching `key`?
 *
 * Every condition must hold, and each one is here because its absence would
 * let a skip hide something real:
 *   - a ledger entry exists            (never skip on no evidence)
 *   - the query window is identical    (a wider window is a different extract)
 *   - the live stamp is known          (an unreadable stamp is not a match)
 *   - the live stamp equals the stored (the source's own claim that nothing
 *                                       was republished)
 */
export function canSkip(ledger, key, { liveStamp, window }) {
  const e = ledger.entries[key];
  if (!e) return { skip: false, why: "no prior check recorded" };
  if (e.window !== window) return { skip: false, why: `query window changed (${e.window} -> ${window})` };
  if (!liveStamp) return { skip: false, why: "no live source stamp to compare" };
  if (e.source_stamp !== liveStamp) return { skip: false, why: `source republished (${e.source_stamp} -> ${liveStamp})` };
  return { skip: true, why: `stamp unchanged (${liveStamp})` };
}
