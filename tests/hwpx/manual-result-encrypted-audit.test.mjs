import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("manual result audit records encryption refusal without counting a successful edit", () => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const path = "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx";
  const before = readFileSync(path);
  const result = spawnSync(
    process.execPath,
    [
      "tools/hwpx-manual-result-input-audit.mjs",
      `--wasm=${process.env.HWPJS_TEST_WASM}`,
      `--fixture=${path}`,
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const rows = result.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].status, "encrypted_document_refused");
  assert.equal(rows[1].error, "EncryptedDocument");
  assert.equal(rows[1].path, path);
  const summary = rows.at(-1);
  assert.equal(summary.kind, "summary");
  assert.equal(summary.files, 1);
  assert.equal(summary.encrypted, 1);
  assert.equal(summary.fields, 0);
  assert.equal(summary.verified, 0);
  assert.equal(summary.failures, 0);
  assert.deepEqual(summary.refusals, {});
  assert.deepEqual(readFileSync(path), before);
});

test("manual result audit does not reclassify malformed input as encryption", () => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const result = spawnSync(
    process.execPath,
    [
      "tools/hwpx-manual-result-input-audit.mjs",
      `--wasm=${process.env.HWPJS_TEST_WASM}`,
      "--fixture=README.md",
    ],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert(!result.stdout.includes('"kind":"summary"'));
  assert(!result.stdout.includes('"encrypted_document_refused"'));
  assert.match(result.stderr, /Error:/);
  assert.doesNotMatch(result.stderr, /Error: EncryptedDocument/);
});
