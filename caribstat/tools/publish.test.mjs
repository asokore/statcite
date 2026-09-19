// Tests for the publish classifier.
//
// The failure mode this protects against is the one that actually happened
// 2026-08-15: a fix landed locally and never reached the published repo,
// silently, for hours, while the live API served the old data. So these tests
// are weighted towards proving classify() finds real changes and does NOT
// either (a) miss one, or (b) manufacture one out of pure bookkeeping noise
// like retrieved_at, or (c) ever propose a deletion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listDocs, classify, applyToClone, summarise } from "./publish.mjs";

async function write(dir, rel, doc) {
  const f = path.join(dir, rel);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, JSON.stringify(doc), "utf8");
}

async function withDirs(fn) {
  const local = await mkdtemp(path.join(tmpdir(), "pub-local-"));
  const clone = await mkdtemp(path.join(tmpdir(), "pub-clone-"));
  try {
    await fn(local, clone);
  } finally {
    await rm(local, { recursive: true, force: true });
    await rm(clone, { recursive: true, force: true });
  }
}

test("listDocs finds files nested under snapshots/, unlike status.mjs", async () => {
  await withDirs(async (local) => {
    await write(local, "cbb/tourism/h1-processing.json", { a: 1 });
    await write(local, "cbb/tourism/h1-processing/snapshots/2025-09-16.json", { a: 1 });
    await write(local, "_last_check.json", { entries: {} }); // must be excluded
    const docs = await listDocs(local);
    assert.deepEqual(docs.sort(), [
      path.join("cbb", "tourism", "h1-processing.json"),
      path.join("cbb", "tourism", "h1-processing", "snapshots", "2025-09-16.json"),
    ].sort());
  });
});

test("a genuinely new file is classified 'new'", async () => {
  await withDirs(async (local, clone) => {
    await write(local, "cbb/x.json", { periods: ["2024-01"] });
    const { toPublish, orphaned } = await classify(local, clone);
    assert.equal(toPublish.length, 1);
    assert.equal(toPublish[0].state, "new");
    assert.equal(orphaned.length, 0);
  });
});

test("retrieved_at alone does NOT count as a change", async () => {
  // This is the exact bug this script exists to avoid triggering: if
  // retrieved_at counted, every scheduled run would republish all ~400 files.
  await withDirs(async (local, clone) => {
    await write(local, "cbb/x.json", { periods: ["2024-01"], retrieved_at: "2026-08-15T09:00:00Z" });
    await write(clone, "cbb/x.json", { periods: ["2024-01"], retrieved_at: "2026-08-14T00:00:00Z" });
    const { toPublish } = await classify(local, clone);
    assert.equal(toPublish.length, 0, "retrieved_at-only difference must not be published");
  });
});

test("a real content change is caught — the failure mode this exists for", async () => {
  // Reproduces the actual 2026-08-15 incident: local holds the fixed period
  // labels, the published clone still holds the pre-fix ones.
  await withDirs(async (local, clone) => {
    await write(local, "cbb/tourism/h1-processing.json", { periods: ["2025-01"], retrieved_at: "t2" });
    await write(clone, "cbb/tourism/h1-processing.json", { periods: ["2025-01-04"], retrieved_at: "t1" });
    const { toPublish } = await classify(local, clone);
    assert.equal(toPublish.length, 1);
    assert.equal(toPublish[0].state, "changed");
    assert.equal(toPublish[0].rel, path.join("cbb", "tourism", "h1-processing.json"));
  });
});

test("key order does not manufacture a false change", async () => {
  await withDirs(async (local, clone) => {
    await write(local, "cbb/x.json", { b: 2, a: 1 });
    await write(clone, "cbb/x.json", { a: 1, b: 2 });
    const { toPublish } = await classify(local, clone);
    assert.equal(toPublish.length, 0);
  });
});

test("a file published but no longer produced locally is ORPHANED, never proposed for deletion", async () => {
  await withDirs(async (local, clone) => {
    await write(local, "cbb/still-here.json", { a: 1 });
    await write(clone, "cbb/still-here.json", { a: 1 });
    await write(clone, "cbb/retired-sheet.json", { a: 1 });
    const { toPublish, orphaned } = await classify(local, clone);
    assert.equal(toPublish.length, 0);
    assert.deepEqual(orphaned, [path.join("cbb", "retired-sheet.json")]);
    // classify() has no delete/apply path for orphans at all — there is
    // nothing an orphan entry could do except be reported.
  });
});

test("an unparseable clone file is treated as absent, so the local version is published", async () => {
  await withDirs(async (local, clone) => {
    await write(local, "cbb/x.json", { a: 1 });
    const f = path.join(clone, "cbb/x.json");
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, "{ not json", "utf8");
    const { toPublish } = await classify(local, clone);
    assert.equal(toPublish.length, 1, "a corrupt published file must not block republishing the good local one");
  });
});

test("applyToClone writes exactly the selected files, verbatim from local", async () => {
  await withDirs(async (local, clone) => {
    await write(local, "cbb/a.json", { v: 1 });
    await write(local, "cbb/b.json", { v: 2 });
    const { toPublish } = await classify(local, clone);
    assert.equal(toPublish.length, 2);
    await applyToClone(local, clone, toPublish);
    const written = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(clone, "cbb/a.json"), "utf8"));
    assert.equal(written.v, 1);
  });
});

test("summarise names tables when there are few, and counts when there are many", () => {
  const few = [
    { rel: "cbb/tourism/h1-processing.json", state: "changed" },
    { rel: "cbb/statistics/b2f.json", state: "changed" },
  ];
  const msg = summarise(few);
  assert.match(msg, /cbb\/tourism/);
  assert.match(msg, /cbb\/statistics/);
  assert.match(msg, /2 file\(s\)/);

  const many = Array.from({ length: 20 }, (_, i) => ({ rel: `eccb/table-${i}/a/AIA.json`, state: i < 5 ? "new" : "changed" }));
  const msgMany = summarise(many);
  assert.match(msgMany, /\d+ tables\/categories/);
  assert.match(msgMany, /5 new, 15 changed/);
});

test("every published commit carries the noreply identity, never the machine's own", async () => {
  // github.com/asokore/caribstat is PUBLIC and the staging clone is a working
  // copy of it, so a bare `git commit` there writes whatever global user.email
  // this machine carries into a public history. It did, 12 times, before this
  // was measured. statcite's .githooks/pre-push refuses a non-noreply address
  // on that repo and there was no equivalent here, because the push happens
  // inside a clone of a different repository where that hook does not run.
  const src = await readFile(new URL("./publish-run.mjs", import.meta.url), "utf8");

  // The address itself, and that it is the noreply form rather than any
  // address that merely looks configured.
  const email = /export const COMMIT_EMAIL = "([^"]+)"/.exec(src);
  assert.ok(email, "publish-run.mjs must declare COMMIT_EMAIL");
  assert.match(email[1], /@users\.noreply\.github\.com$/, `a public mirror must not record ${email[1]}`);
  assert.doesNotMatch(email[1], /gmail|outlook|yahoo|hotmail/i);

  // And that the commit actually uses it. A declared constant nothing passes
  // to git is decoration, which is the failure mode this whole file exists for.
  const commitCall = /git\(\[([^\]]*)"commit"/.exec(src);
  assert.ok(commitCall, "the commit call must be findable");
  assert.match(commitCall[1], /user\.email=\$\{COMMIT_EMAIL\}/, "the commit must be made with the pinned address");
  assert.match(commitCall[1], /user\.name=\$\{COMMIT_NAME\}/);
  // -c, not `git config`: a stored config in the clone survives between runs
  // and can be edited out of band.
  assert.match(commitCall[1], /"-c"/, "pass the identity per command, not into the clone's config");
});
