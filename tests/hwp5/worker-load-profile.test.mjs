import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";

test("load profiler requires explicit artifact fixture and known mode before execution", () => {
  for (const args of [[], ["absent.wasm"], ["absent.wasm", "absent.hwp", "--unknown"]]) {
    const result = spawnSync(process.execPath, ["tools/worker-load-profile.mjs", ...args], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /ExplicitWasmAndFixtureRequired/);
    assert.equal(result.stdout, "");
  }
});

test("WASM call instrumentation retains actual software document Worker output", { skip: !process.env.HWPJS_TEST_WASM }, () => {
  const args = ["tools/worker-load-profile.mjs", process.env.HWPJS_TEST_WASM, "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp"];
  const run = extra => JSON.parse(execFileSync(process.execPath, [...args, ...extra], { encoding: "utf8", timeout: 30000 }));
  const measured = run([]), control = run(["--unwrapped"]);
  assert.equal(measured.error, null); assert.equal(control.error, null);
  assert.equal(measured.paragraphs, 101); assert.equal(measured.paragraphs, control.paragraphs);
  assert.equal(measured.contentSha256, control.contentSha256);
  assert.equal(measured.wasmSha256, control.wasmSha256);
  assert.equal(measured.fixtureSha256, control.fixtureSha256);
  assert.ok(measured.top.some(row => row.name === "hwp5_text_read" && row.calls === 1));
  assert.ok(measured.callCount > 0); assert.equal(control.callCount, 0);
  for (const row of measured.top) {
    assert.ok(Number.isInteger(row.calls) && row.calls > 0);
    assert.ok(Number.isFinite(row.totalMs) && row.totalMs >= row.maxMs && row.maxMs >= 0);
  }
});
