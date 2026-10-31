#!/usr/bin/env node
// Renders the 1200x630 link-preview cards under site/share/ through
// site/assets/share.js, the same
// renderer the Share button uses for stories, so the two cannot drift.
//
//   node tools/gen-share-cards.mjs              write site/share/og-*.jpg
//   node tools/gen-share-cards.mjs --preview D  also write story and result previews to D
//
// Reads only site/. Serves it on 127.0.0.1 for the length of the run and
// drives headless Chromium. No network. Playwright is not a dependency of this
// repo: set PLAYWRIGHT_FROM to any folder whose node_modules holds it.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const require = createRequire(path.join(path.resolve(process.env.PLAYWRIGHT_FROM || path.join(ROOT, "server")), "x.js"));
const { chromium } = require("playwright");

const arg = process.argv.indexOf("--preview");
const PREVIEW = arg > 0 ? path.resolve(process.argv[arg + 1] || "") : null;

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".html": "text/html" };
const CARD = '<!doctype html><html data-card-render><head><meta charset="utf-8">' +
  '<link rel="stylesheet" href="/assets/sc.css"></head><body><script src="/assets/share.js"></script></body></html>';

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x").pathname;
  if (u === "/__card") { res.writeHead(200, { "content-type": "text/html" }); return res.end(CARD); }
  const f = path.join(SITE, path.normalize(u));
  if (!f.startsWith(SITE + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(f);
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// Playwright's own Chromium when its build is installed, else the system Edge or Chrome.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "msedge" })).catch(() => chromium.launch({ channel: "chrome" }));
try {
  const page = await browser.newPage();
  await page.goto(`${base}/__card`);
  const keys = await page.evaluate(() => Object.keys(window.StatCiteShare.pages));
  // JPEG for the link cards: the glows make a PNG about 630 KB, and WhatsApp is
  // widely reported to drop previews from images that large.
  const draw = (spec, type = "image/png") => page.evaluate(([s, t]) => window.StatCiteShare.render(s)
    .then((cv) => ({ data: cv.toDataURL(t, 0.9), w: cv.width, h: cv.height })), [spec, type]);
  const bytes = (r) => Buffer.from(r.data.split(",")[1], "base64");

  await mkdir(path.join(SITE, "share"), { recursive: true });
  for (const key of keys) {
    const slug = await page.evaluate((k) => window.StatCiteShare.pages[k].slug, key);
    const url = "https://statcite.com" + (key === "/" ? "" : key);
    const r = await draw({ kind: "og", page: key, url }, "image/jpeg");
    const b = bytes(r);
    if (r.w !== 1200 || r.h !== 630 || !r.data.startsWith("data:image/jpeg")) throw new Error(`${slug}: ${r.w}x${r.h} ${r.data.slice(0, 20)}`);
    if (b.length > 300 * 1024) throw new Error(`${slug}: ${b.length} bytes, over the 300 KB card budget`);
    await writeFile(path.join(SITE, "share", `og-${slug}.jpg`), b);
    console.log(`og-${slug}.jpg ${b.length} bytes`);
    if (PREVIEW) {
      await mkdir(PREVIEW, { recursive: true });
      await writeFile(path.join(PREVIEW, `story-${slug}.png`), bytes(await draw({ kind: "story", page: key, url })));
    }
  }
  if (PREVIEW) {
    // A fixed sample shaped like a /v1/verify response, for eyeballing the layout only.
    const sample = JSON.parse(await readFile(path.join(PREVIEW, "sample-verify.json"), "utf8").catch(() => "null"));
    if (sample) for (const [i, r] of (Array.isArray(sample) ? sample : [sample]).entries())
      await writeFile(path.join(PREVIEW, `result-${i}.png`), bytes(await draw({ kind: "result", data: r, url: "https://statcite.com/?x#try" })));
    console.log(`previews in ${PREVIEW}`);
  }
} finally {
  await browser.close();
  server.close();
}
