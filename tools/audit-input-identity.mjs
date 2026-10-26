import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function captureInputIdentity(bytes) {
  return digest(bytes);
}

export function verifyInputIdentity(bytes, expected, path) {
  assert.equal(digest(bytes), expected, "AuditMemoryInputChanged");
  assert.equal(digest(readFileSync(path)), expected, "AuditFileInputChanged");
}
