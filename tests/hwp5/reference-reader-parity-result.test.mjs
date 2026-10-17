import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readerParityResult } from "../../tools/reference-reader-parity-result.mjs";

test("reader response parity separates identical text results from known matching refusals", () => {
  const success = Object.freeze({ hash: "a".repeat(64), error: null });
  assert.deepEqual(readerParityResult(success, { ...success }, "fixture"), { status: "full_response_matched", responseSha256: success.hash, error: null });
  for (const error of ["EncryptedDocument", "UnsupportedEncryption", "SectionCountMismatch"]) {
    const refusal = Object.freeze({ hash: null, error });
    assert.deepEqual(readerParityResult(refusal, { ...refusal }, "fixture"), { status: "matched_refusal", responseSha256: null, error });
  }
});

test("reader response parity fails on changed packets changed outcomes and unknown matching errors", () => {
  const success = { hash: "a".repeat(64), error: null };
  assert.throws(() => readerParityResult(success, { ...success, hash: "b".repeat(64) }, "fixture"), /ReaderResponseParityMismatch/);
  assert.throws(() => readerParityResult(success, { hash: null, error: "EncryptedDocument" }, "fixture"), /ReaderResponseParityMismatch/);
  assert.throws(() => readerParityResult({ hash: null, error: "MemoryOutOfBounds" }, { hash: null, error: "MemoryOutOfBounds" }, "fixture"), /UnexpectedMatchedReaderFailure/);
  for (const invalid of [null, [], {}, { hash: "", error: null }, { hash: "A".repeat(64), error: null }, { hash: null, error: "" }, { hash: success.hash, error: "EncryptedDocument" }]) {
    assert.throws(() => readerParityResult(invalid, invalid, "fixture"), /InvalidParityResponse/);
  }
});

test("reader response parity CLI rejects missing duplicate and unknown arguments before file reads", () => {
  for (const args of [[], ["--before-wasm=x"], ["--before-wasm=x", "--before-wasm=y"], ["--after-wasm=x", "--unknown=x"], ["--before-wasm=", "--after-wasm=x"]]) {
    const result = spawnSync(process.execPath, ["tools/reference-reader-parity-audit.mjs", ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MissingParityArtifacts|DuplicateParityArgument|UnknownParityArgument/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});
