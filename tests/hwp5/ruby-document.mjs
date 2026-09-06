import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { rubyPayload } from "./ruby.mjs";
import {
  documentActual,
  decodedDocumentInput,
  documentRecords,
} from "./documents.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const frame = (tag, level, p) =>
  Buffer.concat([w(tag | (level << 10) | (p.length << 20)), p]);
export function rubyDocumentEdges(call, cfb, h, doc, sections) {
  const section = sections.find((s) => s.index === 0),
    original = section.bytes;
  const good = rubyPayload(
    Buffer.from("가", "utf16le"),
    Buffer.from("kana", "utf16le"),
    [2, 50, 0, 0, 5],
  );
  const paragraph = (p) => {
    const header = Buffer.alloc(24);
    header.writeUInt32LE(9);
    header.writeUInt32LE(1 << 23, 4);
    const text = Buffer.alloc(18);
    text.writeUInt16LE(23);
    text.writeUInt32LE(0x74647574, 2);
    text.writeUInt16LE(23, 14);
    text.writeUInt16LE(13, 16);
    return Buffer.concat([
      frame(66, 0, header),
      frame(67, 1, text),
      frame(71, 1, Buffer.concat([w(0x74647574), p])),
    ]);
  };
  const replaced = (p) =>
    sections.map((s) =>
      s.index === 0
        ? { index: 0, bytes: Buffer.concat([original, paragraph(p)]) }
        : s,
    );
  const run = (p) => call(24, decodedDocumentInput(h, doc, replaced(p)));
  const base = run(good);
  documentActual(call, h, doc, replaced(good));
  const nodes = cfb.document().nodes,
    body = nodes.findIndex((n) => n.name === "BodyText" && n.parent === 0),
    index = nodes.findIndex((n) => n.name === "Section0" && n.parent === body);
  assert.ok(index >= 0);
  const full = (p) => {
    const copy = nodes.map((n) => ({ ...n })),
      plain = replaced(p).find((s) => s.index === 0).bytes;
    copy[index].content =
      h.readUInt32LE(36) & 1 ? deflateRawSync(plain) : plain;
    return call(
      25,
      Buffer.concat([w(67108864), Buffer.from(cfb.write({ nodes: copy }))]),
    );
  };
  const originalCfb = full(good);
  assert.deepEqual(originalCfb.subarray(0, base.length), base);
  let rejected = 0;
  for (let n = 0; n < good.length; n++) {
    assert.throws(() => run(good.subarray(0, n)), /UnexpectedEnd/);
    rejected++;
    assert.deepEqual(run(good), base);
  }
  assert.throws(() => full(good.subarray(0, good.length - 1)), /UnexpectedEnd/);
  rejected++;
  assert.deepEqual(full(good), originalCfb);
  const scalarOffset = 4 + 2 * (1 + 4);
  for (const [offset, value, field] of [
    [scalarOffset, 3, 3],
    [scalarOffset + 16, 6, 4],
  ]) {
    const changed = Buffer.from(good);
    changed.writeUInt32LE(value, offset);
    const want = Buffer.from(base),
      at = sectionFieldOffset(0, "ruby", field);
    want.writeUInt32LE(want.readUInt32LE(at) + 1, at);
    assert.deepEqual(run(changed), want);
    assert.deepEqual(full(changed).subarray(0, want.length), want);
  }
  // Distinct ruby diagnostics in Section1 detect stride/index placement mistakes.
  const info = Buffer.from(doc),
    properties = documentRecords(info).find((r) => r.tag === 16);
  info.writeUInt16LE(2, properties.start);
  const reserved = Buffer.from(good);
  reserved.writeUInt32LE(3, scalarOffset);
  const two = [
    { index: 0, bytes: Buffer.concat([original, paragraph(good)]) },
    { index: 1, bytes: Buffer.concat([original, paragraph(reserved)]) },
  ];
  documentActual(call, h, info, two);
  const paired = call(24, decodedDocumentInput(h, info, two));
  assert.equal(paired.readUInt32LE(sectionFieldOffset(0, "ruby", 3)), 0);
  assert.equal(paired.readUInt32LE(sectionFieldOffset(1, "ruby", 3)), 1);
  return { synthetic: true, rejected, diagnostics: 4, distinctSections: 2 };
}
