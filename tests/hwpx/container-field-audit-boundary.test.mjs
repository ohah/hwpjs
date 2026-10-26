import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("container field audit rejects incomplete or ambiguous scope before reading inputs", () => {
  for (const [args, expected] of [
    [[], "MissingAuditWasm"],
    [["--wasm=absent"], "MissingAuditFixture"],
    [["--wasm=a", "--wasm=b"], "DuplicateAuditArgument"],
    [["--wasm=a", "--fixture=b", "--history"], "Unknown argument"],
    [["--wasm=a", "--fixture="], "Unknown argument"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["tools/hwpx-container-field-edit-audit.mjs", ...args],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert(result.stderr.includes(expected), result.stderr);
    assert(!result.stderr.includes("ENOENT"), "scope validation must precede file reads");
  }
});

test("container field oracle enforces every positive and mutation control with Python optimization", () => {
  for (const flags of [[], ["-O"]]) {
    const result = spawnSync(
      "python3",
      [...flags, "tools/hwpx-container-field-prefix-oracle.py", "--self-test"],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.deepEqual(JSON.parse(result.stdout), { positive: 7, negative: 12 });
  }
});
