import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
import { polygonBytes } from "./shape-polygon.mjs";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
export const polygonOwnerRun = (call, v, b, mode = 1) => call(67, Buffer.concat([w(v), Buffer.from([mode]), b]));
export function polygonOwnerActual(call, v, b, mode = 1) {
  const nodes = [], stack = [], stats = [0, 0, 0, 0];
  for (const r of documentRecords(b)) {
    const level = b.readUInt32LE(r.offset) >>> 10 & 1023; stack.length = level;
    nodes.push({...r, parent: level ? stack[level - 1] : null}); stack.push(nodes.length - 1);
  }
  const owner = n => n?.tag === 76 && b.readUInt32LE(n.start) === 0x24706f6c;
  for (const [i, n] of nodes.entries()) {
    if (n.tag === 82) { assert.notEqual(n.parent, null); assert.ok(owner(nodes[n.parent])); }
    if (!owner(n)) continue;
    const children = nodes.filter(c => c.parent === i && c.tag === 82); assert.equal(children.length, 1);
    const c = children[0], size = mode ? 4 : 2; assert.ok(c.end - c.start >= size);
    const count = mode ? b.readInt32LE(c.start) : b.readInt16LE(c.start); assert.ok(count >= 0 && count <= Math.floor((c.end - c.start - size) / 8));
    stats[0]++; stats[1] += count; stats[2] += Number(count < 3); stats[3] += c.end - c.start - size - count * 8;
  }
  assert.deepEqual(polygonOwnerRun(call, v, b, mode), Buffer.concat(stats.map(w))); return stats;
}
export function polygonOwnerEdges(call) {
  const v = 0x05010001, frame = (tag, level, p = Buffer.alloc(0)) => Buffer.concat([w(tag | level << 10 | p.length << 20), p]);
  const owner = (id = 0x24706f6c, level = 0) => frame(76, level, w(id)); let accepted = 0, rejected = 0;
  for (const mode of [0, 1]) {
    const raw = polygonBytes([[1, -2], [3, 4], [-5, 6]], mode), p = frame(82, 1, raw), good = Buffer.concat([owner(), p]);
    const check = b => { accepted++; return polygonOwnerActual(call, v, b, mode); };
    const reject = (b, error) => { assert.throws(() => polygonOwnerRun(call, v, b, mode), error); rejected++; check(good); };
    check(good); reject(owner(), /MissingPolygon/); reject(frame(82, 0, raw), /OrphanPolygon/);
    reject(Buffer.concat([owner(0x24726563), p]), /OrphanPolygon/);
    reject(Buffer.concat([good, frame(900, 1), p]), /DuplicatePolygon/);
    reject(Buffer.concat([owner(), owner(0x24636f6e, 1), frame(82, 2, raw)]), /MissingPolygon/);
    reject(Buffer.concat([good, owner()]), /MissingPolygon/);
    reject(Buffer.concat([good, frame(900, 0), p]), /OrphanPolygon/);
    check(Buffer.concat([owner(), frame(900, 1), frame(901, 2), p])); check(Buffer.concat([good, good]));
    for (let n = 0; n < raw.length; n++) reject(Buffer.concat([owner(), frame(82, 1, raw.subarray(0, n))]), /UnexpectedEnd/);
    for (const n of [-1, mode ? 2147483647 : 32767]) {
      const bad = Buffer.from(raw); if (mode) bad.writeInt32LE(n); else bad.writeInt16LE(n);
      reject(Buffer.concat([owner(), frame(82, 1, bad)]), n < 0 ? /NegativePointCount/ : /UnexpectedEnd/);
    }
    for (const count of [0, 1, 2, 3]) {
      const b = polygonBytes(Array.from({length: count}, () => [0, 0]), mode, Buffer.from([1, 0, 128, 255]));
      assert.deepEqual(check(Buffer.concat([owner(), frame(82, 1, b)])), [1, count, Number(count < 3), 4]);
    }
  }
  assert.throws(() => polygonOwnerRun(call, v, Buffer.alloc(0), 2), /InvalidMode/); rejected++;
  return {accepted, rejected};
}
