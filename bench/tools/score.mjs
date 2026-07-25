// bench/tools/score.mjs — deterministic scorer (METHODOLOGY §4, §5).
//
// No LLM and no human anywhere in this loop. Band constants live below as in-file
// literals (pre-registered provisional values, §4): Class A == StatCite's published
// verify bands (equivalence-tested against server judge() by equivalence.test.mjs);
// Class B/C widen only the "close" band for revision behavior. Unit normalization
// uses ONLY the model's declared unit string (lib.mjs normalizeDeclaredUnit) — never
// the value's magnitude. Ground truth comes ONLY from the frozen snapshot; scoring
// never touches the live API.
//
// Outputs: {base}/runs/{run}/scores/<model>.json + {base}/runs/{run}/scores/summary.json.

import {
  MODELS, benchPaths, countDeviations, log, normalizeDeclaredUnit, parseArgs, readJson,
  wilson, writeJson,
} from "./lib.mjs";
import path from "node:path";
import fs from "node:fs";

const HELP = `score.mjs — deterministic scoring for a run (METHODOLOGY §4-§5)

Usage: node score.mjs --run P0 [--base DIR] [--help]

  --run RUN    Run id.
  --base DIR   Base directory (default bench/).
  --help       Show this help.

Inputs: questions/{RUN}.json, {RUN}-batches.json, snapshots/{RUN}/ground_truth.json,
snapshots/{RUN}/revision_check.json, runs/{RUN}/responses/<model>.json.
Outputs: runs/{RUN}/scores/<model>.json and runs/{RUN}/scores/summary.json.`;

// ---------------------------------------------------------------------------
// §4 tolerance bands — in-file literals (pre-registered provisional values).
// Class A == StatCite verify defaults (server/src/core/verify.ts judge()).
// B/C widen the close band only; match bands are identical across classes.
// Level-kind close bands never tighten below the product's public 5% default;
// the benchmark only ever relaxes relative to what any API user gets.
// ---------------------------------------------------------------------------
export const BANDS = {
  A: {
    percent: { match_pp: 0.06, match_rel: 0.005, close_pp: 0.3, close_rel: 0.02 },
    level: { match_rel: 0.005, close_rel: 0.05 },
  },
  B: {
    percent: { match_pp: 0.06, match_rel: 0.005, close_pp: 0.5, close_rel: 0.03 },
    level: { match_rel: 0.005, close_rel: 0.05 },
  },
  C: {
    percent: { match_pp: 0.06, match_rel: 0.005, close_pp: 1.0, close_rel: 0.05 },
    level: { match_rel: 0.005, close_rel: 0.05 },
  },
};

/** Threshold when the official value is exactly 0 (mirrors server judge()). */
export const ZERO_OFFICIAL_CLOSE_ABS = 0.05;

/**
 * Band verdict. Mirrors server/src/core/verify.ts judge() exactly for Class A
 * (both kinds); B/C relax the close band per BANDS. `mult` is the tolerance-sweep
 * multiplier applied to every threshold (1 = registered bands).
 */
export function judgeBand(claimed, official, kind, revisionClass, mult = 1) {
  const b = BANDS[revisionClass]?.[kind];
  if (!b) throw new Error(`no band for class=${revisionClass} kind=${kind}`);
  const absDiff = Math.abs(claimed - official);
  if (absDiff === 0) return "match";
  if (official === 0) return absDiff <= ZERO_OFFICIAL_CLOSE_ABS * mult ? "close" : "mismatch";
  const relDiff = absDiff / Math.abs(official);
  if (kind === "percent") {
    if (absDiff <= b.match_pp * mult || relDiff <= b.match_rel * mult) return "match";
    if (absDiff <= b.close_pp * mult || relDiff <= b.close_rel * mult) return "close";
    return "mismatch";
  }
  if (relDiff <= b.match_rel * mult) return "match";
  if (relDiff <= b.close_rel * mult) return "close";
  return "mismatch";
}

const SWEEP_MULTIPLIERS = [0.5, 1, 2, 4];
const SCALE_SLIP_FACTORS = [100, 1000, 1e6, 1e9, 1e12];

function scaleSlip(ratio) {
  if (ratio == null || ratio <= 0) return null;
  for (const f of SCALE_SLIP_FACTORS) {
    if (Math.abs(ratio - f) / f <= 0.02) return f;
    if (Math.abs(ratio - 1 / f) * f <= 0.02) return 1 / f;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exact McNemar (two-sided binomial on discordant pairs) + Holm correction.
// ---------------------------------------------------------------------------
export function mcnemarExact(b, c) {
  const n = b + c;
  if (n === 0) return { b, c, n, p: 1 };
  const k = Math.min(b, c);
  // P(X <= k), X ~ Binomial(n, 0.5); iterate pmf in log space free (n <= ~120).
  let pmf = Math.pow(0.5, n); // P(X=0)
  let cum = pmf;
  for (let i = 1; i <= k; i++) {
    pmf = (pmf * (n - i + 1)) / i;
    cum += pmf;
  }
  let p = 2 * cum;
  if (b === c) p -= Math.pow(0.5, n) * binom(n, k); // don't double-count the center term
  return { b, c, n, p: Math.min(1, p) };
}

function binom(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i;
  return r * Math.pow(0.5, 0); // coefficient only
}

export function holm(pvals) {
  // pvals: [{key, p}] -> adds p_holm.
  const sorted = [...pvals].sort((a, b) => a.p - b.p);
  const m = sorted.length;
  let running = 0;
  for (let i = 0; i < m; i++) {
    const adj = Math.min(1, (m - i) * sorted[i].p);
    running = Math.max(running, adj);
    sorted[i].p_holm = running;
  }
  return pvals;
}

// ---------------------------------------------------------------------------

function pct(x) {
  return x == null ? null : Number((x * 100).toFixed(2));
}

function rate(k, n) {
  const w = wilson(k, n);
  return { k, n, rate: w.p == null ? null : Number(w.p.toFixed(4)), ci95: w.p == null ? null : [Number(w.lo.toFixed(4)), Number(w.hi.toFixed(4))] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.run) throw new Error("--run is required (see --help)");
  const paths = benchPaths(args.base, args.run);

  const bank = readJson(paths.questions);
  const batchesFile = readJson(paths.batches);
  const snapshot = readJson(path.join(paths.snapshotDir, "ground_truth.json"));
  const revCheckPath = path.join(paths.snapshotDir, "revision_check.json");
  const revCheck = fs.existsSync(revCheckPath) ? readJson(revCheckPath) : { rows: [] };

  const qByQid = new Map(bank.questions.map((q) => [q.qid, q]));
  const gtByQid = new Map(snapshot.rows.map((r) => [r.qid, r]));
  const revByQid = new Map(revCheck.rows.map((r) => [r.qid, r]));

  // batch position per model per qid (1-based index in the model's presented order).
  const positionOf = {};
  for (const model of MODELS) {
    positionOf[model] = new Map();
    const order = batchesFile.model_order?.[model] ?? {};
    for (const [batchId, qids] of Object.entries(order)) {
      qids.forEach((qid, i) => positionOf[model].set(qid, { batch_id: batchId, position: i + 1 }));
    }
  }

  const summary = {
    run: args.run,
    scored_at: new Date().toISOString(),
    seed: bank.seed,
    bands: BANDS,
    zero_official_close_abs: ZERO_OFFICIAL_CLOSE_ABS,
    sweep_multipliers: SWEEP_MULTIPLIERS,
    deviations_count: countDeviations(),
    counts: bank.counts,
    models: {},
    pairwise_mcnemar: [],
  };

  const headlineOutcomeByModel = {}; // qid -> within-tolerance boolean (scoreable only)

  for (const model of MODELS) {
    const respPath = path.join(paths.runDir, "responses", `${model}.json`);
    if (!fs.existsSync(respPath)) {
      log(`SKIP ${model}: no responses file at ${respPath}`);
      continue;
    }
    const responses = readJson(respPath);
    const rows = [];

    for (const q of bank.questions) {
      const rec = responses.items[q.qid];
      const gt = gtByQid.get(q.qid);
      const rev = revByQid.get(q.qid);
      const pos = positionOf[model].get(q.qid) ?? null;
      const row = {
        qid: q.qid, segment: q.segment, indicator: q.indicator, revision_class: q.revision_class,
        kind: q.kind, iso3: q.iso3, tier: q.tier, year: q.year,
        batch_id: pos?.batch_id ?? null, batch_position: pos?.position ?? null,
        official_value: gt?.value ?? null,
        confidence: rec?.confidence ?? null,
        repaired: rec?.repaired ?? false,
      };
      rows.push(row);

      if (!rec || rec.format_failure) {
        row.status = "format_failure";
        row.failure_reason = rec?.failure_reason ?? "no_record";
        continue;
      }
      if (rec.refused === true) {
        row.status = "refusal";
        continue;
      }
      if (rec.value == null || typeof rec.value !== "number") {
        // Answered (refused:false) but no numeric value: counts against the model (§2.4).
        row.status = "answer_failure";
        row.failure_reason = "non_numeric_value_not_refused";
        continue;
      }
      const norm = normalizeDeclaredUnit(rec.unit, q.kind);
      if (!norm.ok) {
        row.status = "answer_failure";
        row.failure_reason = `unit:${norm.reason}`;
        row.declared_unit = rec.unit;
        continue;
      }
      const claimed = rec.value * norm.factor;
      row.declared_unit = rec.unit;
      row.unit_factor = norm.factor;
      row.normalized_value = claimed;
      row.year_basis = rec.year_basis;

      // ---- Null probes: never graded numerically (§3.4). ----
      if (q.segment === "null_probe") {
        row.status = "fabricated"; // answered a number where no official value exists
        continue;
      }

      const official = gt?.value ?? null;

      // ---- Recency (§1.4): reported separately, never in the headline. ----
      if (q.segment === "recency") {
        const echoSrc = rev?.vintage_projections?.[q.year];
        const echoVal = echoSrc?.value ?? rev?.vintage_value ?? null;
        if (echoVal != null) {
          row.projection_echo = judgeBand(claimed, echoVal, q.kind, q.revision_class) !== "mismatch";
          row.echo_vintage_value = echoVal;
          row.echo_vintage_edition = rev?.vintage_edition ?? null;
        } else {
          row.projection_echo = null; // no vintage material for this cell
        }
        if (official != null) {
          row.status = judgeBand(claimed, official, q.kind, q.revision_class);
          row.official_is_projection = gt?.is_projection ?? false;
          row.signed_rel_error = official !== 0 ? (claimed - official) / Math.abs(official) : null;
        } else {
          row.status = "uncorroborated_answer"; // no current official value for the asked year
        }
        continue;
      }

      // ---- Headline verdict. ----
      const verdict = judgeBand(claimed, official, q.kind, q.revision_class);
      row.status = verdict;
      row.signed_rel_error = official !== 0 ? (claimed - official) / Math.abs(official) : null;
      row.sweep = {};
      for (const m of SWEEP_MULTIPLIERS) {
        row.sweep[m] = judgeBand(claimed, official, q.kind, q.revision_class, m);
      }

      if (verdict === "mismatch") {
        // Diagnostics (subtype labels; deterministic, model column not consulted).
        const diag = [];
        const ratio = official !== 0 ? claimed / official : null;
        const slip = scaleSlip(ratio);
        if (slip != null) diag.push(`scale_slip:${slip >= 1 ? slip : `1/${1 / slip}`}`);
        if (ratio != null && ratio < 0 && Math.abs(-ratio - 1) <= 0.02) diag.push("sign_error");
        // Adjacent-year: snapshot ±1 values ONLY (never the live API).
        for (const [label, adj] of [["prev", gt?.adjacent?.prev], ["next", gt?.adjacent?.next]]) {
          if (adj?.value != null && judgeBand(claimed, adj.value, q.kind, q.revision_class) !== "mismatch") {
            diag.push(`adjacent_year:${label}:${adj.year}`);
          }
        }
        row.diagnostics = diag;
        // revision_affected relabel (§3.3.4): still a headline miss, but re-judged
        // against the older WEO vintage; never described as a model error.
        if (rev && rev.status === "ok" && rev.vintage_value != null) {
          row.revision_affected = judgeBand(claimed, rev.vintage_value, q.kind, q.revision_class) !== "mismatch";
          row.vintage_value = rev.vintage_value;
          row.vintage_edition = rev.vintage_edition;
        } else {
          row.revision_affected = false;
        }
      }
    }

    // ------------------------------------------------------------------ metrics
    const H = rows.filter((r) => r.segment === "headline");
    const scoreable = H.filter((r) => r.status !== "format_failure");
    // attempted = answered with a gradable number (§5); answer_failures are in
    // scoreable (they count against WTR) but not in the CR denominator.
    const numericAttempted = scoreable.filter((r) => ["match", "close", "mismatch"].includes(r.status));
    const within = scoreable.filter((r) => r.status === "match" || r.status === "close");
    const strict = scoreable.filter((r) => r.status === "match");
    const mismatch = scoreable.filter((r) => r.status === "mismatch");
    const refusals = scoreable.filter((r) => r.status === "refusal");
    const answerFailures = scoreable.filter((r) => r.status === "answer_failure");
    const formatFailures = H.filter((r) => r.status === "format_failure");

    function breakdown(keyFn) {
      const groups = new Map();
      for (const r of scoreable) {
        const k = keyFn(r);
        if (k == null) continue;
        if (!groups.has(k)) groups.set(k, { n: 0, within: 0, strict: 0, mismatch: 0, refusal: 0 });
        const g = groups.get(k);
        g.n++;
        if (r.status === "match" || r.status === "close") g.within++;
        if (r.status === "match") g.strict++;
        if (r.status === "mismatch") g.mismatch++;
        if (r.status === "refusal") g.refusal++;
      }
      return Object.fromEntries(
        [...groups.entries()]
          .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1))
          .map(([k, g]) => [k, { ...g, wtr: rate(g.within, g.n) }]),
      );
    }

    const sweep = {};
    for (const m of SWEEP_MULTIPLIERS) {
      let w = 0;
      for (const r of scoreable) {
        if (r.sweep && (r.sweep[m] === "match" || r.sweep[m] === "close")) w++;
      }
      sweep[m] = rate(w, scoreable.length);
    }

    const relErrors = scoreable.filter((r) => r.signed_rel_error != null).map((r) => Number(r.signed_rel_error.toFixed(6))).sort((a, b) => a - b);
    const q_ = (p) => (relErrors.length ? relErrors[Math.min(relErrors.length - 1, Math.floor(p * relErrors.length))] : null);

    const confBy = (rowsSel) => {
      const cs = rowsSel.map((r) => r.confidence).filter((c) => typeof c === "number");
      return cs.length ? Number((cs.reduce((a, b) => a + b, 0) / cs.length).toFixed(3)) : null;
    };

    const R = rows.filter((r) => r.segment === "recency");
    const rScoreable = R.filter((r) => r.status !== "format_failure");
    const rAnswered = rScoreable.filter((r) => !["refusal", "answer_failure"].includes(r.status));
    const N = rows.filter((r) => r.segment === "null_probe");
    const nScoreable = N.filter((r) => r.status !== "format_failure");
    const nFabricated = nScoreable.filter((r) => r.status === "fabricated");

    const modelSummary = {
      model,
      headline: {
        n_questions: H.length,
        format_failures: formatFailures.length,
        scoreable: scoreable.length,
        match: strict.length,
        close: within.length - strict.length,
        mismatch: mismatch.length,
        refusals: refusals.length,
        answer_failures: answerFailures.length,
        attempted: numericAttempted.length,
        WTR: rate(within.length, scoreable.length),
        strict_rate: rate(strict.length, scoreable.length),
        CR: rate(mismatch.length, numericAttempted.length),
        answer_rate: rate(numericAttempted.length, scoreable.length),
        answered_accuracy: rate(within.length, numericAttempted.length),
        format_failure_rate: rate(formatFailures.length, H.length),
        revision_affected: scoreable.filter((r) => r.revision_affected).length,
        repaired: H.filter((r) => r.repaired).length,
      },
      breakdowns: {
        by_class: breakdown((r) => r.revision_class),
        by_tier: breakdown((r) => r.tier),
        by_year: breakdown((r) => r.year),
        by_batch_position: breakdown((r) => r.batch_position),
      },
      tolerance_sweep: sweep,
      signed_rel_error_deciles: relErrors.length
        ? { n: relErrors.length, p5: q_(0.05), p10: q_(0.1), p25: q_(0.25), p50: q_(0.5), p75: q_(0.75), p90: q_(0.9), p95: q_(0.95) }
        : { n: 0 },
      calibration: {
        mean_confidence_within: confBy(within),
        mean_confidence_mismatch: confBy(mismatch),
        mean_confidence_refused: confBy(refusals),
        note: "descriptive at this n (METHODOLOGY §5)",
      },
      recency: {
        n: R.length,
        scoreable: rScoreable.length,
        refusals: rScoreable.filter((r) => r.status === "refusal").length,
        answered: rAnswered.length,
        within_tolerance_of_current: rAnswered.filter((r) => r.status === "match" || r.status === "close").length,
        mismatch_vs_current: rAnswered.filter((r) => r.status === "mismatch").length,
        uncorroborated_answers: rAnswered.filter((r) => r.status === "uncorroborated_answer").length,
        projection_echoes: rAnswered.filter((r) => r.projection_echo === true).length,
        note: "never scored in the headline; projection_echo (model repeating a pre-cutoff WEO forecast) is never conflated with fabrication (§1.4)",
      },
      null_probes: {
        n: N.length,
        scoreable: nScoreable.length,
        fabricated: nFabricated.length,
        fabrication_rate: rate(nFabricated.length, nScoreable.length),
        note: "diagnostic only, never part of any gate or headline (§3.4)",
      },
    };

    headlineOutcomeByModel[model] = new Map(
      scoreable.map((r) => [r.qid, r.status === "match" || r.status === "close"]),
    );

    writeJson(path.join(paths.runDir, "scores", `${model}.json`), {
      run: args.run, model, scored_at: summary.scored_at, bands: BANDS,
      summary: modelSummary, signed_rel_errors: relErrors, rows,
    });
    summary.models[model] = modelSummary;
    log(`${model}: WTR ${modelSummary.headline.WTR.k}/${modelSummary.headline.WTR.n} (${pct(modelSummary.headline.WTR.rate)}%), CR ${pct(modelSummary.headline.CR.rate)}%, AR ${pct(modelSummary.headline.answer_rate.rate)}%`);
  }

  // ---- Pairwise McNemar (exact, on discordant within-tolerance pairs) + Holm.
  const scored = Object.keys(headlineOutcomeByModel);
  const pairs = [];
  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      const A = headlineOutcomeByModel[scored[i]];
      const B = headlineOutcomeByModel[scored[j]];
      let b = 0, c = 0, common = 0;
      for (const [qid, aWin] of A) {
        if (!B.has(qid)) continue;
        common++;
        const bWin = B.get(qid);
        if (aWin && !bWin) b++;
        if (!aWin && bWin) c++;
      }
      const t = mcnemarExact(b, c);
      pairs.push({ model_a: scored[i], model_b: scored[j], common_scoreable: common, a_only_within: b, b_only_within: c, p: Number(t.p.toFixed(6)) });
    }
  }
  holm(pairs);
  summary.pairwise_mcnemar = pairs.map((p) => ({ ...p, p_holm: Number(p.p_holm.toFixed(6)), note: "report-only; no league tables at pilot scale (§5)" }));

  writeJson(path.join(paths.runDir, "scores", "summary.json"), summary);
  log(`summary.json written for ${scored.length} models`);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`score FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
