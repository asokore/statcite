// Validates the doc/config artifacts touched outside server/src (openapi.json, sitemap.xml,
// apify actor.json, SKILL.md, statcite.skill) stay well-formed and in sync with verify.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

function readJson(relPath: string): any {
  return JSON.parse(readFileSync(path.join(repoRoot, relPath), "utf8"));
}

test("openapi.json parses and documents /v1 index + is_projection + observation_status", () => {
  const spec = readJson("site/openapi.json");
  assert.ok(spec.paths["/v1"], "expected a /v1 index route");
  assert.equal(spec.paths["/v1"].get.operationId, "apiIndex");
  const verifyProps = spec.components.schemas.VerifyResult.properties;
  assert.ok(verifyProps.is_projection, "VerifyResult schema should document is_projection");
  assert.equal(verifyProps.is_projection.type, "boolean");
  assert.deepEqual(verifyProps.observation_status.enum, ["actual", "modeled_estimate", "estimate_or_actual", "projection", "unknown"]);
  assert.deepEqual(verifyProps.status_method.enum, ["horizon_heuristic", "as_published"]);
  // v1.4.1: the as_of schema must disclose resolution method and source change,
  // and SeriesResult must document fallback_reason (both third-review findings).
  const asOfProps = verifyProps.as_of.properties;
  assert.deepEqual(asOfProps.resolution.enum, ["conservative_month_calendar"]);
  assert.ok(asOfProps.source_changed_for_as_of, "as_of schema should document source_changed_for_as_of");
  const seriesProps = spec.components.schemas.SeriesResult.properties;
  assert.deepEqual(seriesProps.fallback_reason.enum, ["transient", "definitive"]);
});

test("openapi.json version stays in sync with SERVER_VERSION (v1.3.1 drift regression)", async () => {
  const spec = readJson("site/openapi.json");
  const { SERVER_VERSION } = await import("../src/mcp.ts");
  assert.equal(spec.info.version, SERVER_VERSION, "site/openapi.json info.version must match server/src/mcp.ts SERVER_VERSION");
});

test("IMF citation license text carries the downstream-conditions caveat, never a categorical free-reuse claim", async () => {
  const { IMF_LICENSE } = await import("../src/core/citations.ts");
  assert.match(IMF_LICENSE, /downstream/i);
  assert.match(IMF_LICENSE, /may require IMF permission/i);
  assert.ok(!/free reuse/i.test(IMF_LICENSE), "the categorical 'free reuse' wording must not return");
});

test("apify core.bundle.mjs is rebuilt from current core (sentinel strings; guard-the-last-hop)", async () => {
  // The bundle is a committed build artifact serving a second production surface
  // (the Apify actor). This proved capable of silent drift: a core change once
  // shipped while the bundle kept the old strings with every repo test green.
  const bundle = readFileSync(path.join(repoRoot, "apify/core.bundle.mjs"), "utf8");
  // esbuild escapes non-ASCII (em-dashes become —), so compare an
  // ASCII-only distinctive slice of the constant rather than the verbatim string.
  const { IMF_LICENSE } = await import("../src/core/citations.ts");
  const asciiSlice = IMF_LICENSE.slice(0, IMF_LICENSE.indexOf("—")).trim();
  assert.ok(asciiSlice.length > 40, "sentinel slice unexpectedly short — update this test");
  assert.ok(bundle.includes(asciiSlice), "bundle is stale: missing the current IMF license text — run `cd apify && npm run build:core`");
  assert.ok(
    bundle.includes("Latest value not marked as a projection"),
    "bundle is stale: missing the v1.3.1 latest_only note — run `cd apify && npm run build:core`",
  );
  assert.ok(!/free reuse and redistribution/.test(bundle), "bundle still carries the retired categorical IMF license wording");
});

test("apify actor.json is valid JSON with PPE memory bounds", () => {
  const actor = readJson("apify/.actor/actor.json");
  assert.equal(actor.minMemoryMbytes, 256);
  assert.equal(actor.maxMemoryMbytes, 512);
  assert.ok(actor.maxMemoryMbytes >= actor.minMemoryMbytes);
});

test("sitemap.xml lists llms.txt, llms-full.txt, openapi.json", () => {
  const xml = readFileSync(path.join(repoRoot, "site/sitemap.xml"), "utf8");
  for (const loc of ["/llms.txt", "/llms-full.txt", "/openapi.json"]) {
    assert.ok(xml.includes(`<loc>https://statcite.com${loc}</loc>`), `missing ${loc} in sitemap`);
  }
  const opens = (xml.match(/<url>/g) || []).length;
  const closes = (xml.match(/<\/url>/g) || []).length;
  assert.equal(opens, closes);
});

test("SKILL.md description has a negative boundary and no over-broad run-on", () => {
  const md = readFileSync(path.join(repoRoot, "skill/statcite/SKILL.md"), "utf8");
  const descMatch = md.match(/^description:\s*(.+)$/m);
  assert.ok(descMatch);
  const desc = descMatch![1];
  assert.ok(/Does NOT cover/i.test(desc), "expected an explicit negative boundary");
  assert.ok(desc.length < 900, "description should not be an unbounded run-on");
  assert.ok(desc.split(/[.!?]\s/).length <= 4, "expected roughly 2-3 sentences, not a run-on");
});

test("SKILL.md citation example uses the retrieved_at placeholder, not a hardcoded date", () => {
  const md = readFileSync(path.join(repoRoot, "skill/statcite/SKILL.md"), "utf8");
  assert.ok(!/retrieved 2026-07-25/.test(md), "hardcoded example date should be gone");
  assert.ok(md.includes("{citation.retrieved_at}"), "expected the retrieved_at template placeholder");
  assert.ok(/citation\.attribution/.test(md), "expected the attribution field to be called out explicitly");
});

function readZipEntry(zipPath: string, entryName: string): Buffer {
  const buf = readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.ok(eocd >= 0, "no end-of-central-directory record in zip");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(off), 0x02014b50, "bad central-directory entry signature");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (name === entryName) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  assert.fail(`entry ${entryName} not found in zip`);
}

test("statcite.skill zip contains statcite/SKILL.md matching the source file", () => {
  const zipPath = path.join(repoRoot, "skill/statcite.skill");
  const extracted = readZipEntry(zipPath, "statcite/SKILL.md").toString("utf8");
  const source = readFileSync(path.join(repoRoot, "skill/statcite/SKILL.md"), "utf8");
  assert.equal(extracted.replace(/\r\n/g, "\n"), source.replace(/\r\n/g, "\n"));
});
