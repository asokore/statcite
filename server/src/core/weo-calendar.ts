// IMF WEO release calendar (April/October). Shared by series.ts (DBnomics vintage
// staleness disclosure) and adapters/datamapper.ts (payload-anchored projection
// boundary sanity clamp) — factored out so datamapper.ts doesn't need to import
// series.ts (which imports datamapper.ts), avoiding a module cycle.

/** The WEO edition the IMF should have published by `now` (releases: April & October). */
export function expectedWeoEdition(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (m >= 11) return `${y}-10`;
  if (m >= 5) return `${y}-04`;
  return `${y - 1}-10`;
}

/** The edition one step before `edition` on the April/October calendar
 * ("2026-04" -> "2025-10", "2025-10" -> "2025-04"). Interim Updates (Jan/Jul)
 * are not editions in this calendar and never resolve here. */
export function previousWeoEdition(edition: string): string {
  const m = edition.match(/^(\d{4})-(04|10)$/);
  if (!m) throw new Error(`not a WEO edition: '${edition}'`);
  return m[2] === "10" ? `${m[1]}-04` : `${parseInt(m[1], 10) - 1}-10`;
}

/** Human label for the next expected WEO release after `now` — "expected"
 * phrasing only; the IMF announces exact dates, this is the calendar rule. */
export function nextExpectedWeoEditionLabel(now: Date = new Date()): string {
  const cur = expectedWeoEdition(now);
  const m = cur.match(/^(\d{4})-(04|10)$/)!;
  return m[2] === "10" ? `April ${parseInt(m[1], 10) + 1}` : `October ${m[1]}`;
}
