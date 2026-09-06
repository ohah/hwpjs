import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { decodedDocumentInput, documentRecords } from "./documents.mjs";
import { sectionXml } from "./fixture-xml.mjs";
import { deflateRawSync } from "node:zlib";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
// The section presentation gradient keeps an unused image ID, not an active image.
export function parameterZeroReference(call, cfb) {
  let files = 0, skipped = 0, truncated = 0;
  for (const [name, offset, bins, flagOffset] of [
    ['복학원서.hwp', 246, 2, 234], ['hwp3-sample16-hwp5.hwp', 230, 7, 26],
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
    assert.deepEqual(call(21, Buffer.concat([Buffer.from([0]), p])), p);
    assert.equal(p.readUInt16LE(offset - 4), 16414);
    assert.equal(p.readUInt16LE(offset - 2), 0x8002);
    assert.equal(p.readUInt16LE(offset), 0);
    assert.equal(p.readUInt16LE(flagOffset), 0x4001);
    assert.equal(p.readUInt16LE(flagOffset + 2), 9);
    assert.equal(p.readUInt32LE(flagOffset + 4), 4);
    const xml = sectionXml(readFileSync(new URL(name.replace(/\.hwp$/, '.hwpx'), new URL('../../reference/rhwp/samples/', import.meta.url))));
    const presentation = xml.match(/<hp:presentation\b[\s\S]*?<\/hp:presentation>/)?.[0];
    assert.ok(presentation); assert.match(presentation, /<hc:gradation\b/);
    assert.doesNotMatch(presentation, /<hc:(?:img|imgBrush)\b/);
    const run = payload => call(23, Buffer.concat([
      Buffer.from([1]), w(v), w(bins), w(87 | (payload.length << 20)), payload,
    ]));
    assert.throws(() => run(p), /InvalidResourceReference/);
    for (let length = 0; length < p.length; length++) {
      const short = p.subarray(0, length);
      assert.throws(() => call(23, Buffer.concat([
        Buffer.from([1]), w(v), w(bins), w(71 | (4 << 20)), w(0x73656364),
        w(87 | (1 << 10) | (short.length << 20)), short,
      ])), /UnexpectedEnd/);
      truncated++;
    }
    // A test-only single-field mutation isolates the reference policy from parsing.
    const changed = Buffer.from(p); changed.writeUInt16LE(1, offset);
    assert.equal(run(changed).readUInt32LE(7 * 4), 1);
    assert.throws(() => run(p), /InvalidResourceReference/);
    const input = bytes => decodedDocumentInput(h, d, [{ index: 0, bytes }]);
    const original = call(24, input(b)), cap = w(64 * 1024 * 1024);
    const container = call(25, Buffer.concat([cap, file]));
    assert.deepEqual(container.subarray(0, original.length), original);
    const bodyRun = bytes => call(23, Buffer.concat([Buffer.from([1]), w(v), w(bins), bytes]));
    assert.equal(bodyRun(b).readUInt32LE(7 * 4), 1);
    const active = Buffer.from(b); active.writeUInt32LE(2, r.start + flagOffset + 4);
    assert.throws(() => bodyRun(active), /InvalidResourceReference/);
    assert.throws(() => call(24, input(active)), /InvalidResourceReference/);
    const nodes = cfb.document().nodes, body = nodes.findIndex(n => n.parent === 0 && n.name === 'BodyText');
    const altered = nodes.map(n => n.parent === body && n.name === 'Section0' ? { ...n, content: h.readUInt32LE(36) & 1 ? deflateRawSync(active) : active } : n);
    assert.throws(() => call(25, Buffer.concat([cap, Buffer.from(cfb.write({nodes: altered}))])), /InvalidResourceReference/);
    assert.deepEqual(call(24, input(b)), original);
    assert.deepEqual(call(25, Buffer.concat([cap, file])), container);
    assert.equal(p.readUInt16LE(offset), 0);
    files++;
  }
  return { files, skipped, inactiveGradientImages: files, activeImageRejections: files * 3, truncated };
}
