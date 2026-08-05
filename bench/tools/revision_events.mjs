// bench/tools/revision_events.mjs — §3.3.6: the scoring-time live cross-check.
// Re-fetches every headline cell's CURRENT live value and logs any freeze-to-scoring
// upstream drift to {base}/snapshots/{run}/revision_events.json — itself publishable
// evidence on revision magnitude. Never changes ground truth or any verdict: the
// frozen snapshot remains the scoring record (§3.1); this file is diagnostic output.

import { benchPaths, log, parseArgs, readJson, scVerifyRobust, writeJson } from "./lib.mjs";
import path from "node:path";

const HELP = `revision_events.mjs — log freeze-to-scoring upstream drift (§3.3.6)

Usage: node revision_events.mjs --run R2 [--base DIR] [--help]
Run at scoring time, after model calls, before/alongside score.mjs.`;

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) return void console.log(HELP);
  if (!args.run) throw new Error("--run is required");
  const paths = benchPaths(args.base, args.run);
  const gt = readJson(path.join(paths.snapshotDir, "ground_truth.json"));
  const cells = gt.rows.filter((r) => r.segment === "headline" && r.value != null);
  log(`live cross-check for ${cells.length} headline cells`);

  const events = [];
  let checked = 0;
  for (const r of cells) {
    // scVerifyRobust with the FROZEN value: verdict match => no drift beyond
    // tolerance; the response's official_value is today's live value either way.
    const res = await scVerifyRobust({ indicator: r.indicator, country: r.iso3, period: r.year, value: r.value });
    checked++;
    if (res.status !== 200) {
      events.push({ qid: r.qid, kind: "fetch_failed", detail: `http_${res.status}` });
      continue;
    }
    const live = res.body.official_value;
    if (Number.isFinite(live) && live !== r.value) {
      events.push({
        qid: r.qid,
        kind: "value_drift",
        indicator: r.indicator,
        iso3: r.iso3,
        year: r.year,
        frozen_value: r.value,
        live_value: live,
        abs_drift: Math.abs(live - r.value),
        rel_drift_pct: r.value !== 0 ? Math.abs((live - r.value) / r.value) * 100 : null,
        still_within_tolerance: res.body.verdict === "match" || res.body.verdict === "close",
      });
    }
  }
  writeJson(path.join(paths.snapshotDir, "revision_events.json"), {
    run: args.run,
    checked_at: new Date().toISOString(),
    frozen_at: gt.snapshot_at,
    cells_checked: checked,
    n_events: events.length,
    note: "Diagnostic only (§3.3.6): scoring always uses the frozen snapshot; drift here is evidence on revision magnitude between freeze and scoring.",
    events,
  });
  log(`revision_events.json written (${events.length} events over ${checked} cells)`);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`revision_events FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
