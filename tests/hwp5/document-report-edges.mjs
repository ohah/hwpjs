import assert from "node:assert/strict";
import { decodedDocumentInput, documentRecords } from "./documents.mjs";
import { noteNumberLinksActual } from "./note-number-links.mjs";
import {
  documentPrefixBytes,
  sectionReportBytes,
  reportBytes,
  sectionFieldOffset,
} from "./document-report-wire.mjs";
export function reportWireEdges() {
  assert.equal(documentPrefixBytes, 132);
  assert.equal(sectionReportBytes, 832);
  assert.equal(sectionFieldOffset(0, "header_footer"), 280);
  assert.equal(sectionFieldOffset(0, "notes"), 500);
  assert.equal(sectionFieldOffset(0, "note_number_links"), 528);
  assert.equal(sectionFieldOffset(0, "note_number_links", 7), 556);
  assert.equal(sectionFieldOffset(1, "number_controls", 2), 1140);
  assert.equal(sectionFieldOffset(0, "forms"), 852);
  assert.equal(sectionFieldOffset(1, "forms", 27), 1792);
  assert.equal(reportBytes(2), 1796);
  for (const index of [-1, 1.5, NaN, Infinity, 65536])
    assert.throws(() => reportBytes(index), RangeError);
  for (const [group, field] of [
    ["unknown", 0],
    ["__proto__", 0],
    ["header_footer", 5],
    ["number_controls", -1],
    ["note_number_links", 8],
    ["records", NaN],
    ["forms", 28],
  ])
    assert.throws(() => sectionFieldOffset(0, group, field), RangeError);
}
export function reportOrderingEdges(call, h, doc, sections) {
  for (const s of sections) {
    const r = documentRecords(s.bytes).find(
      (r) =>
        r.tag === 71 &&
        [0x68656164, 0x666f6f74, 0x61746e6f].includes(
          s.bytes.readUInt32LE(r.start),
        ),
    );
    if (!r) continue;
    const numbering = s.bytes.readUInt32LE(r.start) === 0x61746e6f;
    const original = call(24, decodedDocumentInput(h, doc, sections));
    const begin = sectionFieldOffset(s.index, "records");
    const first = original.subarray(begin, begin + sectionReportBytes);
    const second = Buffer.from(first);
    const group = numbering ? "number_controls" : "header_footer",
      field = numbering ? 2 : 3;
    const local = sectionFieldOffset(0, group, field) - documentPrefixBytes;
    second.writeUInt32LE(second.readUInt32LE(local) + 1, local);
    const changed = Buffer.from(s.bytes);
    changed.writeUInt32LE(
      (changed.readUInt32LE(r.start + 4) | (numbering ? 15 : 3)) >>> 0,
      r.start + 4,
    );
    if (numbering) {
      const noteBase = sectionFieldOffset(0, "note_number_links") - documentPrefixBytes;
      noteNumberLinksActual(changed).forEach((value, i) =>
        second.writeUInt32LE(value, noteBase + 4 * i),
      );
    }
    const info = Buffer.from(doc),
      properties = documentRecords(doc).find((r) => r.tag === 16);
    info.writeUInt16LE(2, properties.start);
    const two = [
      { index: 0, bytes: s.bytes },
      { index: 1, bytes: changed },
    ];
    const normal = call(24, decodedDocumentInput(h, info, two));
    const reversed = call(
      24,
      decodedDocumentInput(h, info, [...two].reverse()),
    );
    assert.equal(normal.length, reportBytes(2));
    assert.deepEqual(
      normal.subarray(documentPrefixBytes),
      Buffer.concat([first, second]),
    );
    assert.deepEqual(reversed, normal);
    return 1;
  }
  return 0;
}
