// ECCB ingest — fetch, validate, snapshot.
//
// Design commitments from SCOPING.md §3, and the reasons they are not
// negotiable:
//
//  - DATED VINTAGES FROM DAY ONE. Every run writes an immutable snapshot next
//    to the mutable "latest" file. It is cheap now and impossible to
//    retrofit, and for these series no other vintage archive exists anywhere
//    in the world — if we do not keep the history, nobody has it.
//  - SENTINELS THAT FAIL LOUD. A scrape that silently returns a page without
//    the expected rows must abort the series, not write an empty file that
//    reads as "the source publishes nothing". The distinction between "source
//    moved" and "no new data" is the whole difference between honest absence
//    and a fabricated one.
//  - data_as_at IS THE SOURCE'S CLAIM, retrieved_at IS OURS. They are recorded
//    separately and never conflated. A citation that presents our fetch time
//    as the data's currency is a lie by formatting.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { openTableSession, fetchGeography, parseTable, ECCB_GEOGRAPHIES } from "./fetch.mjs";
import { TABLES, tableById, tableUrl, isPerCountry } from "./catalogue.mjs";
import { compareWithExisting, classifyChange, QUIET_STATES } from "../changed.mjs";
import { loadLedger, saveLedger, noteCheck, canSkip, ledgerAllowsContentSkip, windowKey } from "../checkpoint.mjs";

export const DATA_DIR = path.resolve(process.cwd(), "data", "eccb");

/** Parse "28 July 2026" into an ISO date so freshness is comparable across
 * runs. Returns undefined rather than a guess when the stamp is unparseable —
 * an unparseable stamp is a sentinel failure, not a date to invent. */
//
// Parsed by hand, not with `new Date(...)`: V8's lenient parser reads any word
// starting "Jul" as July, so "28 Julember 2026" came back as 2026-07-28 and a
// garbled stamp passed as a real one (found 2026-09-30 by the test that now
// pins it). Full month names or their three-letter forms only, and the day
// must exist in that month.
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export function parseDataAsAt(stamp) {
  if (!stamp) return undefined;
  const m = /^\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(String(stamp));
  if (!m) return undefined;
  const word = m[2].toLowerCase();
  const month = MONTH_NAMES.findIndex((n) => n === word || (word.length === 3 && n.startsWith(word))) + 1;
  if (!month) return undefined;
  const day = Number(m[1]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return undefined;
  return d.toISOString().slice(0, 10);
}

/**
 * Shape sentinel. Returns a list of problems; empty means the payload looks
 * like what this table is supposed to be.
 *
 * Deliberately checks the fields a CONSUMER reads (row labels, periods,
 * numeric values, provenance), not merely that some HTML came back — a 200
 * with a redesigned page would pass any weaker check.
 */
export function validateTable(def, table, dataAsAt, { stampPhrase = false } = {}) {
  const problems = [];
  if (!table) return ["no table element found in the response"];
  if (!table.periods?.length) problems.push("no period columns parsed");
  if (!table.rows?.length) problems.push("no data rows parsed");
  for (const needle of def.sentinelRows ?? []) {
    if (!table.rows.some((r) => r.label.toLowerCase().startsWith(needle.toLowerCase()))) {
      problems.push(`expected row missing: "${needle}" — the source layout may have changed`);
    }
  }
  const numeric = (table.rows ?? []).flatMap((r) => r.values).filter((v) => v != null);
  if (numeric.length === 0) problems.push("every cell parsed to null — number formatting may have changed");
  // An ABSENT stamp is no longer a shape failure: the bank withdrew it from
  // every table in September 2026 (see extractDataAsAt), and failing on it
  // blocked 153 of 153 series whose tables parsed perfectly. A stamp that IS
  // printed but will not parse still fails, because that is a real change of
  // shape and a guessed date would be an invented provenance claim.
  if (dataAsAt !== undefined && !parseDataAsAt(dataAsAt)) problems.push(`unparseable "Data as at" stamp: ${dataAsAt}`);
  // Absent means absent: no currency phrase anywhere on the page. A phrase in
  // a shape extractDataAsAt does not know is the bank restoring its stamp, and
  // accepting the series as stampless would drop that claim and let the
  // Worker say the bank prints none.
  if (dataAsAt === undefined && stampPhrase) {
    problems.push('a "Data as at" phrase is printed in a form extractDataAsAt does not recognise; the bank may have restored its stamp, so teach the extractor rather than accept the series as stampless');
  }
  return problems;
}

/** Build the published series document for one table+geography+frequency. */
export function buildDocument({ def, iso3, name, freq, url, table, dataAsAt, retrievedAt }) {
  return {
    source: "Eastern Caribbean Central Bank",
    source_id: "eccb",
    source_url: url,
    table_id: def.id,
    table_title: def.title,
    country: { iso3, name },
    frequency: freq,
    // The bank's own currency stamp and our retrieval time, kept apart.
    data_as_at: parseDataAsAt(dataAsAt),
    data_as_at_raw: dataAsAt,
    retrieved_at: retrievedAt,
    periods: table.periods,
    // Raw source labels kept alongside the normalised ones: normalising without
    // preserving the original would destroy the ability to prove what the bank
    // actually printed.
    periods_raw: table.periodsRaw,
    series: table.rows.map((r) => ({
      label: r.label,
      unit: r.unit,
      observations: table.periods.map((p, i) => ({ period: p, value: r.values[i] ?? null })),
    })),
  };
}

async function writeJson(file, doc) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

/**
 * Where a vintage goes. A stamped document is filed under the bank's own date,
 * as it always was. A stampless one is filed under the full retrieval
 * timestamp with an explicit "retrieved-" marker, for two reasons found in
 * review: a bare day ("XCU.2026-09-30.json") would read as a bank date it is
 * not, and two revisions on one day would overwrite each other, losing the
 * first vintage. Written with the exclusive flag, so a stampless vintage can
 * never be replaced once written.
 */
export function snapshotName(iso3, doc, retrievedAt) {
  return doc.data_as_at
    ? `${iso3}.${doc.data_as_at}.json`
    : `${iso3}.retrieved-${String(retrievedAt).replace(/[:.]/g, "-")}.json`;
}

async function writeSnapshot(dir, iso3, doc, retrievedAt) {
  const file = path.join(dir, snapshotName(iso3, doc, retrievedAt));
  if (doc.data_as_at) return writeJson(file, doc);
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(doc, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
}

/**
 * Do the documents we already hold agree they were built from `liveStamp`?
 *
 * The ledger is our own bookkeeping and is deliberately not trusted on its
 * own. If it ever drifts from the data on disk, the cost must be a redundant
 * fetch and never a skipped update, so any missing file, unreadable file or
 * disagreeing stamp vetoes the skip.
 */
export async function storedStampsAgree(def, freq, geographies, dataDir, liveStamp) {
  const held = [];
  for (const g of geographies) {
    let doc;
    try {
      doc = JSON.parse(await readFile(path.join(dataDir, def.id, freq, `${g.iso3}.json`), "utf8"));
    } catch {
      return { ok: false, why: `no stored document for ${g.iso3}` };
    }
    if (doc.data_as_at_raw !== liveStamp) {
      return { ok: false, why: `${g.iso3} holds stamp "${doc.data_as_at_raw}", live page says "${liveStamp}"` };
    }
    held.push({ iso3: g.iso3, rows: doc.series?.length ?? 0, periods: doc.periods?.length ?? 0, dataAsAt: doc.data_as_at });
  }
  return { ok: true, held };
}

/**
 * With no stamp: does the bank's LIVE default rendering agree cell for cell
 * with the document we hold for the geography it rendered?
 *
 * This replaces the stamp as the evidence for a skip, and it is weaker in one
 * known way: the default rendering shows one geography over the bank's default
 * window (ECCU, about five years), so a revision confined to another country,
 * or to a year outside that window, cannot be seen here. The Sunday deep run
 * re-reads everything and bounds how long such a change could hide to seven
 * days, which is the same bound the stamp gave for a silent correction.
 *
 * Every condition fails toward fetching:
 *   - the page must say which geography it rendered, and we must hold it
 *   - every geography we would fetch must have a stored document, and every
 *     one must come from the single full fetch the ledger records. Without
 *     this, a fetch that failed on one country but rewrote the ECCU file
 *     would let the next run skip on the fresh ECCU file while the failed
 *     country stayed stale (reproduced by review, 2026-09-30).
 *   - no stored document may still carry a stamp the live page no longer
 *     prints: that stamp is the bank's withdrawn claim, and the fetch that
 *     follows rebuilds the documents without it
 *   - the rows must be the same labels in the same order (labels repeat on
 *     these tables, e.g. several "Domestic", so position is the key, not name)
 *   - every live period must be one we hold, with the identical value
 *   - the stored document must hold no value later than the live page's last
 *     period, because a default window that moved BACK means the bank
 *     withdrew its latest period (stored documents pad later periods of our
 *     window with null, so a value there is real data the page no longer shows)
 */
export async function storedContentAgrees(def, freq, geographies, dataDir, { liveTable, defaultCountryCode, lastFullFetchAt }) {
  if (!liveTable?.periods?.length || !liveTable.rows?.length) return { ok: false, why: "live default rendering did not parse" };
  if (!lastFullFetchAt) return { ok: false, why: "no full fetch on record to tie the stored files to" };
  const shown = geographies.find((g) => g.code === defaultCountryCode);
  if (!shown) return { ok: false, why: `live page rendered geography code ${defaultCountryCode ?? "(unstated)"}, which this run does not hold` };
  const held = [];
  let shownDoc;
  for (const g of geographies) {
    let doc;
    try {
      doc = JSON.parse(await readFile(path.join(dataDir, def.id, freq, `${g.iso3}.json`), "utf8"));
    } catch {
      return { ok: false, why: `no stored document for ${g.iso3}` };
    }
    if (doc.retrieved_at !== lastFullFetchAt) {
      return { ok: false, why: `${g.iso3} was last written ${doc.retrieved_at}, not by the full fetch of ${lastFullFetchAt}` };
    }
    if (doc.data_as_at !== undefined || doc.data_as_at_raw !== undefined) {
      return { ok: false, why: `${g.iso3} still carries the stamp "${doc.data_as_at_raw ?? doc.data_as_at}", which the bank no longer prints` };
    }
    if (g === shown) shownDoc = doc;
    held.push({ iso3: g.iso3, rows: doc.series?.length ?? 0, periods: doc.periods?.length ?? 0, dataAsAt: doc.data_as_at });
  }
  const series = shownDoc.series ?? [];
  const lastLive = liveTable.periods[liveTable.periods.length - 1];
  for (const s of series) {
    const later = (s.observations ?? []).find((o) => o.period > lastLive && o.value !== null && o.value !== undefined);
    if (later) return { ok: false, why: `${shown.iso3}: stored "${s.label}" has ${later.period} = ${later.value}, past the live page's last period ${lastLive}` };
  }
  if (series.length !== liveTable.rows.length) {
    return { ok: false, why: `${shown.iso3}: live page has ${liveTable.rows.length} rows, stored has ${series.length}` };
  }
  for (let i = 0; i < series.length; i++) {
    const live = liveTable.rows[i];
    if (series[i].label !== live.label) return { ok: false, why: `${shown.iso3}: row ${i + 1} is "${live.label}" live, "${series[i].label}" stored` };
    if (series[i].unit !== live.unit) return { ok: false, why: `${shown.iso3}: "${live.label}" unit is ${live.unit} live, ${series[i].unit} stored` };
    const stored = new Map((series[i].observations ?? []).map((o) => [o.period, o.value]));
    for (let j = 0; j < liveTable.periods.length; j++) {
      const p = liveTable.periods[j];
      if (!stored.has(p)) return { ok: false, why: `${shown.iso3}: live period ${p} is not in the stored document` };
      const v = live.values[j] ?? null;
      if (stored.get(p) !== v) return { ok: false, why: `${shown.iso3}: "${live.label}" ${p} is ${v} live, ${stored.get(p)} stored` };
    }
  }
  return { ok: true, held, compared: series.length * liveTable.periods.length };
}

/**
 * Ingest one table across geographies at one frequency.
 * Returns a per-geography status report. Nothing is written for a geography
 * whose sentinel failed.
 *
 * `deep` forces a full re-read, ignoring the stamp shortcut below. A stamp is
 * the bank's CLAIM about its own currency; a silent correction that left the
 * stamp untouched would slip past an incremental run, so the deep run is what
 * bounds how long such a correction could hide. Daily incremental, weekly deep.
 */
export async function ingestTable(tableId, { freq = "a", geographies = ECCB_GEOGRAPHIES, startDate, endDate, dataDir = DATA_DIR, gapMs = 1200, deep = false, now } = {}) {
  const def = tableById.get(tableId);
  if (!def) throw new Error(`unknown table id '${tableId}'`);
  if (!def.frequencies.includes(freq)) {
    throw new Error(
      `table '${tableId}' does not publish frequency '${freq}' (has: ${def.frequencies.join(", ")}). This is a request error, not an absence of data.`,
    );
  }
  // `now` exists for tests; a real run always stamps its own clock.
  const retrievedAt = now ?? new Date().toISOString();
  const results = [];
  let session;
  let sessionUrl;

  const perCountry = isPerCountry(def);
  const ledgerKey = `${def.id}/${freq}`;
  const window = windowKey(startDate, endDate);
  const ledger = await loadLedger(dataDir);
  // The windows classifyChange may use to excuse a moved period set. Only a
  // recorded window counts. A per-country table gets none: its extract is the
  // bank's bare GET, which our --start/--end never reach, so any change to its
  // periods is the bank's.
  const windows = perCountry ? {} : { windowBefore: ledger.entries[ledgerKey]?.window, windowAfter: window };

  // A geography-selector table renders all nine geographies from ONE page, so a
  // single GET reveals the bank's "Data as at" stamp for the whole table before
  // we ask for nine renderings of it. If that stamp has not moved since the
  // last run, the nine POSTs cannot return anything new and are pure cost.
  //
  // Per-country tables (currently only CPI) get no such shortcut and are not
  // given a fake one: each geography lives at its own URL, and the page we
  // would have to fetch to read its stamp is the same page that carries its
  // table. Fetching it and discarding it would save nothing.
  if (!perCountry) {
    const url = tableUrl(def, geographies[0]?.iso3);
    session = await openTableSession(url, freq);
    sessionUrl = url;
    if (!deep) {
      // Two grounds for a skip, never mixed. With a stamp: the bank's own
      // claim that it did not republish, cross-checked against the stamps our
      // files hold. Without one: the live rendering must agree with our data,
      // because there is no claim left to trust.
      let reason;
      let agree;
      let basis;
      if (session.dataAsAt) {
        const verdict = canSkip(ledger, ledgerKey, { liveStamp: session.dataAsAt, window });
        agree = verdict.skip ? await storedStampsAgree(def, freq, geographies, dataDir, session.dataAsAt) : { ok: false };
        reason = verdict.why;
        basis = "stamp";
      } else {
        // An unrecognised currency phrase is never grounds for a content skip:
        // fetch, and let the sentinel fail it loudly.
        const gate = session.stampPhrase
          ? { ok: false, why: "a currency phrase is printed in an unrecognised form" }
          : ledgerAllowsContentSkip(ledger, ledgerKey, { window, now: retrievedAt });
        agree = gate.ok
          ? await storedContentAgrees(def, freq, geographies, dataDir, {
              liveTable: parseTable(session.html, { freq }),
              defaultCountryCode: session.defaultCountryCode,
              lastFullFetchAt: gate.lastFullFetchAt,
            })
          : { ok: false };
        reason = agree.ok ? `no source stamp; live default rendering matches stored data (${agree.compared} cells)` : undefined;
        basis = "content";
      }
      if (agree.ok) {
        noteCheck(ledger, ledgerKey, { checkedAt: retrievedAt, sourceStamp: session.dataAsAt, window, action: "skipped", fetched: false, basis });
        await saveLedger(dataDir, ledger);
        return {
          tableId, freq, retrievedAt, skipped: true, reason, basis, requestsSaved: geographies.length,
          results: agree.held.map((h) => ({ ...h, ok: true, state: "unchanged", skipped: true })),
        };
      }
    }
  }

  for (const g of geographies) {
    const url = tableUrl(def, g.iso3);
    try {
      // Per-country tables live on distinct URLs, so the CSRF session cannot be
      // shared across them; geography-selector tables reuse one session.
      if (!session || isPerCountry(def) || sessionUrl !== url) {
        session = await openTableSession(url, freq);
        sessionUrl = url;
      }
      const r = isPerCountry(def)
        ? { html: session.html, table: parseTable(session.html, { freq }), dataAsAt: session.dataAsAt, stampPhrase: session.stampPhrase }
        : await fetchGeography(url, session, { countryCode: g.code, freq, startDate, endDate });

      const problems = validateTable(def, r.table, r.dataAsAt, { stampPhrase: r.stampPhrase });
      if (problems.length) {
        results.push({ iso3: g.iso3, ok: false, problems });
        continue;
      }
      const doc = buildDocument({ def, iso3: g.iso3, name: g.name, freq, url, table: r.table, dataAsAt: r.dataAsAt, retrievedAt });
      const latestFile = path.join(dataDir, def.id, freq, `${g.iso3}.json`);
      // Only touch the immutable snapshot when the SOURCE's content moved.
      // Rewriting it every run would make snapshots a log of when we looked
      // rather than of what the bank published.
      const state = await classifyChange(latestFile, doc, windows);
      if (!QUIET_STATES.has(state)) {
        await writeSnapshot(path.join(dataDir, def.id, freq, "snapshots"), g.iso3, doc, retrievedAt);
      }
      await writeJson(latestFile, doc);
      results.push({ iso3: g.iso3, ok: true, state, rows: doc.series.length, periods: doc.periods.length, dataAsAt: doc.data_as_at });
    } catch (e) {
      results.push({ iso3: g.iso3, ok: false, problems: [String(e.message ?? e)] });
    }
    await new Promise((r) => setTimeout(r, gapMs));
  }

  // Record the check only when the whole table came back clean. A table with a
  // failed sentinel must not leave a ledger entry that lets the next run skip
  // it — that would turn one bad fetch into a permanent blind spot.
  const allOk = results.every((r) => r.ok);
  if (allOk) {
    noteCheck(ledger, ledgerKey, {
      checkedAt: retrievedAt,
      sourceStamp: perCountry ? null : session?.dataAsAt ?? null,
      window,
      action: deep ? "deep-fetch" : "fetch",
      fetched: true,
    });
    await saveLedger(dataDir, ledger);
  }
  return { tableId, freq, retrievedAt, skipped: false, results };
}

export { TABLES };
