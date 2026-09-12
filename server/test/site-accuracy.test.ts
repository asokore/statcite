// Site accuracy guards: the public pages must say what is true, in whole sentences.
//
// Deliberately a separate file from docs-artifacts.test.ts so site-copy guards
// can be added without touching the tests other work depends on. Every guard
// here was mutation-tested when it was written: the thing it protects was
// broken on purpose, the test was seen to fail, and the break was reverted.
// No network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");
const sitePages = () =>
  readdirSync(path.join(repoRoot, "site"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => `site/${f}`);

// --- em dashes and the fragments their removal left ------------------------
//
// House style bans the em dash. A 2026-08-14 writing pass removed 263 of them,
// but it replaced several with a full stop, which split one sentence into two
// fragments ("...memory. No tools, no retrieval?" and "IMF. A retrieval
// platform..."), and it renamed three ledger sources to "IMF. World Economic
// Outlook" and "European Central Bank. Euro foreign exchange...". A later page
// (/guide) then shipped four new em dashes because nothing checked. JSON-LD
// hid two more as JSON "\u2014" escapes, which no search for the character finds.

test("no em dash on any site page, literal, escaped or as an entity", () => {
  const pages = sitePages();
  assert.ok(pages.length >= 8, `page sweep looks too small to be real: ${pages.length}`);
  const offences: string[] = [];
  for (const rel of pages) {
    const text = read(rel);
    for (const m of text.matchAll(/\u2014|\\u2014|&mdash;|&#8212;|&#x2014;/gi)) {
      const at = m.index ?? 0;
      offences.push(`${rel}: ...${text.slice(Math.max(0, at - 50), at + 20).replace(/\s+/g, " ")}...`);
    }
  }
  assert.deepEqual(offences, [], `em dashes on the site:\n${offences.join("\n")}`);
});

test("ledger source names are one phrase, not two fragments", async () => {
  const { SOURCES } = await import("../src/core/sources.ts");
  assert.ok(SOURCES.length >= 8, `ledger looks too small to be real: ${SOURCES.length}`);
  // The first pattern is the shape "IMF. World Economic Outlook". It needs two
  // capitals before the stop, so "U.S. Treasury" and "St. Louis" pass. The
  // second catches the same break after an ordinary word, "Bank. Euro", which
  // the first cannot see. Three letters minimum keeps "St. Louis" legal.
  const patterns = [/\b[A-Z]{2,}\. [A-Z]/, /\b[A-Za-z]{3,}\. [A-Z]/];
  const offences = SOURCES.filter((s) => patterns.some((p) => p.test(s.name))).map((s) => `${s.id}: "${s.name}"`);
  assert.deepEqual(offences, [], `source names split into sentence fragments:\n${offences.join("\n")}`);
});

test("the /sources prerender carries every ledger name as the ledger states it", async () => {
  // gen-sources-prerender.py writes the names into static HTML for crawlers
  // that run no JavaScript. A renamed source that is not re-rendered leaves
  // the old name on the page those crawlers read.
  const { SOURCES } = await import("../src/core/sources.ts");
  const page = read("site/sources.html");
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const missing = SOURCES.filter((s) => !page.includes(`<h3>${esc(s.name)}<span`)).map((s) => s.id);
  assert.deepEqual(missing, [], `site/sources.html prerender is stale for: ${missing.join(", ")}. Re-render it.`);
});
