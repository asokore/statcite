// Publish the harvest to its canonical home — pure logic, no git, no process.exit.
//
// Why this exists: on 2026-08-15, StatCite's live API was found serving
// mixed-period-format tourism data that had already been fixed in this local
// pipeline HOURS earlier. The fix never left this machine. The Worker fetches
// https://asokore.github.io/caribstat as its upstream (server/src/adapters/
// caribstat.ts, CARIBSTAT_ORIGIN), which is built from github.com/asokore/
// caribstat — a SEPARATE repository from this one, with no automated path
// between "the local corpus changed" and "the published corpus changed".
// Every prior publish had been a one-off manual sync via a scratch clone.
// tools/publish-run.mjs is that sync, made repeatable and safe to run
// unattended; this file is its testable core.
//
// It reuses the same `canonical()` comparator the ingest pipeline already
// trusts (tools/changed.mjs) so a run that touched only `retrieved_at` never
// gets mistaken for real content and pushed. A raw file diff would have shown
// every one of ~400 files as changed on the day this was written.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { canonical } from "./changed.mjs";

export const PUBLISH_REPO = "https://github.com/asokore/caribstat.git";

/** List every published document under a data root, as paths relative to it.
 * Recurses into `snapshots/`, unlike tools/status.mjs which deliberately skips
 * them — a snapshot IS a document the published repo must carry. */
export async function listDocs(dataDir) {
  const out = [];
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".json") && e.name !== "_last_check.json") out.push(path.relative(dataDir, p));
    }
  };
  await walk(dataDir);
  return out.sort();
}

/**
 * Compare the local corpus against a cloned copy of the published one.
 *
 * `toPublish` is new-or-changed, judged by `canonical()` so our own
 * `retrieved_at` never counts as a change. `orphaned` is present in the clone
 * but not locally — this NEVER triggers a deletion. A file this pipeline no
 * longer produces (a retired sheet, a renamed category) is a decision for a
 * person, not something a sync script infers from an empty local directory,
 * because "we stopped collecting X" and "X briefly failed to ingest" look
 * identical from here.
 */
export async function classify(localDataDir, cloneDataDir) {
  const localFiles = await listDocs(localDataDir);
  const cloneFiles = new Set(await listDocs(cloneDataDir));
  const toPublish = [];
  for (const rel of localFiles) {
    const localDoc = JSON.parse(await readFile(path.join(localDataDir, rel), "utf8"));
    let cloneDoc;
    try {
      cloneDoc = JSON.parse(await readFile(path.join(cloneDataDir, rel), "utf8"));
    } catch {
      toPublish.push({ rel, state: "new" });
      continue;
    }
    if (canonical(localDoc) !== canonical(cloneDoc)) toPublish.push({ rel, state: "changed" });
    cloneFiles.delete(rel);
  }
  return { toPublish, orphaned: [...cloneFiles].sort() };
}

/** Write the files `classify` selected into the clone. Pure I/O, no git. */
export async function applyToClone(localDataDir, cloneDataDir, toPublish) {
  for (const { rel } of toPublish) {
    const dest = path.join(cloneDataDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await readFile(path.join(localDataDir, rel), "utf8"));
  }
}

/** A commit subject that stays informative without becoming a 400-line list.
 * Names every touched top-level category/table when there are few, and falls
 * back to a count when there are many — a scheduled run touching one sheet
 * should say which one, not "6 files changed". */
export function summarise(toPublish) {
  const n = toPublish.length;
  const newN = toPublish.filter((f) => f.state === "new").length;
  const changedN = n - newN;
  const tables = [...new Set(toPublish.map((f) => f.rel.split(/[\\/]/).slice(0, 2).join("/")))];
  const head = tables.length <= 6 ? tables.join(", ") : `${tables.length} tables/categories`;
  return `CaribStat data: ${n} file(s) (${newN} new, ${changedN} changed) — ${head}`;
}
