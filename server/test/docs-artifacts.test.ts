// Validates the doc/config artifacts touched outside server/src (openapi.json, sitemap.xml,
// apify actor.json, SKILL.md, statcite.skill) stay well-formed and in sync with verify.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

test("IMF citation license text states the real conditions and never overclaims", async () => {
  const { IMF_LICENSE } = await import("../src/core/citations.ts");
  // Intent of this guard (unchanged since it was written): the licence line must
  // never claim blanket free reuse, and must carry the conditions the IMF
  // actually imposes. The specific wording changed 2026-08-10 when the terms
  // were read verbatim — "commercial reuse may require IMF permission" was the
  // IMF *Content* rule, wrongly applied to statistical *Data*, which has its
  // own permissive regime. Assert the CONDITIONS, not the old sentence.
  assert.ok(!/free reuse/i.test(IMF_LICENSE), "the categorical 'free reuse' wording must not return");
  assert.match(IMF_LICENSE, /attribution/i, "must state the attribution condition");
  assert.match(IMF_LICENSE, /downstream/i, "must carry the downstream-communication duty");
  assert.match(IMF_LICENSE, /free of charge/i, "must carry the sold-as-standalone disclosure duty");
  assert.match(IMF_LICENSE, /third-party/i, "must flag that some products carry third-party terms");
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

// --- Phase 2 distribution artifacts: keep them honest in CI ---

test("plugin manifests stay in sync with the served server version and the real skill path", async () => {
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const plugin = readJson(".claude-plugin/plugin.json");
  const { SERVER_VERSION } = await import("../src/mcp.ts");

  // A stale plugin version pins users to an old description of the server.
  assert.equal(plugin.version, SERVER_VERSION, ".claude-plugin/plugin.json version must match SERVER_VERSION");
  assert.equal(marketplace.plugins[0].version, SERVER_VERSION, "marketplace plugin entry version must match SERVER_VERSION");

  // distribution/server.json is the MCP REGISTRY manifest, and it is the one
  // consumers of the registry read. The publish workflow refuses to ship when
  // it disagrees with SERVER_VERSION, but that fires only at publish time, so
  // the 1.12.0 bump left it on 1.11.3 in the tree for days without anything
  // going red. gemini-extension.json had the same gap.
  const registryManifest = JSON.parse(readFileSync(new URL("../../distribution/server.json", import.meta.url), "utf8"));
  assert.equal(registryManifest.version, SERVER_VERSION, "distribution/server.json version must match SERVER_VERSION");
  const gemini = JSON.parse(readFileSync(new URL("../../gemini-extension.json", import.meta.url), "utf8"));
  assert.equal(gemini.version, SERVER_VERSION, "gemini-extension.json version must match SERVER_VERSION");

  // The registry caps the description at 100 characters and silently rejects
  // longer ones, and this string is the single line every registry consumer
  // sees before deciding whether to connect.
  assert.ok(registryManifest.description.length <= 100,
    `distribution/server.json description is ${registryManifest.description.length} chars, registry caps at 100`);

  // The plugin must point at the live remote endpoint, not a stdio command.
  assert.equal(plugin.mcpServers.statcite.type, "http");
  assert.equal(plugin.mcpServers.statcite.url, "https://statcite.com/mcp");

  // The skills path must resolve to a real SKILL.md — a broken path installs
  // a plugin whose skill silently never loads.
  const skillDir = plugin.skills.replace(/^\.\//, "");
  const skillFile = path.join(repoRoot, skillDir, "statcite", "SKILL.md");
  assert.ok(readFileSync(skillFile, "utf8").includes("name: statcite"), `plugin skills path must reach a real SKILL.md (looked at ${skillFile})`);
});

test("the skill documents the current tool surface (drift guard)", async () => {
  const skill = readFileSync(path.join(repoRoot, "skill/statcite/SKILL.md"), "utf8");
  const { TOOLS } = await import("../src/tools.ts");
  // Every differentiating tool must be named in the skill; search/fetch are
  // deep-research plumbing the skill deliberately excludes.
  const mustMention = TOOLS.map((t: any) => t.name).filter((n: string) => n !== "search" && n !== "fetch");
  for (const name of mustMention) {
    assert.ok(skill.includes(name), `skill/statcite/SKILL.md does not mention the '${name}' tool`);
  }
  // Derive both counts from listRegistry(), the SAME function that answers
  // /v1/indicators — a local re-implementation of "active" silently diverged
  // the moment a new source type landed.
  const { listRegistry } = await import("../src/core/series.ts");
  const reg = listRegistry();
  const total = reg.length;
  const active = reg.filter((r) => r.active).length;
  assert.ok(skill.includes(`${total} keys, ${active} active`), `skill registry count is stale — expected "${total} keys, ${active} active"`);
});

test("deep-research contract: search/fetch shapes stay pinned to the connector schema", async () => {
  // OpenAI's deep-research connectors require this exact pair and shape.
  // Pinning it here means a refactor that renames a field fails CI instead of
  // silently delisting StatCite from ChatGPT's research surface.
  const { TOOLS } = await import("../src/tools.ts");
  const search = TOOLS.find((t: any) => t.name === "search");
  const fetchTool = TOOLS.find((t: any) => t.name === "fetch");
  assert.ok(search && fetchTool, "search and fetch must both exist");

  assert.deepEqual(Object.keys(search!.inputSchema.properties), ["query"]);
  assert.deepEqual(search!.inputSchema.required, ["query"]);
  const sr = (search!.outputSchema as any).properties.results.items.properties;
  assert.deepEqual(Object.keys(sr).sort(), ["id", "title", "url"]);

  assert.deepEqual(Object.keys(fetchTool!.inputSchema.properties), ["id"]);
  assert.deepEqual(fetchTool!.inputSchema.required, ["id"]);
  const fr = (fetchTool!.outputSchema as any).properties;
  for (const k of ["id", "title", "text", "url"]) {
    assert.ok(k in fr, `fetch outputSchema must keep the '${k}' field required by the connector schema`);
  }
});

// ---------------------------------------------------------------------------
// Licence-wording regression guard (added after the 2026-08-10 health audit).
//
// v1.8.2 corrected the IMF licence text in code, ledger and the Apify README —
// but the audit found the RETIRED wording still live on the site HTML and the
// repo README, published for two days after the correction. Prose surfaces
// have no compiler, so this is their compiler: the retired claim must never
// reappear on any public prose surface. CHANGELOG.md and internal docs/ may
// reference it historically; these surfaces may not.
// ---------------------------------------------------------------------------

test("the retired IMF commercial-permission wording appears on no public surface", () => {
  const surfaces = [
    "README.md",
    "apify/README.md",
    ...readdirSync(path.join(repoRoot, "site")).filter((f) => /\.(html|txt|json)$/.test(f)).map((f) => `site/${f}`),
    ...readdirSync(path.join(repoRoot, "distribution")).filter((f) => /\.md$/.test(f)).map((f) => `distribution/${f}`),
  ];
  assert.ok(surfaces.length >= 10, `surface sweep looks too small to be real: ${surfaces.length}`);
  for (const rel of surfaces) {
    const text = readFileSync(path.join(repoRoot, rel), "utf8");
    assert.ok(
      !/commercial (re)?use may require/i.test(text),
      `${rel} carries the retired IMF commercial-permission wording — the current terms grant redistribution with conditions (see IMF_LICENSE in core/citations.ts)`,
    );
  }
});

test("the homepage tool count matches the TOOLS array", async () => {
  const { TOOLS } = await import("../src/tools.ts");
  const html = readFileSync(path.join(repoRoot, "site/index.html"), "utf8");
  const words: Record<number, string> = { 10: "Ten", 11: "Eleven", 12: "Twelve", 13: "Thirteen", 14: "Fourteen", 15: "Fifteen" };
  const expected = words[TOOLS.length];
  assert.ok(expected, `add ${TOOLS.length} to the number-word table`);
  assert.ok(
    html.includes(`${expected} tools`),
    `index.html does not say "${expected} tools" — the TOOLS array has ${TOOLS.length}, update the headline and the pricing bullet`,
  );
  const stale = Object.entries(words).filter(([n]) => Number(n) !== TOOLS.length).map(([, w]) => `${w} tools`);
  for (const s of stale) assert.ok(!html.includes(s), `index.html still says "${s}" but the TOOLS array has ${TOOLS.length}`);
  assert.ok(
    html.includes(`All ${TOOLS.length} tools`),
    `pricing bullet does not say "All ${TOOLS.length} tools"`,
  );
});

// --- absolute counts rot, so stop shipping one ----------------------------
//
// README.md advertised "180 tests" while the suite had grown to 253. It had
// been wrong through several releases because nothing could notice: a number
// in prose has no relationship to the thing it describes. An earlier sweep in
// this same session missed it too, having searched for the PREVIOUS wrong
// number rather than for the shape of the claim.
//
// The count is now simply absent from the README. This guard keeps it absent,
// because the failure mode is not "the number is wrong" but "a number is
// there at all".

test("README does not advertise an absolute test count", () => {
  const readme = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");
  const claim = readme.match(/\b\d+\s+tests\b/i);
  assert.equal(
    claim,
    null,
    `README states "${claim?.[0]}". A hard-coded count drifts silently; describe the suite instead.`,
  );
});

// --- the ledger and the prose must not contradict each other --------------
//
// The licence ledger at /v1/sources is a PUBLISHED LEGAL CLAIM about what this
// service may serve. On 2026-08-15 `eccb` and `cbb` had been `served` for a
// day while three documents still stated they were `refused` and that nothing
// was published. A reader had no way to tell which was true, and the wrong one
// was the reassuring one.
//
// Same failure as the v1.8.2 licence fix that missed the live homepage for two
// days: a correction applied to the code and not swept through the prose. The
// guard is deliberately crude, a literal search for the retired claim, because
// a literal search is exactly what the earlier sweeps skipped.

test("no document claims a source is refused when the ledger serves it", async () => {
  const { SOURCES } = await import("../src/core/sources.ts");
  const served = SOURCES.filter((s) => s.license_verdict === "served").map((s) => s.id);
  assert.ok(
    served.includes("eccb") && served.includes("cbb"),
    "fixture check: this guard exists because eccb and cbb flipped to served",
  );

  // site/llms.txt and site/llms-full.txt are in this list because the first
  // version of this guard omitted them, and llms-full.txt was still telling
  // every AI agent that read it that "REFUSED sources (FRED, UN Comtrade,
  // ECCB, Central Bank of Barbados)" — two days after those two became
  // served. A guard that covers the documents a human browses and not the
  // ones machines consume protects the wrong audience for this service.
  const docs = [
    "docs/CARIBBEAN-CROSSCHECK-2026-08.md",
    "caribstat/README.md",
    "caribstat/SCOPING.md",
    "README.md",
    "site/llms.txt",
    "site/llms-full.txt",
    "site/sources.html",
    "site/docs.html",
  ];
  const offences = [];
  for (const rel of docs) {
    let text;
    try {
      text = readFileSync(path.join(repoRoot, rel), "utf8");
    } catch {
      continue; // a doc that no longer exists cannot contradict anything
    }
    // TWO PRECISE PATTERNS, not a tense heuristic.
    //
    // Three earlier versions of this guard failed, each instructively:
    //   1. it allowlisted any nearby "corrected", so a section heading reading
    //      "Licence position, corrected 2026-08-15" excused everything under it;
    //   2. it required a verb BEFORE "refused", but the sentence that was
    //      actually live and wrong read "REFUSED sources (FRED, UN Comtrade,
    //      ECCB, Central Bank of Barbados)" — refused as an adjective, first;
    //   3. broadening the past-tense list to fix a false positive then excused
    //      that same sentence, because it also contains "listed" and "was".
    //
    // Tense cannot be read reliably with a regex on prose that mixes a present
    // claim with past clauses. What CAN be read is the two shapes a licence
    // refusal actually takes in these documents.
    const refusedList = /refused\s+sources?\s*\(([^)]*)\)/gi;
    for (const m of text.matchAll(refusedList)) {
      for (const id of served) {
        if (m[1].toLowerCase().includes(id)) {
          offences.push(`${rel}: "${m[0].slice(0, 90)}" enumerates ${id}, which the ledger serves`);
        }
      }
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      // A verdict statement: the source id sits beside the word refused.
      if (!/verdict|license_verdict|licence ledger|ledger/.test(lower)) continue;
      if (!/refused/.test(lower)) continue;
      // History is the point of keeping these documents; only present claims
      // fail. The marker is looked for across a small WINDOW, not this line
      // alone: these documents wrap at about 76 characters, so a line can end
      // on "...as **`refused`** at" with "the time of this reading" beginning
      // the next one. Checking one line flagged two correctly-marked history
      // passages.
      const ctx = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
      if (/at the time|superseded|used to|no longer|until the grant|previously|out of date|corrected 2026/i.test(ctx)) continue;
      const near = served.some((id) => {
        for (let at = lower.indexOf(id); at !== -1; at = lower.indexOf(id, at + 1)) {
          if (lower.slice(Math.max(0, at - 60), at + id.length + 60).includes("refused")) return true;
        }
        return false;
      });
      if (near) offences.push(`${rel}: ${line.trim().slice(0, 110)}`);
    }
  }
  assert.deepEqual(
    offences,
    [],
    "these lines say a served source is refused; fix the prose or the ledger so they agree",
  );
});

test("the ECCB and CBB entries keep disclosing that they rest on an attestation", async () => {
  // These two are the only served sources whose basis is the operator's word
  // rather than the publisher's own terms quoted verbatim. That is legitimate
  // and it is disclosed. What must never happen is the disclosure being tidied
  // away, leaving them looking as well-evidenced as entries that quote their
  // source. If the grant text arrives and the note is rewritten around it,
  // this test should be updated deliberately, not deleted quietly.
  const { SOURCES } = await import("../src/core/sources.ts");
  for (const id of ["eccb", "cbb"]) {
    const entry = SOURCES.find((s) => s.id === id);
    assert.ok(entry, `${id} must exist in the ledger`);
    assert.equal(entry.license_verdict, "served", `${id} verdict`);
    assert.match(
      entry.license_note,
      /operator/i,
      `${id} must say whose confirmation the verdict rests on, not imply a verbatim grant`,
    );
    assert.ok(entry.license_verified_on, `${id} must carry a verification date`);
  }
});

// --- the spec must document what the service actually serves --------------
//
// openapi.json mentioned caribstat ZERO times until 2026-08-16, so the entire
// Caribbean corpus — the thing that differentiates this service, and the only
// source of data for Anguilla and Montserrat — was invisible to anyone
// generating a client from the spec. The data was served and undiscoverable,
// which is the same shape as the search catalogue listing 5 of 16 categories.

test("openapi documents the caribstat id form and the row selector", () => {
  const spec = readJson("site/openapi.json");
  const series = spec.paths["/v1/series"].get;
  const idParam = series.parameters.find((p: any) => p.name === "id");
  assert.ok(idParam, "/v1/series must document its id parameter");
  assert.match(idParam.description, /caribstat\/ECCB/, "the ECCB id form must be documented");
  assert.match(idParam.description, /caribstat\/CBB/, "the CBB id form must be documented");
  assert.match(idParam.description, /#Row Label/, "the row selector must be documented");
  assert.match(idParam.description, /\[2\]|\[1\]/, "the occurrence selector must be documented");
});

test("every openapi example id is a real published series", () => {
  // A fictional example is worse than none: a client generated from it fails
  // and the caller blames their own code. The CBB example is drawn from the
  // committed sheet manifest for exactly this reason.
  const spec = readJson("site/openapi.json");
  const real = readJson("server/test/fixtures/cbb-sheets.json");
  const idParam = spec.paths["/v1/series"].get.parameters.find((p: any) => p.name === "id");
  const examples = Object.values(idParam.examples ?? {}) as Array<{ value: string }>;
  assert.ok(examples.length >= 3, "expected worked examples on the id parameter");
  for (const ex of examples) {
    const id = String(ex.value).split("#")[0];
    if (!id.startsWith("caribstat/CBB/")) continue;
    const [, , table, sheet] = id.split("/");
    assert.ok(real[table], `openapi cites CBB table ${table}, which the pipeline does not publish`);
    assert.ok(
      real[table].includes(sheet),
      `openapi cites ${table}/${sheet}, not a published sheet. Real: ${real[table].join(", ")}`,
    );
  }
});
