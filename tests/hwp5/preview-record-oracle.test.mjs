import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rawParagraphTexts } from "../../tools/hwp5-preview-record-oracle.mjs";

function record(tag, level, payload) {
  const out = Buffer.alloc(4 + payload.length);
  out.writeUInt32LE((payload.length << 20) | (level << 10) | tag);
  Buffer.from(payload).copy(out, 4);
  return out;
}

test("preview oracle preserves missing text and ignores unrelated records", () => {
  const bytes = Buffer.concat([
    record(66, 0, [0]), record(77, 1, [1]),
    record(66, 0, [0]), record(67, 1, [65, 0]),
  ]);
  assert.deepEqual(rawParagraphTexts(bytes), [null, Buffer.from([65, 0])]);
});

test("preview oracle rejects truncated framing and invalid text ownership", () => {
  assert.throws(() => rawParagraphTexts(Buffer.of(1)), /truncated header/);
  assert.throws(() => rawParagraphTexts(Buffer.concat([record(66, 0, [0]), Buffer.of(67, 4, 32, 0, 0)])), /truncated payload/);
  assert.throws(() => rawParagraphTexts(record(67, 1, [65, 0])), /invalid text owner/);
  assert.throws(() => rawParagraphTexts(Buffer.concat([record(66, 0, [0]), record(67, 1, [65, 0]), record(67, 1, [66, 0])])), /invalid text owner/);
});

test("preview corpus audit classifies tracked fixtures and checks every accepted paragraph", () => {
  const fixtureRoot = fileURLToPath(new URL("../../legacy/rust/crates/hwp-core/tests/fixtures/", import.meta.url));
  const script = fileURLToPath(new URL("../../tools/hwp5-preview-corpus-audit.mjs", import.meta.url));
  const result = JSON.parse(execFileSync(process.execPath, [script, fixtureRoot], { encoding: "utf8" }));
  assert.equal(result.paths, 48);
  assert.deepEqual(result.categories, {
    UnsupportedDistribution: 2,
    UnsupportedEncryption: 1,
    preview_ok: 45,
  });
  assert.equal(result.oracle.matched, 45);
  assert.ok(result.oracle.paragraphs > 0);
  assert.equal(result.oracle.unavailable, 0);
  assert.deepEqual(result.oracle.failures, []);
});
