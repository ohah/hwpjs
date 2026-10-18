import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const wrapper = fileURLToPath(new URL("../tools/run-with-artifact-env.mjs", import.meta.url));
const run = args => spawnSync(process.execPath, [wrapper, ...args], { encoding: "utf8" });

test("artifact environment preserves concrete paths with spaces and inherited variables", () => {
  const wasm = "/custom install/bin/reader.wasm", probe = "/custom probe/reader.wasm";
  const child = run(["HWPJS_TEST_WASM", wasm, process.execPath, wrapper,
    "HWPJS_TEST_HWP5_PROBE", probe, process.execPath, "-e",
    "process.stdout.write(JSON.stringify([process.env.HWPJS_TEST_WASM, process.env.HWPJS_TEST_HWP5_PROBE]))"]);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), [wasm, probe]);
});

test("artifact wrapper forwards command failure and rejects absent commands", () => {
  assert.equal(run(["HWPJS_TEST_WASM", "/test.wasm", process.execPath, "-e", "process.exit(37)"]).status, 37);
  const missing = run(["HWPJS_TEST_WASM", "/test.wasm"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /MissingArtifactEnvironmentArguments/);
});
