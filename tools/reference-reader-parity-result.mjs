import assert from "node:assert/strict";
const expectedRefusals = new Set([
  "EncryptedDocument",
  "UnsupportedEncryption",
  "SectionCountMismatch",
]);

export function readerParityResult(before, after, path) {
  for (const value of [before, after]) {
    assert(value && typeof value === "object" && !Array.isArray(value), "InvalidParityResponse");
    assert(
      value.error === null
        ? typeof value.hash === "string" && /^[a-f0-9]{64}$/.test(value.hash)
        : value.hash === null && typeof value.error === "string" && value.error.length > 0,
      "InvalidParityResponse",
    );
  }
  assert.deepEqual(before, after, `ReaderResponseParityMismatch:${path}`);
  if (before.error !== null) {
    assert(
      expectedRefusals.has(before.error),
      `UnexpectedMatchedReaderFailure:${path}:${before.error}`,
    );
    return { status: "matched_refusal", responseSha256: null, error: before.error };
  }
  return { status: "full_response_matched", responseSha256: before.hash, error: null };
}
