import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
import { polygonBytes } from "./shape-polygon.mjs";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
export const curveOwnerRun = (call, v, b, mode = 1) => call(71, Buffer.concat([w(v), Buffer.from([mode]), b]));
export function curveOwnerActual(call, v, b, mode = 1) {
  const nodes = [], stack = [], stats = [0, 0, 0, 0, 0, 0];
  for (const r of documentRecords(b)) {
    const level = b.readUInt32LE(r.offset) >>> 10 & 1023; stack.length = level;
    nodes.push({...r, parent: level ? stack[level - 1] : null}); stack.push(nodes.length - 1);
  }
  const owner = n => n?.tag === 76 && b.readUInt32LE(n.start) === 0x24637572;
  for (const [i, n] of nodes.entries()) {
    if (n.tag === 83) { assert.notEqual(n.parent, null); assert.ok(owner(nodes[n.parent])); }
    if (!owner(n)) continue;
    const children = nodes.filter(c => c.parent === i && c.tag === 83); assert.equal(children.length, 1);
    const c = children[0], width = mode ? 4 : 2;
    assert.ok(c.end - c.start >= width);
    const count = mode ? b.readInt32LE(c.start) : b.readInt16LE(c.start), segments = Math.max(0, count - 1);
    const start = c.start + width + count * 8, end = start + segments;
    assert.ok(count >= 0 && end <= c.end);
    stats[0]++; stats[1] += count; stats[2] += segments; stats[3] += Number(count < 2); stats[5] += c.end - end;
    for (const value of b.subarray(start, end)) stats[4] += Number(value > 1);
  }
  assert.deepEqual(curveOwnerRun(call, v, b, mode), Buffer.concat(stats.map(w))); return stats;
}
export function curveOwnerEdges(call) {
  const v = 0x05010001, frame = (tag, level, p = Buffer.alloc(0)) => Buffer.concat([w(tag | level << 10 | p.length << 20), p]);
  const owner = (id = 0x24637572, level = 0) => frame(76, level, w(id)); let accepted = 0, rejected = 0;
  for (const mode of [0, 1]) {
    const raw = polygonBytes([[1, -2], [3, 4], [-5, 6]], mode, Buffer.from([0, 1])), p = frame(83, 1, raw), good = Buffer.concat([owner(), p]);
    const check = b => { accepted++; return curveOwnerActual(call, v, b, mode); };
    const reject = (b, error) => { assert.throws(() => curveOwnerRun(call, v, b, mode), error); rejected++; check(good); };
    check(good); reject(owner(), /MissingCurve/); reject(frame(83, 0, raw), /OrphanCurve/);
    reject(Buffer.concat([owner(0x24706f6c), p]), /OrphanCurve/);
    reject(Buffer.concat([good, frame(900, 1), p]), /DuplicateCurve/);
    reject(Buffer.concat([owner(), owner(0x24636f6e, 1), frame(83, 2, raw)]), /MissingCurve/);
    reject(Buffer.concat([good, owner()]), /MissingCurve/);
    reject(Buffer.concat([good, frame(900, 0), p]), /OrphanCurve/);
    check(Buffer.concat([owner(), frame(900, 1), frame(901, 2), p])); check(Buffer.concat([good, good]));
    for (let n = 0; n < raw.length; n++) reject(Buffer.concat([owner(), frame(83, 1, raw.subarray(0, n))]), /UnexpectedEnd/);
    for (const n of [-1, mode ? 2147483647 : 32767]) {
      const bad = Buffer.from(raw); if (mode) bad.writeInt32LE(n); else bad.writeInt16LE(n);
      reject(Buffer.concat([owner(), frame(83, 1, bad)]), n < 0 ? /NegativePointCount/ : /UnexpectedEnd/);
    }
    for (const n of [0, 1, 2, 3]) {
      const segments = Math.max(0, n - 1), b = polygonBytes(Array.from({length: n}, () => [0, 0]), mode, Buffer.concat([Buffer.alloc(segments, 255), Buffer.alloc(4, 128)]));
      assert.deepEqual(check(Buffer.concat([owner(), frame(83, 1, b)])), [1, n, segments, Number(n < 2), segments, 4]);
    }
  }
  assert.throws(() => curveOwnerRun(call, v, Buffer.alloc(0), 2), /InvalidMode/); rejected++;
  return {accepted, rejected};
}
