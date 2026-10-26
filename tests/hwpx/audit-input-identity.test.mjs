import assert from "node:assert/strict";
import test from "node:test";
import { captureInputIdentity, verifyInputIdentity } from "../../tools/audit-input-identity.mjs";
import { readFileSync } from "node:fs";

const path = new URL(import.meta.url);

test("audit identity independently rejects memory and file mismatches", () => {
  const input = readFileSync(path);
  const expected = captureInputIdentity(input);
  verifyInputIdentity(input, expected, path);
  const changed = Buffer.from(input);
  changed[0] ^= 1;
  assert.throws(() => verifyInputIdentity(changed, expected, path), /AuditMemoryInputChanged/);
  assert.throws(
    () => verifyInputIdentity(changed, captureInputIdentity(changed), path),
    /AuditFileInputChanged/,
  );
  assert.throws(
    () =>
      verifyInputIdentity(input, expected, new URL("./missing-identity-fixture", import.meta.url)),
    /ENOENT/,
  );
});
