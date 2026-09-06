import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { documentRecords } from "./documents.mjs";
const word = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
function check(call, raw, mode) {
  const width = mode ? 16 : 8;
  assert.deepEqual(
    call(42, Buffer.concat([Buffer.from([mode]), raw])),
    Buffer.concat([raw.subarray(0, width), word(raw.length - width), raw.subarray(width)]),
  );
}
export function noteControlEdges(call) {
  let accepted = 0, rejected = 0;
  for (const mode of [0, 1]) {
    const width = mode ? 16 : 8;
    // Independent byte-position mutations catch swapped fields and narrowed integers.
    for (let i = 0; i < width; i++) {
      for (const value of [1, 0x80, 0xff]) {
        const raw = Buffer.alloc(width + 3);
        raw[i] = value;
        raw.set([0xd8, 0, 0xff], width);
        check(call, raw, mode);
        accepted++;
      }
    }
    for (let n = 0; n < width; n++) {
      assert.throws(() => call(42, Buffer.alloc(n + 1, mode)), /UnexpectedEnd/);
      check(call, Buffer.alloc(width), mode);
      rejected++;
    }
  }
  assert.throws(() => call(42, Buffer.from([2])), /InvalidMode/);
  return { accepted, rejected: rejected + 1 };
}
export function noteControlReference(call, cfb) {
  let controls = 0, rejected = 0;
  const files = [], skipped = [];
  for (const [name, expected] of [["footnote-01.hwp", 9], ["endnote-01.hwp", 6], ["footnote-tbox-01.hwp", 2]]) {
    const path = new URL(`../../reference/rhwp/samples/${name}`, import.meta.url);
    if (!existsSync(path)) { skipped.push(name); continue; }
    cfb.parse(readFileSync(path), { strict: true });
    const h = Buffer.from(cfb.findExact("/FileHeader").content);
    assert.equal(h.readUInt32LE(32), 0x05000300);
    assert.equal(h.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024), 0);
    const raw = Buffer.from(cfb.findExact("/BodyText/Section0").content);
    const body = h.readUInt32LE(36) & 1 ? inflateRawSync(raw) : raw;
    assert.deepEqual(call(3, Buffer.concat([h, raw]), body.length), body);
    let count = 0;
    for (const r of documentRecords(body)) {
      if (r.tag !== 71 || ![0x666e2020, 0x656e2020].includes(body.readUInt32LE(r.start))) continue;
      const payload = body.subarray(r.start + 4, r.end);
      assert.equal(payload.length, 16);
      check(call, payload, 1);
      check(call, payload, 0);
      for (let n = 0; n < 16; n++) {
        assert.throws(() => call(42, Buffer.concat([Buffer.from([1]), payload.subarray(0, n)])), /UnexpectedEnd/);
        check(call, payload, 1);
        rejected++;
      }
      count++;
    }
    assert.equal(count, expected);
    controls += count;
    files.push({ name, count });
  }
  return { controls, rejected, files, skipped };
}
