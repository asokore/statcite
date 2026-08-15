#!/usr/bin/env node
// Resolve the CBB category pages that list no items of their own.
//
// Five /news/ categories return zero items and were recorded as UNRESOLVED
// rather than empty, on the reasoning that they are probably hubs of
// sub-categories. This checks that rather than leaving it as a guess.
//
// Every page on the site links the same site-wide navigation, so a hub's own
// children are what remains after subtracting the links that appear on ALL of
// them. Comparing raw link counts would just measure the nav.
//
//   node tools/cbb/probe-hubs.mjs

import { openListing, extractItemLinks, CBB_UNRESOLVED_CATEGORIES, CBB_LISTINGS } from "./fetch.mjs";

const known = new Set(CBB_LISTINGS.map((l) => l.id));
const linksOf = new Map();

for (const cat of CBB_UNRESOLVED_CATEGORIES) {
  const path = `/news/${cat}`;
  try {
    const { html } = await openListing(path);
    const paths = new Set(
      [...html.matchAll(/https:\/\/www\.centralbank\.org\.bb\/news\/([a-z0-9-]+)/g)].map((m) => m[1]),
    );
    paths.delete(cat);
    linksOf.set(cat, paths);
  } catch (e) {
    console.log(`${cat}: FAILED ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 800));
}

// The site-wide navigation is whatever every hub links.
let common = null;
for (const paths of linksOf.values()) {
  common = common === null ? new Set(paths) : new Set([...common].filter((p) => paths.has(p)));
}
console.log(`site-wide navigation links: ${common ? common.size : 0}\n`);

for (const [cat, paths] of linksOf) {
  const own = [...paths].filter((p) => !common.has(p));
  console.log(`${cat} — ${own.length} child path(s) of its own`);
  for (const child of own) {
    let note = known.has(child) ? "already a listing" : "";
    if (!note) {
      try {
        const { html } = await openListing(`/news/${child}`);
        const n = extractItemLinks(html, `/news/${child}`).length;
        note = n > 0 ? `${n} item(s) — CANDIDATE` : "0 items (another hub, or empty)";
      } catch (e) {
        note = `unreachable: ${e.message.slice(0, 40)}`;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    console.log(`    ${child.padEnd(52)} ${note}`);
  }
}
