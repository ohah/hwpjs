import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { documentRecords, decodedDocumentInput } from "./documents.mjs";
import { containerActual } from "./containers.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
import { polygonBytes } from "./shape-polygon.mjs";
import { curveOwnerActual, curveOwnerRun } from "./curve-validation.mjs";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
export function curveLayoutDocument(call, cfb) {
  const path = new URL('../../reference/rhwp/samples/3-09월_교육_통합_2022.hwp', import.meta.url);
  if (!existsSync(path)) return {skipped: true};
  const file = readFileSync(path); cfb.parse(file, {strict: true});
  const h = Buffer.from(cfb.findExact('/FileHeader').content), v = h.readUInt32LE(32);
  const decode = path => call(3, Buffer.concat([h, Buffer.from(cfb.findExact(path).content)]));
  const doc = decode('/DocInfo'), original = decode('/BodyText/Section0');
  // Independent Node inflate/stream accounting verifies the exact total and total-1 boundary.
  containerActual(call, file, cfb, h, doc, [{index: 0, bytes: original}]);
  assert.throws(() => call(25, Buffer.concat([w(64 * 1024 * 1024), file])), /LimitExceeded/);
  const fullOriginal = call(25, Buffer.concat([w(128 * 1024 * 1024), file]));
  assert.equal(fullOriginal.readUInt32LE(fullOriginal.length - 8), 87772864);
  const nodes = cfb.document().nodes, body = nodes.findIndex(n => n.parent === 0 && n.name === 'BodyText');
  const frame = (b, r, p) => Buffer.concat([w((b.readUInt32LE(r.offset) & 0xfffff) | p.length << 20), p]);
  const variant = mode => Buffer.concat(documentRecords(original).map(r => {
    if (r.tag !== 83) return original.subarray(r.offset, r.end);
    const p = original.subarray(r.start, r.end), n = p.readInt32LE();
    const points = Array.from({length: n}, (_, i) => [p.readInt32LE(4 + i * 8), p.readInt32LE(8 + i * 8)]);
    return frame(original, r, polygonBytes(points, mode, p.subarray(4 + n * 8)));
  }));
  assert.deepEqual(variant(1), original);
  const input = bytes => decodedDocumentInput(h, doc, [{index: 0, bytes}]);
  let rejected = 1, ordering = 0;
  for (const mode of [0, 1]) {
    const b = variant(mode), width = mode ? 4 : 2;
    const readCount = (b, at) => mode ? b.readInt32LE(at) : b.readInt16LE(at);
    const writeCount = (b, at, n) => mode ? b.writeInt32LE(n, at) : b.writeInt16LE(n, at);
    const run = bytes => call(72, Buffer.concat([Buffer.from([mode]), input(bytes)]));
    const full = bytes => call(73, Buffer.concat([Buffer.from([mode]), w(128 * 1024 * 1024), Buffer.from(cfb.write({nodes: nodes.map(n => n.parent === body && n.name === 'Section0' ? {...n, content: h.readUInt32LE(36) & 1 ? deflateRawSync(bytes) : bytes} : n)}))]));
    const report = run(b), container = full(b), expected = curveOwnerActual(call, v, b, mode);
    assert.deepEqual(expected, [1, 418, 417, 0, 0, 4]);
    assert.deepEqual(container.subarray(0, report.length), report);
    expected.forEach((n, i) => assert.equal(report.readUInt32LE(sectionFieldOffset(0, 'curves', i)), n));
    if (mode === 1) { assert.deepEqual(call(24, input(b)), report); assert.deepEqual(container, fullOriginal); }
    const reject = (bytes, error) => {
      assert.throws(() => curveOwnerRun(call, v, bytes, mode), error); rejected++;
      assert.throws(() => run(bytes), error); rejected++;
      assert.throws(() => full(bytes), error); rejected++;
      assert.deepEqual(run(b), report); assert.deepEqual(full(b), container);
    };
    const records = documentRecords(b).filter(r => r.tag === 83); assert.equal(records.length, 1);
    for (const r of records) {
      const count = readCount(b, r.start);
      for (const n of [-1, count + 1]) { const bad = Buffer.from(b); writeCount(bad, r.start, n); reject(bad, n < 0 ? /NegativePointCount/ : /UnexpectedEnd/); }
      // Complete coordinates but missing all / just the last required segment.
      for (const length of [width + count * 8, width + count * 8 + count - 2])
        reject(Buffer.concat([b.subarray(0, r.offset), frame(b, r, b.subarray(r.start, r.start + length)), b.subarray(r.end)]), /UnexpectedEnd/);
    }
    const changed = Buffer.from(b); changed[records[0].start + width + 418 * 8] = 255;
    const changedReport = run(changed); assert.deepEqual(full(changed).subarray(0, changedReport.length), changedReport);
    assert.equal(changedReport.readUInt32LE(sectionFieldOffset(0, 'curves', 4)), 1);
    const info = Buffer.from(doc), properties = documentRecords(info).find(r => r.tag === 16); info.writeUInt16LE(2, properties.start);
    const pair = [{index: 0, bytes: b}, {index: 1, bytes: changed}];
    const ordered = parts => call(72, Buffer.concat([Buffer.from([mode]), decodedDocumentInput(h, info, parts)]));
    const canonical = ordered(pair); assert.deepEqual(ordered([...pair].reverse()), canonical);
    assert.equal(canonical.readUInt32LE(sectionFieldOffset(0, 'curves', 4)), 0);
    assert.equal(canonical.readUInt32LE(sectionFieldOffset(1, 'curves', 4)), 1); ordering++;
  }
  for (const mode of [2, 255]) for (const probe of [72, 73]) {
    assert.throws(() => call(probe, Buffer.from([mode])), /InvalidMode/); rejected++;
  }
  return {layouts: 2, syntheticSpecifiedLayout: true, decodedBytes: 87772864, rejected, ordering};
}
