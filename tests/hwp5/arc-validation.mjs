import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
export const arcOwnerRun = (call, v, b, mode = 2) => call(63, Buffer.concat([w(v), Buffer.from([mode]), b]));
export function arcOwnerActual(call, v, b, mode = 2) {
  const nodes = [], stack = [], stats = [0, 0, 0, 0, 0];
  for (const r of documentRecords(b)) {
    const level = b.readUInt32LE(r.offset) >>> 10 & 1023; stack.length = level;
    nodes.push({...r, parent: level ? stack[level - 1] : null}); stack.push(nodes.length - 1);
  }
  const owner = n => n?.tag === 76 && b.readUInt32LE(n.start) === 0x24617263;
  for (const [i, n] of nodes.entries()) {
    if (n.tag === 81) { assert.notEqual(n.parent, null); assert.ok(owner(nodes[n.parent])); }
    if (!owner(n)) continue;
    const children = nodes.filter(c => c.parent === i && c.tag === 81); assert.equal(children.length, 1);
    const length = children[0].end - children[0].start; stats[0]++;
    if (mode === 2) { stats[2]++; stats[3] += length; }
    else { const minimum = mode ? 25 : 28; assert.ok(length >= minimum); stats[1]++; stats[4] += length - minimum; }
  }
  assert.equal(stats[0], stats[1] + stats[2]);
  assert.deepEqual(arcOwnerRun(call, v, b, mode), Buffer.concat(stats.map(w))); return stats;
}
export function arcOwnerEdges(call) {
  const v = 0x05010001, frame = (tag, level, p = Buffer.alloc(0)) => Buffer.concat([w(tag | level << 10 | p.length << 20), p]);
  const owner = (id = 0x24617263, level = 0) => frame(76, level, w(id));
  let accepted = 0, rejected = 0;
  for (const mode of [0, 1, 2]) {
    const minimum = mode === 0 ? 28 : 25, payload = frame(81, 1, Buffer.alloc(minimum));
    const good = Buffer.concat([owner(), payload]);
    const check = b => { accepted++; return arcOwnerActual(call, v, b, mode); };
    const reject = (b, e) => { assert.throws(() => arcOwnerRun(call, v, b, mode), e); rejected++; check(good); };
    check(good);
    reject(owner(), /MissingArc/); reject(frame(81, 0), /OrphanArc/);
    reject(Buffer.concat([owner(0x24656c6c), payload]), /OrphanArc/);
    reject(Buffer.concat([good, frame(900, 1), payload]), /DuplicateArc/);
    reject(Buffer.concat([owner(), owner(0x24636f6e, 1), frame(81, 2)]), /MissingArc/);
    reject(Buffer.concat([good, owner()]), /MissingArc/);
    reject(Buffer.concat([good, frame(900, 0), payload]), /OrphanArc/);
    check(Buffer.concat([owner(), frame(900, 1), frame(901, 2), payload]));
    check(Buffer.concat([good, good]));
    for (let n = 0; n < minimum; n++) {
      const short = Buffer.concat([owner(), frame(81, 1, Buffer.alloc(n))]);
      if (mode === 2) assert.deepEqual(check(short), [1, 0, 1, n, 0]);
      else reject(short, /UnexpectedEnd/);
    }
    const extra = Buffer.concat([owner(), frame(81, 1, Buffer.alloc(minimum + 3))]); check(extra);
  }
  assert.throws(() => arcOwnerRun(call, v, Buffer.alloc(0), 3), /InvalidMode/); rejected++;
  return {accepted, rejected};
}
