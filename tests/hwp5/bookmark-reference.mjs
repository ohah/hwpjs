import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync, deflateRawSync } from "node:zlib";
import { bookmarkActual } from "./bookmarks.mjs";
import {
  documentRecords,
  documentActual,
  decodedDocumentInput,
} from "./documents.mjs";
import { containerActual } from "./containers.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
export function bookmarkReference(call, cfb) {
  const path = new URL(
    "../../reference/rhwp/samples/HWP5-nopassword-123456.hwp",
    import.meta.url,
  );
  if (!existsSync(path)) return { skipped: "reference fixture unavailable" };
  const file = readFileSync(path);
  cfb.parse(file, { strict: true });
  const h = Buffer.from(cfb.findExact("/FileHeader").content),
    v = h.readUInt32LE(32);
  assert.equal(h.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024), 0);
  const decode = (p) => {
    const raw = Buffer.from(cfb.findExact(p).content);
    return h.readUInt32LE(36) & 1 ? inflateRawSync(raw) : raw;
  };
  const b = decode("/BodyText/Section0"),
    doc = decode("/DocInfo"),
    sections = [{ index: 0, bytes: b }];
  const stats = bookmarkActual(call, v, b);
  assert.ok(stats[0] > 0);
  assert.equal(stats[0], stats[2]);
  documentActual(call, h, doc, sections);
  containerActual(call, file, cfb, h, doc, sections);
  const nodes = cfb.document().nodes,
    body = nodes.findIndex((n) => n.name === "BodyText" && n.parent === 0),
    section = nodes.findIndex(
      (n) => n.name === "Section0" && n.parent === body,
    );
  assert.ok(section >= 0);
  const full = (bytes) => {
    const copy = nodes.map((n) => ({ ...n }));
    copy[section].content =
      h.readUInt32LE(36) & 1 ? deflateRawSync(bytes) : bytes;
    return call(
      25,
      Buffer.concat([w(67108864), Buffer.from(cfb.write({ nodes: copy }))]),
    );
  };
  let rejected = 0,
    owned = false;
  for (const r of documentRecords(b)) {
    if (r.tag === 71) owned = b.readUInt32LE(r.start) === 0x626f6b6d;
    if (!owned || r.tag !== 87) continue;
    const p = b.subarray(r.start, r.end);
    // Pin observed one-item named set before targeted mutation; no blind offset.
    assert.equal(p.readUInt16LE(0), 0x021b);
    assert.equal(p.readUInt16LE(2), 1);
    assert.equal(p.readUInt16LE(6), 0x4000);
    assert.equal(p.readUInt16LE(8), 1);
    const bad = Buffer.from(b);
    bad.writeUInt16LE(2, r.start + 8);
    for (const invoke of [
      () => call(36, Buffer.concat([w(v), bad])),
      () => call(24, decodedDocumentInput(h, doc, [{ index: 0, bytes: bad }])),
      () => full(bad),
    ]) {
      assert.throws(invoke, /InvalidNamedFieldType/);
      rejected++;
    }
    bookmarkActual(call, v, b);
  }
  assert.equal(rejected, stats[1] * 3);
  return { stats, rejected };
}
