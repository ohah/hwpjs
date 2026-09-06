import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { documentRecords, decodedDocumentInput } from "./documents.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
import { arcOwnerActual, arcOwnerRun } from "./arc-validation.mjs";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
// Synthetic arcs in a real container. This is NOT an actual arc fixture.
export function arcDocumentEdges(call, cfb) {
  const path = new URL('../../reference/rhwp/samples/group-drawing-02.hwp', import.meta.url);
  if (!existsSync(path)) return {skipped: true};
  const file = readFileSync(path); cfb.parse(file, {strict: true});
  const h = Buffer.from(cfb.findExact('/FileHeader').content), v = h.readUInt32LE(32);
  const decode = path => call(3, Buffer.concat([h, Buffer.from(cfb.findExact(path).content)]));
  const doc = decode('/DocInfo'), original = decode('/BodyText/Section0');
  const nodes = cfb.document().nodes, body = nodes.findIndex(n => n.parent === 0 && n.name === 'BodyText');
  const stack = []; let target;
  for (const record of documentRecords(original)) {
    const level = original.readUInt32LE(record.offset) >>> 10 & 1023; stack.length = level;
    const node = {...record, parent: level ? stack[level - 1] : null};
    if (record.tag === 79) { target = node; break; } stack.push(node);
  }
  assert.ok(target); const owner = target.parent;
  assert.equal(owner.tag, 76); assert.equal(original.readUInt32LE(owner.start), 0x24726563);
  const prefix = Buffer.from(original.subarray(0, target.offset));
  const ids = owner.parent.tag === 71 ? 2 : 1;
  for (let i = 0; i < ids; i++) prefix.writeUInt32LE(0x24617263, owner.start + i * 4);
  if(owner.parent.tag===76){
    const group=owner.parent,level=original.readUInt32LE(owner.offset)>>>10&1023;
    const rows=documentRecords(original),ordinal=rows.filter(r=>r.tag===76&&r.offset>group.offset&&r.offset<owner.offset&&(original.readUInt32LE(r.offset)>>>10&1023)===level).length;
    const base=group.start+(group.parent.tag===71?8:4)+42,start=base+50+original.readUInt16LE(base)*96;
    assert.ok(ordinal<original.readUInt16LE(start));assert.equal(original.readUInt32LE(start+2+ordinal*4),0x24726563);
    // Changing a grouped shape kind without its matching list entry must fail.
    assert.throws(()=>call(85,Buffer.concat([w(v),prefix,original.subarray(target.offset)])),/GroupChildIdentityMismatch/);
    prefix.writeUInt32LE(0x24617263,start+2+ordinal*4);
  }
  const make = p => Buffer.concat([prefix, w(81 | (original.readUInt32LE(target.offset) & 0xffc00) | p.length << 20), p, original.subarray(target.end)]);
  const cap = w(64 * 1024 * 1024), input = bytes => decodedDocumentInput(h, doc, [{index: 0, bytes}]);
  const fullInput = bytes => Buffer.concat([cap, Buffer.from(cfb.write({nodes: nodes.map(n => n.parent === body && n.name === 'Section0' ? {...n, content: h.readUInt32LE(36) & 1 ? deflateRawSync(bytes) : bytes} : n)}))]);
  let rejected = 0, unselected = 0, ordering = 0;
  for (const mode of [0, 1, 2]) {
    const minimum = mode === 1 ? 25 : 28, p = Buffer.alloc(minimum + 3, 0xff), good = make(p);
    const run = bytes => call(64, Buffer.concat([Buffer.from([mode]), input(bytes)]));
    const full = bytes => call(65, Buffer.concat([Buffer.from([mode]), fullInput(bytes)]));
    const report = run(good), container = full(good), expected = arcOwnerActual(call, v, good, mode);
    assert.deepEqual(container.subarray(0, report.length), report);
    expected.forEach((n, i) => assert.equal(report.readUInt32LE(sectionFieldOffset(0, 'arcs', i)), n));
    if (mode === 2) {
      assert.deepEqual(call(24, input(good)), report);
      assert.deepEqual(call(25, fullInput(good)), container);
    }
    const reject = (bytes, error) => {
      assert.throws(() => arcOwnerRun(call, v, bytes, mode), error); rejected++;
      assert.throws(() => run(bytes), error); rejected++;
      assert.throws(() => full(bytes), error); rejected++;
      assert.deepEqual(run(good), report); assert.deepEqual(full(good), container);
    };
    const start = target.offset, end = start + 4 + p.length;
    reject(Buffer.concat([good.subarray(0, start), good.subarray(end)]), /MissingArc/);
    reject(Buffer.concat([good.subarray(0, end), good.subarray(start, end), good.subarray(end)]), /DuplicateArc/);
    reject(Buffer.concat([good, w(81 | p.length << 20), p]), /OrphanArc/);
    for (let n = 0; n < minimum; n++) {
      const short = make(p.subarray(0, n));
      if (mode !== 2) reject(short, /UnexpectedEnd/);
      else {
        const deferred = run(short); assert.equal(deferred.readUInt32LE(sectionFieldOffset(0, 'arcs', 1)), 0);
        assert.equal(deferred.readUInt32LE(sectionFieldOffset(0, 'arcs', 3)), n);
        assert.deepEqual(full(short).subarray(0, deferred.length), deferred); unselected++;
      }
    }
    const info = Buffer.from(doc), properties = documentRecords(info).find(r => r.tag === 16); info.writeUInt16LE(2, properties.start);
    const pair = [{index: 0, bytes: good}, {index: 1, bytes: make(Buffer.alloc(p.length + 1, 0xff))}];
    const ordered = parts => call(64, Buffer.concat([Buffer.from([mode]), decodedDocumentInput(h, info, parts)]));
    const canonical = ordered(pair); assert.deepEqual(ordered([...pair].reverse()), canonical);
    const field = mode === 2 ? 3 : 4, base = mode === 2 ? p.length : 3;
    assert.equal(canonical.readUInt32LE(sectionFieldOffset(0, 'arcs', field)), base);
    assert.equal(canonical.readUInt32LE(sectionFieldOffset(1, 'arcs', field)), base + 1); ordering++;
  }
  const shared = make(Buffer.alloc(28));
  for (const mode of [0, 1]) {
    const result = call(64, Buffer.concat([Buffer.from([mode]), input(shared)]));
    assert.equal(result.readUInt32LE(sectionFieldOffset(0, 'arcs', 4)), mode === 0 ? 0 : 3);
  }
  for (const mode of [3, 255]) for (const probe of [64, 65]) {
    assert.throws(() => call(probe, Buffer.from([mode])), /InvalidMode/); rejected++;
    call(64, Buffer.concat([Buffer.from([0]), input(shared)]));
  }
  return {syntheticLayouts: 2, actualArcFixtures: 0, rejected, unselected, ordering};
}
