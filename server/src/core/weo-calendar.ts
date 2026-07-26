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
