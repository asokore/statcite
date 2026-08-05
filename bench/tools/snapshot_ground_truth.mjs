// bench/tools/snapshot_ground_truth.mjs — freeze ground truth before any model call
// (METHODOLOGY §3.1, §3.3.4).
//
// For every question in {base}/questions/{run}.json: fetch the full StatCite payload
// (value, unit, native series id, source institution, full citation, is_projection,
// retrieved_at) PLUS the asked-year ±1 values (adjacent-year diagnostic — scoring may
// use ONLY these, never the live API).
//
// For WEO-sourced cells (and all WEO-template indicators on recency questions), also
// fetch the same cell from a dated IMF WEO vintage ~18 months older via /v1/series
// (dbnomics/IMF/WEO:YYYY-MM/...), probing which dated editions exist; for recency
// questions the vintage's PROJECTION values are stored for projection_echo detection.
//
// Outputs: {base}/snapshots/{run}/ground_truth.json + revision_check.json.

import {
  WEO_SERIES_TEMPLATE, benchPaths, log, obsFor, isProjectionObs, parseArgs, readJson,
  scIndicatorRobust, scSeries, writeJson, mapLimit,
} from "./lib.mjs";
import path from "node:path";

const HELP = `snapshot_ground_truth.mjs — freeze ground truth for a run (METHODOLOGY §3.1)

Usage: node snapshot_ground_truth.mjs --run P0 [--base DIR] [--revision-only] [--help]

  --run RUN        Run id whose questions/{RUN}.json to snapshot.
  --base DIR       Base directory (default bench/). Reads questions/, writes snapshots/{RUN}/.
  --revision-only  Rebuild ONLY revision_check.json, reading served series ids from the
                   already-FROZEN ground_truth.json (which is never rewritten in this
                   mode). For repairing the vintage instrument on a completed run
                   without moving its scored ground truth (D-003).
  --help           Show this help.

Writes ground_truth.json (frozen payload per question, incl. asked-year ±1 values)
and revision_check.json (older dated WEO vintage values for WEO-sourced cells and
for recency projection_echo detection).`;

/**
 * Candidate dated WEO editions nearest to (now - 18 months), most preferred first.
 * `currentEdition` (e.g. "2025-04", the edition WEO:latest currently serves) is
 * excluded along with anything newer — the vintage instrument needs real revision
 * distance, not the live edition under a dated name. Near-ties prefer the OLDER
 * edition (more revision distance is the safer instrument).
 */
export function weoVintageCandidates(now = new Date(), currentEdition = null) {
  const target = new Date(now);
  target.setMonth(target.getMonth() - 18);
  const editions = [];
  for (let y = now.getFullYear() - 4; y <= now.getFullYear(); y++) {
    for (const m of ["04", "10"]) {
      const ed = `${y}-${m}`;
      const d = new Date(`${ed}-01T00:00:00Z`);
      if (d >= now) continue;
      if (currentEdition && ed >= currentEdition) continue;
      editions.push({ ed, dist: Math.abs(d - target) });
    }
  }
  const BUCKET = 60 * 24 * 3600 * 1000; // near-tie window: 60 days
  return editions
    .sort((a, b) => Math.floor(a.dist / BUCKET) - Math.floor(b.dist / BUCKET) || (a.ed < b.ed ? -1 : 1))
    .map((e) => e.ed);
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    "revision-only": { type: "boolean" },
    help: { type: "boolean" },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.run) throw new Error("--run is required (see --help)");
  const paths = benchPaths(args.base, args.run);
  const bank = readJson(paths.questions);

  if (args["revision-only"]) {
    // Repair mode (D-003): the scored ground truth stays FROZEN — read the
    // existing snapshot for served series ids and rebuild only the vintage
    // instrument's output. ground_truth.json is never rewritten here.
    const frozen = readJson(path.join(paths.snapshotDir, "ground_truth.json"));
    log(`revision-only: reading FROZEN ground truth (snapshot_at ${frozen.snapshot_at}, ${frozen.rows.length} rows); ground_truth.json will NOT be rewritten`);
    // Candidate selection uses the FROZEN snapshot date, not today: the rule is
    // "nearest to snapshot date minus 18 months", and the repair must reproduce
    // the edition the instrument would have chosen at the original snapshot
    // (2026-07-26 selects 2024-10, matching P0's instrument), not drift with
    // the repair date.
    await buildRevisionCheck(paths, args, bank, frozen.rows, new Date(frozen.snapshot_at));
    return;
  }

  log(`snapshotting ground truth for ${bank.questions.length} questions (run ${args.run})`);

  // ---- 1. Frozen current payload per question -------------------------------
  const rows = await mapLimit(bank.questions, 3, async (q) => {
    const start = q.year - 1;
    const end = q.year + 1;
    let body = null;
    let fetch_error = null;
    // forceRefresh: this tool's one job is capturing CURRENT ground truth — it must
    // never accept the bench's own locally-cached bytes from a prior run reusing
    // the same URL (see lib.mjs scIndicatorRobust doc for the incident this fixes).
    const r = await scIndicatorRobust(q.indicator, q.iso3, { start, end }, { attempts: 4, forceRefresh: true });
    if (r.status === 200) body = r.body;
    else fetch_error = `http_${r.status}: ${JSON.stringify(r.body?.error?.message ?? "").slice(0, 200)}`;
    const o = body ? obsFor(body, q.year) : undefined;
    const prev = body ? obsFor(body, q.year - 1) : undefined;
    const next = body ? obsFor(body, q.year + 1) : undefined;
    const seriesId = body?.series_id ?? null;
    const row = {
      qid: q.qid,
      segment: q.segment,
      indicator: q.indicator,
      iso3: q.iso3,
      year: q.year,
      value: o?.value ?? null,
      unit: body?.unit ?? null,
      series_id: seriesId,
      source_institution: seriesId?.startsWith("worldbank/") ? "World Bank"
        : seriesId?.startsWith("imf/") ? "IMF (via DataMapper)"
        : seriesId?.startsWith("dbnomics/IMF/") ? "IMF (via DBnomics)"
        : seriesId ? "other" : null,
      citation: body?.citation ?? null,
      is_projection: o ? isProjectionObs(o) : false,
      observation_note: o?.note ?? null,
      notes: body?.notes ?? [],
      retrieved_at: new Date().toISOString(),
      adjacent: {
        prev: { year: q.year - 1, value: prev?.value ?? null, is_projection: prev ? isProjectionObs(prev) : false },
        next: { year: q.year + 1, value: next?.value ?? null, is_projection: next ? isProjectionObs(next) : false },
      },
      ...(fetch_error ? { fetch_error } : {}),
    };
    // Integrity assertions for headline cells (frame drift is a logged deviation, §3.2).
    if (q.segment === "headline") {
      if (row.value == null) row.integrity_violation = "headline_value_null_at_snapshot";
      else if (row.is_projection) row.integrity_violation = "headline_projection_at_snapshot";
    }
    // Freshness sentinel (all segments): forceRefresh above bypasses the bench's
    // OWN cache, but this asserts on the field that actually matters — the
    // server's own citation.retrieved_at — so a stale response is caught even if
    // it slips through for a reason forceRefresh doesn't cover (e.g. a genuine
    // server-side caching issue, not just the bench replaying its local disk
    // cache, which is the incident that motivated this check, 2026-07-26).
    if (!row.integrity_violation && body?.citation?.retrieved_at) {
      const today = new Date().toISOString().slice(0, 10);
      if (body.citation.retrieved_at !== today) {
        row.integrity_violation = `stale_cached_response (citation.retrieved_at=${body.citation.retrieved_at}, expected ${today})`;
      }
    }
    return row;
  });

  const violations = rows.filter((r) => r.integrity_violation);
  if (violations.length) {
    log(`WARNING: ${violations.length} integrity violations (headline cells no longer eligible): ${violations.map((v) => v.qid).join(", ")}`);
    log("These must be resolved (redraw or DEVIATIONS.md entry) before models are called.");
  }

  writeJson(path.join(paths.snapshotDir, "ground_truth.json"), {
    run: args.run,
    snapshot_at: new Date().toISOString(),
    statcite_base: process.env.STATCITE_BASE || "https://statcite.com",
    n: rows.length,
    integrity_violations: violations.map((v) => v.qid),
    rows: rows.sort((a, b) => (a.qid < b.qid ? -1 : 1)),
  });
  log(`ground_truth.json written (${rows.length} rows, ${violations.length} violations)`);

  await buildRevisionCheck(paths, args, bank, rows, new Date());
}

// ---- 2. Revision check: older dated WEO vintage ------------------------------
async function buildRevisionCheck(paths, args, bank, rows, candidateDate) {
  // Applies to: (a) cells actually served from IMF WEO, (b) all recency questions on
  // indicators that have a WEO series template (projection_echo material).
  const rowByQid = new Map(rows.map((r) => [r.qid, r]));
  const targets = bank.questions.filter((q) => {
    const served = rowByQid.get(q.qid)?.series_id ?? "";
    // Both IMF channels count as WEO-served: the dated-DBnomics scheme AND the
    // DataMapper scheme (imf/CODE) that v1.3.0 moved the fiscal cells onto.
    // Matching only the DBnomics scheme silently shrank R1's instrument to zero
    // headline cells while every table still rendered — D-003.
    const weoServed = /^dbnomics\/IMF\/WEO/i.test(served) || /^imf\//i.test(served);
    const weoCapable = Boolean(WEO_SERIES_TEMPLATE[q.indicator]);
    return (weoServed && weoCapable) || (q.segment === "recency" && weoCapable);
  });
  log(`revision check: ${targets.length} WEO-relevant questions`);

  // The edition WEO:latest currently serves, as observed in the snapshot itself.
  const currentEdition = rows
    .map((r) => r.series_id?.match(/WEO:(\d{4}-\d{2})/)?.[1])
    .filter(Boolean)
    .sort()
    .pop() ?? null;
  if (currentEdition) log(`current live WEO edition (from snapshot series ids): ${currentEdition}`);
  const candidates = weoVintageCandidates(candidateDate, currentEdition);
  // Probe which dated editions exist (one cheap call per edition, USA cell).
  const probeCode = WEO_SERIES_TEMPLATE.gdp_growth.replace("{ISO3}", "USA");
  const editionExists = {};
  for (const ed of candidates) {
    const r = await scSeries(`dbnomics/IMF/WEO:${ed}/${probeCode}`, {});
    editionExists[ed] = r.status === 200 && Array.isArray(r.body?.observations) && r.body.observations.length > 0;
    log(`  WEO:${ed} ${editionExists[ed] ? "exists" : "not available"}`);
    if (editionExists[ed]) break; // candidates are ordered by preference
  }
  const edition = candidates.find((ed) => editionExists[ed]) ?? null;
  if (!edition && targets.length) {
    log("WARNING: no dated WEO edition reachable — revision_check will record vintage_unavailable");
  }

  const revRows = await mapLimit(targets, 3, async (q) => {
    const tpl = WEO_SERIES_TEMPLATE[q.indicator];
    if (!tpl || !edition) {
      return { qid: q.qid, indicator: q.indicator, iso3: q.iso3, year: q.year, vintage_edition: edition, status: tpl ? "vintage_unavailable" : "no_weo_template" };
    }
    const code = tpl.replace("{ISO3}", q.iso3);
    const id = `dbnomics/IMF/WEO:${edition}/${code}`;
    let body = null;
    try {
      const r = await scSeries(id, { start: 2015, end: 2027 });
      if (r.status === 200) body = r.body;
    } catch { /* recorded below */ }
    if (!body) {
      return { qid: q.qid, indicator: q.indicator, iso3: q.iso3, year: q.year, vintage_edition: edition, vintage_series_id: id, status: "cell_missing_in_vintage" };
    }
    const o = obsFor(body, q.year);
    const out = {
      qid: q.qid, indicator: q.indicator, iso3: q.iso3, year: q.year,
      vintage_edition: edition, vintage_series_id: body.series_id, status: "ok",
      vintage_value: o?.value ?? null,
      vintage_is_projection: o ? isProjectionObs(o) : false,
      retrieved_at: new Date().toISOString(),
    };
    if (q.segment === "recency") {
      // Store the vintage's projection values across 2023-2025 for projection_echo.
      out.vintage_projections = {};
      for (const y of [2023, 2024, 2025]) {
        const oy = obsFor(body, y);
        out.vintage_projections[y] = { value: oy?.value ?? null, is_projection: oy ? isProjectionObs(oy) : false };
      }
    }
    return out;
  });

  writeJson(path.join(paths.snapshotDir, "revision_check.json"), {
    run: args.run,
    snapshot_at: new Date().toISOString(),
    vintage_edition_used: edition,
    edition_probe: editionExists,
    rule: "dated IMF WEO edition nearest to snapshot date minus 18 months (METHODOLOGY §3.3.4); vintage agreement is diagnostic, never scored credit",
    n: revRows.length,
    rows: revRows.sort((a, b) => (a.qid < b.qid ? -1 : 1)),
  });
  log(`revision_check.json written (${revRows.length} rows, edition ${edition ?? "NONE"})`);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`snapshot_ground_truth FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
