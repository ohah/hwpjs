import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { decodeHwpxText } from "../../js/hwpx-text-wire.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");

test("public HWPX events match independent XML content and survive later reads", async () => {
  const reader = await createHwpxReader(wasm);
  try {
    const result = reader.readTextEvents(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx"));
    assert.equal(result.sectionCount, 1); assert.equal(result.paragraphCount, 7);
    const text = Buffer.concat(result.events.filter(e => e.kind === "content").map(e => e.raw));
    assert.equal(text.length, 204);
    // Python zipfile + ElementTree hp:t itertext, not product event output.
    assert.equal(createHash("sha256").update(text).digest("hex"), "5f701567653360b2e6cd8f9306a4c21b1ebdb268acc475b9226cc68a81e76bc5");
    const saved = result.events.map(e => Buffer.from(e.raw));
    assert.throws(() => reader.readTextEvents(new Uint8Array()), Error);
    reader.readTextEvents(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx"));
    result.events.forEach((e, i) => assert.deepEqual(Buffer.from(e.raw), saved[i]));
  } finally { reader.close(); }
  assert.throws(() => reader.readTextEvents(new Uint8Array()), { message: "ReaderClosed" });
  reader.close();
});

test("public HWPX events open every tracked unencrypted fixture", async () => {
  const files = execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(p => p.includes("/fixtures/") && p.endsWith(".hwpx"));
  assert(files.length > 0);
  const reader = await createHwpxReader(wasm);
  try {
    for (const path of files) {
      const input = readFileSync(path), before = Buffer.from(input);
      if (path.endsWith("/password-12345.hwpx")) assert.throws(() => reader.readTextEvents(input), { message: "EncryptedDocument" });
      else {
        const result = reader.readTextEvents(input);
        assert.equal(result.events.filter(e => e.kind === "paragraph_start").length, result.paragraphCount, path);
        assert.equal(result.events.filter(e => e.kind === "paragraph_end").length, result.paragraphCount, path);
      }
      assert.deepEqual(input, before, path);
    }
  } finally { reader.close(); }
});

function packet() {
  const header = Buffer.alloc(16); header.write("HXT1"); header.writeUInt32LE(1, 4); header.writeUInt32LE(1, 8); header.writeUInt32LE(2, 12);
  return Buffer.concat([header, ...["<p:p>", "</p:p>"].map((tag, kind) => {
    const row = Buffer.alloc(32); row.writeUInt32LE(1, 8); row.writeUInt32LE(kind, 20); row.writeUInt32LE(0xffffffff, 24); row.writeUInt32LE(tag.length, 28);
    return Buffer.concat([row, Buffer.from(tag)]);
  })]);
}

test("HXT1 decoder rejects every truncation, invalid enums bounds UTF-8 and trailing data", () => {
  const bytes = packet(), decoded = decodeHwpxText(bytes);
  assert.equal(decoded.events[0].value, "<p:p>");
  for (let i = 0; i < bytes.length; i++) assert.throws(() => decodeHwpxText(bytes.subarray(0, i)), { message: "InvalidHwpxTextWire" });
  for (const [at, value] of [[4, 0], [8, 2], [12, 0xffffffff], [16, 1], [24, 0], [36, 10], [40, 0], [44, 0xffffffff]]) {
    const bad = Buffer.from(bytes); bad.writeUInt32LE(value, at);
    assert.throws(() => decodeHwpxText(bad), { message: "InvalidHwpxTextWire" });
  }
  const badUtf8 = Buffer.from(bytes); badUtf8[48] = 0xff;
  assert.throws(() => decodeHwpxText(badUtf8), { message: "InvalidHwpxTextWire" });
  assert.throws(() => decodeHwpxText(Buffer.concat([bytes, Buffer.from([0])])), { message: "InvalidHwpxTextWire" });
  bytes.fill(0); assert.equal(decoded.events[0].raw[0], "<".charCodeAt(0));
});
