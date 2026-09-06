import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const frame = (tag, level, p = Buffer.alloc(0)) => Buffer.concat([w(tag | (level << 10) | (p.length << 20)), p]);
export const noteRun = (call, v, b, mode = 1, listMode = 1) => call(43, Buffer.concat([w(v), Buffer.from([mode, listMode]), b]));
export function noteActual(call, v, b, mode = 2, listMode = 1) {
  const stats = Array(7).fill(0), stack = [], nodes = [];
  for (const r of documentRecords(b)) {
    const level = (b.readUInt32LE(r.offset) >>> 10) & 1023;
    stack.length = level;
    const node = { ...r, parent: level ? stack[level - 1] : null, index: nodes.length };
    nodes.push(node); stack.push(node.index);
  }
  for (const node of nodes) {
    if (node.tag !== 71) continue;
    const id = b.readUInt32LE(node.start);
    if (![0x666e2020, 0x656e2020].includes(id)) continue;
    stats[id === 0x666e2020 ? 0 : 1]++;
    stats[4] += mode === 0;
    const extra = node.end - node.start - 4 - [8, 16, 12][mode];
    assert.ok(extra >= 0); stats[5] += extra;
    let declared = null, count = 0, owned = 0;
    const flush = () => { if (declared !== null) assert.equal(count, declared); };
    for (const child of nodes.filter(n => n.parent === node.index)) {
      if (child.tag === 72) {
        flush(); declared = b.readUInt16LE(child.start); count = 0; owned++;
        stats[2]++; stats[6] += child.end - child.start - (listMode ? 8 : 6);
      } else if (child.tag === 66) {
        assert.notEqual(declared, null); count++; stats[3]++;
      }
    }
    flush(); assert.ok(owned > 0);
  }
  assert.deepEqual(noteRun(call, v, b, mode, listMode), Buffer.concat(stats.map(w)));
  return stats;
}
export function noteValidationEdges(call) {
  const v = 0x05000300;
  const ctrl = (id = 0x666e2020, level = 0, len = 16) => frame(71, level, Buffer.concat([w(id), Buffer.alloc(len, 255)]));
  const list = (count = 0, level = 1, width = 8) => { const p = Buffer.alloc(width); p.writeUInt16LE(count); return frame(72, level, p); };
  const para = (level = 1) => frame(66, level, Buffer.alloc(22));
  const good = Buffer.concat([ctrl(), list(1), para()]);
  let accepted = 0, rejected = 0;
  const check = (b, mode = 1, lm = 1) => { accepted++; return noteActual(call, v, b, mode, lm); };
  const reject = (b, e, mode = 1, lm = 1) => { assert.throws(() => noteRun(call, v, b, mode, lm), e); rejected++; check(good); };
  for (const mode of [0, 1, 2]) for (const lm of [0, 1]) {
    const width = [8, 16, 12][mode], lw = lm ? 8 : 6;
    check(Buffer.concat([ctrl(0x656e2020, 0, width + 1), list(1, 1, lw + 8), frame(900, 1), para(), list(0, 1, lw)]), mode, lm);
    for (let n = 0; n < width; n++) reject(Buffer.concat([ctrl(0x666e2020, 0, n), list(0, 1, lw)]), /UnexpectedEnd/, mode, lm);
    for (let n = 0; n < lw; n++) reject(Buffer.concat([ctrl(0x666e2020, 0, width), frame(72, 1, Buffer.alloc(n))]), /UnexpectedEnd/, mode, lm);
  }
  reject(ctrl(), /MissingNoteList/);
  reject(Buffer.concat([ctrl(), list(2), para()]), /ListParagraphCountMismatch/);
  reject(Buffer.concat([ctrl(), para()]), /OrphanListParagraph/);
  reject(Buffer.concat([ctrl(), ctrl(0x12345678, 1), list(0, 2)]), /MissingNoteList/);
  reject(Buffer.concat([ctrl(0x12345678), list(), ctrl()]), /MissingNoteList/);
  check(Buffer.concat([ctrl(0x12345678), list(), good, ctrl(0x656e2020), list()]));
  check(Buffer.concat([good, ctrl(0x656e2020, 2), list(0, 3)]));
  check(ctrl(0x666f6f74, 0, 0));
  return { accepted, rejected };
}
