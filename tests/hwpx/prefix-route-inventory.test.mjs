import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureInputIdentity } from "../../tools/audit-input-identity.mjs";

const tool = resolve("tools/hwpx-prefix-route-inventory.mjs");
test("prefix route inventory rejects incomplete and ambiguous CLI scope before reading files", () => {
  for (const [args, expected] of [
    [[], "MissingAuditWasm"],
    [["--wasm=missing"], "MissingAuditFixture"],
    [["--wasm=missing", "--fixture=a", "--fixture=b"], "DuplicateAuditArgument"],
    [["--wasm=missing", "--fixture=a", "--history"], "Unknown argument"],
    [["--wasm=", "--fixture=a"], "Unknown argument"],
  ]) {
    assert.throws(
      () =>
        execFileSync(process.execPath, [tool, ...args], {
          timeout: 10000,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      (error) =>
        error.status === 1 && error.signal === null && String(error.stderr).includes(expected),
    );
  }
});

test("prefix route inventory reports all plain paragraphs and exact input/artifact identities", () => {
  const fixture = resolve("legacy/rust/crates/hwp-core/tests/fixtures/linespacing.hwpx");
  const wasm = resolve(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const before = readFileSync(fixture),
    artifact = readFileSync(wasm);
  const result = JSON.parse(
    execFileSync(process.execPath, [tool, `--wasm=${wasm}`, `--fixture=${fixture}`], {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  assert.deepEqual(result.counts, { plain: 26 });
  assert.deepEqual(result.refused, []);
  assert.equal(result.inputSha256, captureInputIdentity(before));
  assert.equal(result.wasmSha256, captureInputIdentity(artifact));
  assert.match(result.scope, /query-only.*not editing/);
  assert.deepEqual(readFileSync(fixture), before);
  assert.deepEqual(readFileSync(wasm), artifact);
});
