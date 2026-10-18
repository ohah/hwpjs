import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseEditAuditOptions } from "../../tools/hwpx-edit-audit-options.mjs";

test("edit audits share exact option validation without silent scope reduction", () => {
  assert.deepEqual(parseEditAuditOptions(["--wasm=/tmp/candidate.wasm", "--fixture=a.hwpx", "--history"], { allowHistory: true }), { wasm: "/tmp/candidate.wasm", fixture: "a.hwpx", history: true });
  for (const args of [["--fixture=a", "--fixture=b"], ["--wasm=a", "--wasm=b"], ["--history", "--history"]])
    assert.throws(() => parseEditAuditOptions(args, { allowHistory: true }), /DuplicateAuditArgument/);
  for (const arg of ["--wasm=", "--fixture=", "--unknown", "--history"])
    assert.throws(() => parseEditAuditOptions([arg]), /Unknown argument/);
  assert.throws(() => parseEditAuditOptions([], { requireWasm: true }), /MissingAuditWasm/);
  assert.deepEqual(parseEditAuditOptions(["--wasm=a"], { requireWasm: true }), { wasm: "a" });
});

test("explicit paragraph shards require a fixture artifact and a nonempty safe exclusive range", () => {
  const prefix = ["--wasm=a", "--fixture=b"];
  const options = { allowParagraphRange: true };
  assert.deepEqual(parseEditAuditOptions([...prefix, "--paragraphs=196:197"], options).paragraphRange, { start: 196, end: 197 });
  for (const value of ["0:1", "1:1", "2:1", "01:2", "1:02", "1:2:3", "1:4294967297", "1:9007199254740992", "-1:2", "1.5:2", "1:Infinity", ""]) {
    assert.throws(() => parseEditAuditOptions([...prefix, `--paragraphs=${value}`], options), /InvalidAuditParagraphRange/);
  }
  assert.throws(() => parseEditAuditOptions([...prefix, "--paragraphs=1:2", "--paragraphs=2:3"], options), /DuplicateAuditArgument/);
  for (const args of [[], ["--wasm=a"], ["--fixture=b"]]) assert.throws(() => parseEditAuditOptions([...args, "--paragraphs=1:2"], options), /AuditParagraphRangeRequiresFixtureAndWasm/);
  assert.throws(() => parseEditAuditOptions([...prefix, "--paragraphs=1:2"]), /Unknown argument/);
});

test("real paragraph ranges preserve full-run totals and explicitly report partial coverage", t => {
  if (!process.env.HWPJS_TEST_WASM) { t.skip("explicit candidate WASM required for actual audit subprocesses"); return; }
  const args = ["tools/hwpx-edit-corpus-audit.mjs", `--wasm=${process.env.HWPJS_TEST_WASM}`, "--fixture=legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", "--history"];
  const run = extra => {
    const result = spawnSync(process.execPath, [...args, ...extra], { encoding: "utf8", timeout: 15000 });
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    return result;
  };
  const success = extra => {
    const result = run(extra); assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, "");
    return result.stdout.trim().split("\n").map(JSON.parse);
  };
  const full = success([]), whole = success(["--paragraphs=1:8"]), part = success(["--paragraphs=3:5"]);
  assert.deepEqual(full.at(-1).totals, whole.at(-1).totals);
  assert.equal(full.at(-1).totals.paragraphs, 7); assert.equal(whole[1].completeFixture, true);
  assert.equal(part[1].inputParagraphs, 7); assert.equal(part[1].paragraphs, 2); assert.equal(part[1].completeFixture, false);
  assert.equal(part.at(-1).totals.paragraphs, 2); assert.deepEqual(part[0].paragraphRange, { start: 3, end: 5 });
  const bad = run(["--paragraphs=7:9"]);
  assert.equal(bad.status, 1); assert.match(bad.stderr, /AuditParagraphRangeOutOfBounds/);
  assert.equal(bad.stdout.trim().split("\n").length, 1, "no misleading success summary after invalid range");
});
