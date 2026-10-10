import test from "node:test";
import assert from "node:assert/strict";
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
