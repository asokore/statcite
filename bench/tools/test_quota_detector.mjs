// Regression test for call_gemini.mjs quota detection, against REAL captured
// error bodies — not synthetic strings. The first quota-stop fix was "verified"
// by testing a regex against one error shape and never fired in the field
// against the other (2026-08-06, three wasted sweeps). This test imports the
// ACTUAL functions and asserts the decision each body must produce.
import { isQuotaError, serverRetryDelayMs } from "./call_gemini.mjs";

// Shape A: retrieval-arm daily-cap 429, captured live 2026-08-06 by direct
// probe. NO metric name, NO RetryInfo — only a Help link. Must stop instantly.
const bodyBare = JSON.stringify({
  error: {
    code: 429,
    message:
      "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. ",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        links: [{ description: "Learn more about Gemini API quotas", url: "https://ai.google.dev/gemini-api/docs/rate-limits" }],
      },
    ],
  },
});

// Shape B: uniform-arm daily-cap 429, captured 2026-08-05/06 sweep logs.
// Carries the metric name AND a (misleadingly short) retry hint.
const bodyHinted =
  JSON.stringify({
    error: {
      code: 429,
      message:
        "You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3-flash\nPlease retry in 53.286194059s.",
      status: "RESOURCE_EXHAUSTED",
    },
  });

// Shape C: an ordinary transient 500 — must NOT be treated as quota.
const body500 = JSON.stringify({ error: { code: 500, message: "Internal error encountered.", status: "INTERNAL" } });

const cases = [
  { name: "bare RESOURCE_EXHAUSTED (retrieval arm)", r: { status: 429, ok: false, raw: bodyBare, error: JSON.parse(bodyBare).error.message }, quota: true, hintMs: undefined },
  { name: "hinted free_tier daily cap (uniform arm)", r: { status: 429, ok: false, raw: bodyHinted, error: JSON.parse(bodyHinted).error.message }, quota: true, hintMs: 53287 },
  { name: "transient 500", r: { status: 500, ok: false, raw: body500, error: "Internal error encountered." }, quota: false, hintMs: undefined },
  { name: "quota text on non-429 status is not quota", r: { status: 503, ok: false, raw: bodyBare, error: "..." }, quota: false, hintMs: undefined },
];

let failed = 0;
for (const c of cases) {
  const q = isQuotaError(c.r);
  const h = serverRetryDelayMs(c.r);
  const ok = q === c.quota && h === c.hintMs;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: isQuotaError=${q} (want ${c.quota}), hintMs=${h} (want ${c.hintMs})`);
}
// Decision-layer assertions mirroring callWithRetry's branch logic:
// bare quota => no hint => immediate stop; hinted quota => one honored retry.
const bare = cases[0].r, hinted = cases[1].r;
const bareStops = isQuotaError(bare) && !serverRetryDelayMs(bare);
const hintedRetriesOnce = isQuotaError(hinted) && Boolean(serverRetryDelayMs(hinted));
if (!bareStops) { failed++; console.log("FAIL  bare-body branch must stop immediately"); } else console.log("PASS  bare-body branch stops immediately");
if (!hintedRetriesOnce) { failed++; console.log("FAIL  hinted-body branch must retry once"); } else console.log("PASS  hinted-body branch retries once then stops");

if (failed) { console.error(`${failed} assertion(s) failed`); process.exit(1); }
console.log("all quota-detector assertions pass");
