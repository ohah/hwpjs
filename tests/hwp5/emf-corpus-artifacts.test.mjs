import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const artifact of ["HWPJS_TEST_WASM", "HWPJS_TEST_HWP5_PROBE"]) test(`EMF corpus honors explicit ${artifact} without a default artifact fallback`, () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const missing = join(tmpdir(), "hwpjs-emf-negative-" + randomUUID(), "missing.wasm");
  const env = { ...process.env, [artifact]: missing };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-name-pattern=real HWP CFB", "tests/hwp5/emf-corpus.test.mjs"], {
    env, encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0);
  const output = result.stdout + result.stderr;
  assert(output.includes("ENOENT") && output.includes(missing), output);
});
