// What an ECCB run prints, kept pure so it can be tested.
//
// The scheduled task reads these prefixes and counts, and later sessions
// trust them without re-deriving: NEW, PUB, qry, same, SKIPPED, FAIL. A run
// that says "same" must have re-read the numbers. A run that says "SKIPPED"
// must say what the skip rested on, because a skip on the bank's stamp and a
// skip on our comparison of its live page are different grounds.

const PREFIX = {
  unchanged: "same",
  "stamp-withdrawn": "same",
  "stamp-restored": "same",
  new: "NEW ",
  republished: "PUB ",
  "our-query-changed": "qry ",
};

/** One per-geography line. */
export function lineFor(x) {
  if (!x.ok) return `  FAIL ${x.iso3}  ${x.problems.join(" | ")}`;
  const note =
    x.state === "stamp-withdrawn" ? "  (values identical; the bank's withdrawn stamp removed from our file)"
    : x.state === "stamp-restored" ? "  (values identical; the bank's stamp is back)"
    : "";
  return `  ${PREFIX[x.state] ?? "??? "} ${x.iso3}  rows=${x.rows} periods=${x.periods}  ${x.dataAsAt ? `data as at ${x.dataAsAt}` : "no source stamp"}${note}`;
}

/**
 * Fold the per-table results of one run into its printed report.
 * Returns the per-table lines and the closing footer separately (the runner
 * prints each table as it finishes, then the footer once), plus the failure
 * count so the caller owns the exit code.
 */
export function summarise(tableResults, { freq } = {}) {
  const tableLines = [];
  const footer = [];
  const lines = tableLines;
  let failures = 0;
  let skippedTables = 0;
  let skippedByContent = 0;
  let requestsSaved = 0;
  let stampless = 0;
  let withdrawn = 0;
  for (const r of tableResults) {
    if (r.skipped) {
      skippedTables++;
      if (r.basis === "content") skippedByContent++;
      requestsSaved += r.requestsSaved ?? 0;
      lines.push(`\n${r.tableId} [${freq ?? r.freq}] — SKIPPED, ${r.reason}`);
      continue;
    }
    const ok = r.results.filter((x) => x.ok).length;
    lines.push(`\n${r.tableId} [${freq ?? r.freq}] — ${ok}/${r.results.length} geographies`);
    for (const x of r.results) {
      if (!x.ok) failures++;
      else {
        if (!x.dataAsAt) stampless++;
        if (x.state === "stamp-withdrawn") withdrawn++;
      }
      lines.push(lineFor(x));
    }
  }
  if (skippedTables) {
    const byStamp = skippedTables - skippedByContent;
    footer.push(`\nSKIPPED ${skippedTables} table(s) — ${byStamp} on an unmoved "Data as at" stamp, ${skippedByContent} because the bank prints no stamp and its live default rendering matched our stored data — ${requestsSaved} request(s) not made.`);
    footer.push("Run with --deep to re-read them anyway (catches a silent correction the stamp or the default rendering could not show).");
  }
  if (stampless) {
    footer.push(`\nNOTE: ${stampless} series were read with NO "Data as at" stamp. ECCB stopped printing it in September 2026; those documents carry no data_as_at, and none is borrowed from an earlier run.`);
  }
  if (withdrawn) {
    footer.push(`NOTE: ${withdrawn} of those had held a stamp from an earlier run. Their values are identical; the files change only by losing the stamp, so the next publish will show them as changed.`);
  }
  footer.push(failures === 0 ? "\nINGEST: all series passed their sentinels" : `\nINGEST: ${failures} series FAILED — see above`);
  return { tableLines, footer, failures, counts: { skippedTables, skippedByContent, requestsSaved, stampless, withdrawn } };
}
