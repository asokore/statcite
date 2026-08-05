// bench/tools/report.mjs — render runs/{run}/REPORT.md STRICTLY from scores/summary.json
// (METHODOLOGY §6: report tables are regenerated from summary.json; prose cannot edit numbers).

import { benchPaths, log, parseArgs, readJson, writeText } from "./lib.mjs";
import path from "node:path";
import fs from "node:fs";

const HELP = `report.mjs — render REPORT.md from summary.json (METHODOLOGY §6, §7)

Usage: node report.mjs --run P0 [--base DIR] [--help]

  --run RUN    Run id.
  --base DIR   Base directory (default bench/).
  --help       Show this help.

Every number in the report comes from runs/{RUN}/scores/summary.json.`;

// Verbatim strings mandated by METHODOLOGY §7 (quarantine banner + disclosure) and §0.
// P0's banner text was single-vendor-only and must NOT be stamped on every future run
// regardless of its actual roster — COVENANT §6 citability turns on vendor count, so
// the banner is derived from the run's real roster (see vendorsOf/isMultiVendor below).
const PILOT_BANNER =
  "**PILOT — METHODOLOGY VALIDATION RUN.** Claude-family models only, executed on Claude infrastructure by a Claude-assisted developer. Deterministically scored, fully reproducible — and still not for citation as a cross-model or industry finding.";
const DISCLOSURE_SINGLE_VENDOR =
  "This benchmark's harness, scoring code, and drafts were developed with the assistance of Claude (Anthropic). The pilot tests Claude-family models exclusively because multi-vendor API access was not yet provisioned. No model — Claude or otherwise — plays any role in scoring: verdicts are deterministic numeric comparisons against pinned official values, and the scoring code, prompts, raw responses, and ground truth are published in full.";
function multiVendorBanner(vendorList) {
  return (
    `**MULTI-VENDOR RUN — satisfies COVENANT §6 (>=2 non-Anthropic vendors: ${vendorList.join(", ")}).** ` +
    "Deterministically scored, fully reproducible. Per COVENANT §1, all outcomes are published regardless of direction; per §3 the quotation unit (WTR, CR, Answer Rate) travels together in any citation."
  );
}
function multiVendorDisclosure(vendorList) {
  return (
    "This benchmark's harness, scoring code, and drafts were developed with the assistance of Claude (Anthropic). " +
    `This run's roster spans ${vendorList.length + 1} vendors (Anthropic plus ${vendorList.join(" and ")}), satisfying COVENANT §6's two-non-Anthropic-vendor threshold for a citable cross-model result. ` +
    "No model — any vendor's — plays any role in scoring: verdicts are deterministic numeric comparisons against pinned official values, and the scoring code, prompts, raw responses, and ground truth are published in full."
  );
}
const CONCESSION =
  "Agentic deployments with retrieval will outperform these scores. That is expected and is not what this benchmark measures.";

// Vendor inference from model id prefix — extend this map, don't guess, when a new
// vendor's model naming scheme is added to lib.mjs's MODELS roster.
function vendorOf(model) {
  if (model.startsWith("claude")) return "Anthropic";
  if (model.startsWith("gpt") || /^o[134](-|$)/.test(model)) return "OpenAI";
  if (model.startsWith("gemini")) return "Google";
  return "Unknown";
}
function nonAnthropicVendors(models) {
  return [...new Set(models.map(vendorOf).filter((v) => v !== "Anthropic" && v !== "Unknown"))];
}
const SCOPE_CLAIM = [
  "> This benchmark measures one thing: how reliably AI assistants state official economic statistics from memory — no tools, no retrieval, no web. It is not a measure of what AI can do with a data connection. It is a measure of what happens in the many real conversations where no data connection is used, and in the moments when a model answers from memory because it believes it knows.",
  ">",
  "> Read the scores as a trust ceiling for uncited figures: a model's accuracy here tells you how far to trust a number it states in a chat window without a citation — nothing more, and nothing less.",
].join("\n");

const fmtPct = (r) => (r?.rate == null ? "—" : `${(r.rate * 100).toFixed(1)}%`);
const fmtCI = (r) => (r?.ci95 == null ? "" : ` [${(r.ci95[0] * 100).toFixed(1)}–${(r.ci95[1] * 100).toFixed(1)}]`);
const fmtKN = (r) => (r ? `${r.k}/${r.n}` : "—");

function gridEvaluation(m) {
  const h = m.headline;
  const wtr = h.WTR.rate;
  const cr = h.CR.rate;
  const ar = h.answer_rate.rate;
  if (ar == null || wtr == null) return { branch: "n/a", valid: false, reason: "insufficient data" };
  const valid = ar >= 0.7;
  let branch;
  if (wtr >= 0.85 && cr != null && cr <= 0.08) branch = "A — premise weakened";
  else if (wtr >= 0.65) branch = "B — mixed";
  else branch = "C — unreliable";
  return {
    branch, valid,
    reason: valid
      ? `WTR ${(wtr * 100).toFixed(1)}%, CR ${cr == null ? "—" : (cr * 100).toFixed(1)}%, Answer Rate ${(ar * 100).toFixed(1)}% (>= 70%: grid valid)`
      : `Answer Rate ${(ar * 100).toFixed(1)}% < 70% — grid evaluation not valid for this model (§8)`,
  };
}

function breakdownTable(models, summary, key, label) {
  const cats = new Set();
  for (const m of models) for (const k of Object.keys(summary.models[m].breakdowns[key])) cats.add(k);
  const catList = [...cats].sort((a, b) => (isFinite(a) && isFinite(b) ? Number(a) - Number(b) : a < b ? -1 : 1));
  let md = `\n### ${label}\n\n| ${label} | ${models.map((m) => `${m} WTR`).join(" | ")} |\n|---|${models.map(() => "---").join("|")}|\n`;
  for (const c of catList) {
    md += `| ${c} | ${models.map((m) => {
      const g = summary.models[m].breakdowns[key][c];
      return g ? `${fmtPct(g.wtr)} (${g.within}/${g.n})` : "—";
    }).join(" | ")} |\n`;
  }
  md += `\n*Strata cells with n<50 are descriptive only — no significance language (§5).*\n`;
  return md;
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
  const summary = readJson(path.join(paths.runDir, "scores", "summary.json"));
  const models = Object.keys(summary.models);
  if (!models.length) throw new Error("summary.json contains no scored models");

  const nonAnthropic = nonAnthropicVendors(models);
  const multiVendor = nonAnthropic.length >= 2;

  let md = `# ${summary.run} — AI Economic-Statistics Accuracy Benchmark${multiVendor ? "" : " (pilot run)"}\n\n`;
  md += `${multiVendor ? multiVendorBanner(nonAnthropic) : PILOT_BANNER}\n\n`;
  md += `${SCOPE_CLAIM}\n\n`;
  md += `${CONCESSION}\n\n`;
  md += `**Disclosure${multiVendor ? "" : " (verbatim per METHODOLOGY §7)"}:** ${multiVendor ? multiVendorDisclosure(nonAnthropic) : DISCLOSURE_SINGLE_VENDOR}\n\n`;
  md += `Run \`${summary.run}\` · scored ${summary.scored_at} · seed \`${summary.seed}\` · bank: ${summary.counts.headline} headline / ${summary.counts.recency} recency / ${summary.counts.null_probe} null probes.\n\n`;
  md += `**Protocol deviations logged for this run: ${summary.deviations_count}** (see bench/DEVIATIONS.md).\n\n`;
  if (fs.existsSync(path.join(paths.runDir, "ADDENDA.md"))) {
    md += `**Post-publication addenda for this run: see [ADDENDA.md](ADDENDA.md)** — sensitivity analyses and disclosures added after first publication.\n\n`;
  }

  md += `## Headline (Within-Tolerance Rate, refusals count against)\n\n`;
  md += `Per the quotation covenant, WTR, CR, and Answer Rate are one unit and travel together.\n\n`;
  md += `| model | WTR [95% CI] | strict | CR [95% CI] | Answer Rate | Answered Accuracy | refusals | answer_failures | format_failures | scoreable |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const m of models) {
    const h = summary.models[m].headline;
    // The dagger travels with the model NAME in the most-quoted table, so an
    // invalid-branch row cannot be screenshotted into a comparison undecorated.
    const gridInvalid = h.answer_rate?.rate != null && h.answer_rate.rate < 0.7;
    md += `| ${m}${gridInvalid ? " †" : ""} | ${fmtPct(h.WTR)}${fmtCI(h.WTR)} (${fmtKN(h.WTR)}) | ${fmtPct(h.strict_rate)} | ${fmtPct(h.CR)}${fmtCI(h.CR)} | ${fmtPct(h.answer_rate)} | ${fmtPct(h.answered_accuracy)} | ${h.refusals} | ${h.answer_failures} | ${h.format_failures} | ${h.scoreable} |\n`;
  }
  md += `\n*Wilson 95% intervals; at n≈100 the half-width is ±7–10pp. Minimum detectable model-vs-model difference ~12–15pp — no league tables at pilot scale (§5).*\n`;
  md += `\n*† Answer Rate below 70%: the §8 interpretation grid is INVALID for this model — reported for completeness, never as a comparable accuracy figure.*\n`;

  md += `\n## Revision-affected misses\n\n| model | vintage-eligible misses | revision_affected |\n|---|---|---|\n`;
  for (const m of models) {
    const h = summary.models[m].headline;
    md += `| ${m} | ${h.vintage_eligible_misses ?? "n/a (pre-D-003 scoring)"} | ${h.revision_affected} |\n`;
  }
  md += `\n*Re-judged against the older dated WEO vintage (§3.3.4): still not within-tolerance in the headline (the figure is outdated today), and per the covenant never described as model errors. The vintage-eligible column is the instrument's own coverage: all-zero there would mean the vintage instrument did not run (the D-003 failure mode), not that no miss was revision-driven.*\n`;

  md += `\n## Breakdowns\n`;
  md += breakdownTable(models, summary, "by_class", "Revision class");
  md += breakdownTable(models, summary, "by_tier", "Economy tier");
  md += breakdownTable(models, summary, "by_year", "Reference year");
  md += breakdownTable(models, summary, "by_batch_position", "Batch position");

  md += `\n## Tolerance sweep (WTR at band multiplier ×0.5 / ×1 / ×2 / ×4)\n\n| model | ${summary.sweep_multipliers.map((x) => `×${x}`).join(" | ")} |\n|---|${summary.sweep_multipliers.map(() => "---").join("|")}|\n`;
  for (const m of models) {
    md += `| ${m} | ${summary.sweep_multipliers.map((x) => fmtPct(summary.models[m].tolerance_sweep[x])).join(" | ")} |\n`;
  }
  md += `\n*No result here is a knife-edge artifact of band choice; the full signed-error distribution ships in scores/<model>.json (§4).*\n`;

  md += `\n## Signed relative error distribution (deciles)\n\n| model | n | p5 | p10 | p25 | p50 | p75 | p90 | p95 |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const m of models) {
    const d = summary.models[m].signed_rel_error_deciles;
    const f = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
    md += `| ${m} | ${d.n} | ${f(d.p5)} | ${f(d.p10)} | ${f(d.p25)} | ${f(d.p50)} | ${f(d.p75)} | ${f(d.p90)} | ${f(d.p95)} |\n`;
  }

  md += `\n## Recency supplement (2023–2025 — never scored in the headline)\n\n`;
  md += `| model | n | refused | answered | within-tol of current | mismatch vs current | uncorroborated | projection_echo |\n|---|---|---|---|---|---|---|---|\n`;
  for (const m of models) {
    const r = summary.models[m].recency;
    md += `| ${m} | ${r.scoreable} | ${r.refusals} | ${r.answered} | ${r.within_tolerance_of_current} | ${r.mismatch_vs_current} | ${r.uncorroborated_answers} | ${r.projection_echoes} |\n`;
  }
  md += `\n*A model echoing a pre-cutoff WEO forecast is repeating something it legitimately saw, not fabricating; the two are never conflated (§1.4).*\n`;

  md += `\n## Null probes (diagnostic only, n=${summary.counts.null_probe})\n\n| model | probes | fabricated | fabrication_rate [95% CI] |\n|---|---|---|---|\n`;
  for (const m of models) {
    const n = summary.models[m].null_probes;
    md += `| ${m} | ${n.scoreable} | ${n.fabricated} | ${fmtPct(n.fabrication_rate)}${fmtCI(n.fabrication_rate)} |\n`;
  }
  md += `\n*Never part of any gate or headline; n=${summary.counts.null_probe} supports no strong claim (§3.4).*\n`;

  md += `\n## Calibration (descriptive)\n\n| model | mean conf (within) | mean conf (mismatch) | mean conf (refused) |\n|---|---|---|---|\n`;
  for (const m of models) {
    const c = summary.models[m].calibration;
    const f = (x) => (x == null ? "—" : x.toFixed(2));
    md += `| ${m} | ${f(c.mean_confidence_within)} | ${f(c.mean_confidence_mismatch)} | ${f(c.mean_confidence_refused)} |\n`;
  }

  if (summary.pairwise_mcnemar?.length) {
    md += `\n## Model-vs-model (exact McNemar, Holm-corrected — report-only)\n\n*Pairs involving a model whose §8 grid branch is invalid (Answer Rate < 70%) are shown for completeness only and must not be quoted as model-vs-model comparisons.*\n\n| pair | discordant (a-only / b-only) | p | p (Holm) |\n|---|---|---|---|\n`;
    for (const p of summary.pairwise_mcnemar) {
      md += `| ${p.model_a} vs ${p.model_b} | ${p.a_only_within} / ${p.b_only_within} | ${p.p} | ${p.p_holm} |\n`;
    }
    md += `\n*No league tables at pilot scale; minimum detectable difference ~12–15pp at n=100 (§5).*\n`;
  }

  md += `\n## Permitted claims (filled templates, §5)\n\n`;
  for (const m of models) {
    const h = summary.models[m].headline;
    // The §8 grid-validity condition must travel WITH the claim text: this is
    // the copy-paste block, and an invalid-branch model's line quoted without
    // the qualifier presents a sub-70%-answer-rate score as a comparable
    // accuracy figure.
    const invalid = h.answer_rate?.rate != null && h.answer_rate.rate < 0.7;
    md += `- ${m} answered ${fmtPct(h.WTR)} of questions within the published tolerance of the current official value (95% CI${fmtCI(h.WTR) || " n/a"}; ${fmtKN(h.WTR)} scoreable), with a Confabulation Rate of ${fmtPct(h.CR)} and an Answer Rate of ${fmtPct(h.answer_rate)}.${invalid ? " **[§8 grid branch INVALID: Answer Rate below 70% — not quotable as a comparable accuracy figure]**" : ""}\n`;
  }
  md += `\n*Never: "model X is wrong Y% of the time."*\n`;

  md += `\n## Pre-committed interpretation grid (§8)\n\n| model | branch | grid valid? | basis |\n|---|---|---|---|\n`;
  for (const m of models) {
    const g = gridEvaluation(summary.models[m]);
    md += `| ${m} | ${g.branch} | ${g.valid ? "yes" : "NO"} | ${g.reason} |\n`;
  }
  md += `\n*Evaluated per model on point estimates with CIs alongside, never CI-gated; valid only when Answer Rate ≥ 70% (§8).${multiVendor ? "" : " P0 branch outcomes validate the machine — they are not citable findings (§7)."}*\n`;

  md += `\n---\n\n${multiVendor ? multiVendorBanner(nonAnthropic) : PILOT_BANNER}\n`;

  const outPath = path.join(paths.runDir, "REPORT.md");
  writeText(outPath, md);
  log(`REPORT.md written: ${outPath}`);
}

main().catch((e) => {
  console.error(`report FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
