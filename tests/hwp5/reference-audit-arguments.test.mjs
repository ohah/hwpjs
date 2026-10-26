import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

test("reference read audit rejects duplicate empty and unknown options before IO", () => {
  for (const [args, error] of [
    [["--root=a", "--root=b"], "DuplicateAuditArgument"],
    [["--wasm=a", "--wasm=b"], "DuplicateAuditArgument"],
    [["--root="], "UnknownAuditArgument"],
    [["--wasm="], "UnknownAuditArgument"],
    [["--history"], "UnknownAuditArgument"],
  ]) {
    const result = spawnSync(process.execPath, ["tools/reference-parser-audit.mjs", ...args], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert(result.stderr.includes(error), result.stderr);
  }
});
