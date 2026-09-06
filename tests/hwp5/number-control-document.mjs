import assert from "node:assert/strict";
import { decodedDocumentInput, documentRecords } from "./documents.mjs";
export function numberDocumentEdges(call, h, doc, sections) {
  let checked = 0;
  for (const s of sections)
    for (const r of documentRecords(s.bytes)) {
      if (r.tag !== 71 || s.bytes.readUInt32LE(r.start) !== 0x61746e6f)
        continue;
      const short = Buffer.concat([
        s.bytes.subarray(0, r.end - 1),
        s.bytes.subarray(r.end),
      ]);
      const bits = s.bytes.readUInt32LE(r.offset) & 0xfffff;
      short.writeUInt32LE(
        (bits | ((r.end - r.start - 1) << 20)) >>> 0,
        r.offset,
      );
      const ss = sections.map((x) =>
        x.index === s.index ? { ...x, bytes: short } : x,
      );
      assert.throws(
        () => call(24, decodedDocumentInput(h, doc, ss)),
        /UnexpectedEnd/,
      );
      const normal = call(24, decodedDocumentInput(h, doc, sections));
      const modified = Buffer.from(s.bytes);
      modified.writeUInt32LE(
        (modified.readUInt32LE(r.start + 4) | 15) >>> 0,
        r.start + 4,
      );
      const result = call(
        24,
        decodedDocumentInput(
          h,
          doc,
          sections.map((x) =>
            x.index === s.index ? { ...x, bytes: modified } : x,
          ),
        ),
      );
      const offset = 132 + s.index * 180 + 164;
      assert.equal(
        result.readUInt32LE(offset + 8),
        normal.readUInt32LE(offset + 8) + 1,
      );
      checked++;
    }
  return checked;
}
