import assert from "node:assert/strict";
import { documentRecords, decodedDocumentInput } from "./documents.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
export function pageNumberActual(call, b) {
  const stats = [0, 0, 0, 0];
  for (const r of documentRecords(b))
    if (r.tag === 71 && b.readUInt32LE(r.start) === 0x70676e70) {
      const p = b.subarray(r.start + 4, r.end);
      assert.deepEqual(call(33, p), p);
      stats[0]++;
      stats[1] += ((p.readUInt32LE(0) >>> 8) & 15) > 10;
      stats[2] += p.readUInt16LE(10) !== 45;
      stats[3] += p.length - 12;
    }
  return stats;
}
export function pageNumberEdges(call) {
  let accepted = 0,
    rejected = 0;
  const check = (b) => {
    assert.deepEqual(call(33, b), b);
    accepted++;
  };
  const good = Buffer.alloc(12, 255);
  for (let n = 0; n < 12; n++) {
    assert.throws(() => call(33, good.subarray(0, n)), /UnexpectedEnd/);
    rejected++;
    check(good);
  }
  for (let bit = 0; bit < 96; bit++) {
    const b = Buffer.alloc(12);
    b[bit >>> 3] = 1 << (bit & 7);
    check(b);
  }
  for (const dash of [0, 45, 0xd800, 0xffff]) {
    const b = Buffer.alloc(12);
    b.writeUInt16LE(dash, 10);
    check(b);
  }
  for (let tail = 0; tail < 4; tail++)
    check(Buffer.concat([good, Buffer.alloc(tail, 7)]));
  return { accepted, rejected };
}
export function pageNumberDocumentEdges(call, h, doc, sections) {
  let count = 0;
  for (const s of sections)
    for (const r of documentRecords(s.bytes)) {
      if (r.tag !== 71 || s.bytes.readUInt32LE(r.start) !== 0x70676e70)
        continue;
      const invoke = (b) =>
        call(
          24,
          decodedDocumentInput(
            h,
            doc,
            sections.map((x) => (x.index === s.index ? { ...x, bytes: b } : x)),
          ),
        );
      const good = invoke(s.bytes);
      const short = Buffer.concat([
        s.bytes.subarray(0, r.end - 1),
        s.bytes.subarray(r.end),
      ]);
      short.writeUInt32LE(
        ((s.bytes.readUInt32LE(r.offset) & 0xfffff) |
          ((r.end - r.start - 1) << 20)) >>>
          0,
        r.offset,
      );
      assert.throws(() => invoke(short), /UnexpectedEnd/);
      const reserved = Buffer.from(s.bytes);
      reserved.writeUInt32LE(
        (reserved.readUInt32LE(r.start + 4) | 0xf00) >>> 0,
        r.start + 4,
      );
      const out = invoke(reserved),
        offset = sectionFieldOffset(s.index, "page_number", 1);
      assert.equal(out.readUInt32LE(offset), good.readUInt32LE(offset) + 1);
      const toggled = Buffer.from(s.bytes),
        dash = r.start + 14;
      const wasDash = toggled.readUInt16LE(dash) === 45;
      toggled.writeUInt16LE(wasDash ? 0 : 45, dash);
      const result = invoke(toggled),
        diagnostic = sectionFieldOffset(s.index, "page_number", 2);
      assert.equal(
        result.readUInt32LE(diagnostic),
        good.readUInt32LE(diagnostic) + (wasDash ? 1 : -1),
      );
      count++;
    }
  return count;
}
