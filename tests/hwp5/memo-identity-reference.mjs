import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { identityActual } from "./links.mjs";
import { documentRecords, decodedDocumentInput } from "./documents.mjs";
import { containerActual } from "./containers.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
export function memoReference(call, cfb, file, h, doc, sections) {
  const v = h.readUInt32LE(32),
    selected = sections.find((s) => s.index === 2),
    b = selected.bytes;
  assert.equal(identityActual(call, v, b), 2);
  const containerReport = containerActual(call, file, cfb, h, doc, sections);
  const nodes = cfb.document().nodes,
    body = nodes.findIndex((n) => n.name === "BodyText" && n.parent === 0),
    index = nodes.findIndex((n) => n.name === "Section2" && n.parent === body);
  assert.ok(index >= 0);
  const full = (plain) => {
    const copy = nodes.map((n) => ({ ...n }));
    copy[index].content =
      h.readUInt32LE(36) & 1 ? deflateRawSync(plain) : plain;
    return call(
      25,
      Buffer.concat([w(67108864), Buffer.from(cfb.write({ nodes: copy }))]),
    );
  };
  const original = full(b);
  let rejected = 0;
  for (const offset of [401288, 401633]) {
    const r = documentRecords(b).find((r) => r.offset === offset);
    assert.equal(r.tag, 71);
    assert.equal(b.readUInt32LE(r.start), 0x25756e6b);
    const units = b.readUInt16LE(r.start + 9),
      end = r.start + 11 + units * 2;
    assert.equal(
      b.subarray(r.start + 11, r.start + 21).toString("utf16le"),
      "MEMO/",
    );
    assert.equal(r.end - end - 4, 4);
    const wrong = Buffer.from(b);
    wrong.writeUInt16LE(88, r.start + 11);
    // Remove 4 opaque bytes and one required ID byte; reframe only this record.
    const short = Buffer.concat([b.subarray(0, r.end - 5), b.subarray(r.end)]);
    short.writeUInt32LE(
      ((b.readUInt32LE(r.offset) & 0xfffff) | ((r.end - r.start - 5) << 20)) >>>
        0,
      r.offset,
    );
    for (const [bad, error] of [
      [wrong, /ControlIdMismatch/],
      [short, /UnexpectedEnd/],
    ]) {
      const changed = sections.map((s) =>
        s.index === 2 ? { index: 2, bytes: bad } : s,
      );
      for (const invoke of [
        () => call(38, Buffer.concat([w(v), bad])),
        () => call(24, decodedDocumentInput(h, doc, changed)),
        () => full(bad),
      ]) {
        assert.throws(invoke, error);
        rejected++;
      }
      assert.equal(identityActual(call, v, b), 2);
      assert.deepEqual(full(b), original);
    }
  }
  return { observedLinks: 2, rejected, containerReport };
}
