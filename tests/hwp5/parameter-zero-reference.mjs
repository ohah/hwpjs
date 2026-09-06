import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { decodedDocumentInput, documentRecords } from "./documents.mjs";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
// Evidence of a current limitation, not proof that these real documents are invalid.
// Do not replace every PIT_BINDATA zero with an optional reference without Set semantics.
export function parameterZeroReference(call, cfb) {
  let files = 0, skipped = 0;
  for (const [name, offset, bins] of [
    ['복학원서.hwp', 246, 2], ['hwp3-sample16-hwp5.hwp', 230, 7],
  ]) {
    const path = new URL(`../../reference/rhwp/samples/${name}`, import.meta.url);
    if (!existsSync(path)) { skipped++; continue; }
    const file = readFileSync(path); cfb.parse(file, { strict: true });
    const h = Buffer.from(cfb.findExact('/FileHeader').content), v = h.readUInt32LE(32);
    const decode = path => call(3, Buffer.concat([h, Buffer.from(cfb.findExact(path).content)]));
    const d = decode('/DocInfo'), b = decode('/BodyText/Section0');
    assert.equal(documentRecords(d).filter(r => r.tag === 18).length, bins);
    const refs = call(7, Buffer.concat([w(v), d]));
    assert.equal(refs.readUInt32LE(4), 0);
    const r = documentRecords(b).find(r => r.tag === 87 && r.offset === 185);
    assert.ok(r); assert.equal(r.end - r.start, 280);
    const p = b.subarray(r.start, r.end);
    assert.equal(p.readUInt16LE(offset - 4), 16414);
    assert.equal(p.readUInt16LE(offset - 2), 0x8002);
    assert.equal(p.readUInt16LE(offset), 0);
    const run = payload => call(23, Buffer.concat([
      Buffer.from([1]), w(v), w(bins), w(87 | (payload.length << 20)), payload,
    ]));
    assert.throws(() => run(p), /InvalidResourceReference/);
    // A test-only single-field mutation isolates the reference policy from parsing.
    const changed = Buffer.from(p); changed.writeUInt16LE(1, offset);
    assert.equal(run(changed).readUInt32LE(7 * 4), 1);
    assert.throws(() => run(p), /InvalidResourceReference/);
    assert.throws(() => call(24, decodedDocumentInput(h, d, [{ index: 0, bytes: b }])), /InvalidResourceReference/);
    assert.throws(() => call(25, Buffer.concat([w(64 * 1024 * 1024), file])), /InvalidResourceReference/);
    assert.equal(p.readUInt16LE(offset), 0);
    files++;
  }
  return { files, skipped, unresolvedZeroReferences: files };
}
