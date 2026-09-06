import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const frame = (tag, level, p = Buffer.alloc(0)) =>
  Buffer.concat([w(tag | (level << 10) | (p.length << 20)), p]);
const run = (call, v, b, mode = 1) =>
  call(41, Buffer.concat([w(v), Buffer.from([mode]), b]));
export function hiddenActual(call, v, b, mode = 1) {
  const stats = Array(6).fill(0),
    stack = [],
    nodes = [];
  for (const r of documentRecords(b)) {
    const level = (b.readUInt32LE(r.offset) >>> 10) & 1023;
    stack.length = level;
    const n = {
      ...r,
      parent: level ? stack[level - 1] : null,
      index: nodes.length,
    };
    nodes.push(n);
    stack.push(n.index);
  }
  for (const node of nodes)
    if (node.tag === 71 && b.readUInt32LE(node.start) === 0x74636d74) {
      stats[0]++;
      stats[3] += node.end - node.start - 4;
      let declared = null,
        count = 0,
        lists = 0;
      const flush = () => {
        if (declared !== null) assert.equal(count, declared);
      };
      for (const child of nodes.filter((n) => n.parent === node.index)) {
        if (child.tag === 72) {
          flush();
          declared = b.readUInt16LE(child.start);
          count = 0;
          lists++;
          stats[1]++;
          stats[4] += child.end - child.start - (mode ? 8 : 6);
        } else if (child.tag === 66) {
          assert.notEqual(declared, null);
          count++;
          stats[2]++;
        } else if (declared !== null) stats[5]++;
      }
      flush();
      assert.ok(lists > 0);
    }
  assert.deepEqual(run(call, v, b, mode), Buffer.concat(stats.map(w)));
  return stats;
}
export function hiddenEdges(call) {
  const v = 0x05000107;
  let accepted = 0,
    rejected = 0;
  const ctrl = (id = 0x74636d74, level = 0, tail = Buffer.alloc(0)) =>
    frame(71, level, Buffer.concat([w(id), tail]));
  const list = (count, mode = 1, level = 1, tail = Buffer.alloc(0)) => {
    const p = Buffer.alloc(mode ? 8 : 6, 255);
    p.writeUInt16LE(count);
    return frame(72, level, Buffer.concat([p, tail]));
  };
  const para = (level) => frame(66, level, Buffer.alloc(22));
  const good = Buffer.concat([ctrl(), list(1), para(1)]);
  const check = (b, mode = 1) => {
    accepted++;
    return hiddenActual(call, v, b, mode);
  };
  const reject = (b, error, mode = 1) => {
    assert.throws(() => run(call, v, b, mode), error);
    rejected++;
    check(good);
  };
  for (const mode of [0, 1]) {
    check(Buffer.concat([ctrl(), list(0, mode)]), mode);
    check(
      Buffer.concat([
        ctrl(0x74636d74, 0, Buffer.from([9])),
        list(1, mode, 1, Buffer.from([1, 2, 3])),
        frame(900, 1),
        para(1),
        list(0, mode),
      ]),
      mode,
    );
    for (let n = 0; n < (mode ? 8 : 6); n++)
      reject(
        Buffer.concat([ctrl(), frame(72, 1, Buffer.alloc(n))]),
        /UnexpectedEnd/,
        mode,
      );
  }
  reject(ctrl(), /MissingHiddenCommentList/);
  reject(
    Buffer.concat([ctrl(), list(2), para(1)]),
    /ListParagraphCountMismatch/,
  );
  reject(Buffer.concat([ctrl(), para(1)]), /OrphanListParagraph/);
  reject(
    Buffer.concat([ctrl(), ctrl(0x12345678, 1), list(0, 1, 2)]),
    /MissingHiddenCommentList/,
  );
  reject(
    Buffer.concat([ctrl(0x12345678), list(0), ctrl()]),
    /MissingHiddenCommentList/,
  );
  check(Buffer.concat([ctrl(0x12345678), list(0), good, ctrl(), list(0)]));
  check(
    Buffer.concat([
      ctrl(),
      list(1),
      para(1),
      ctrl(0x74636d74, 2),
      list(0, 1, 3),
    ]),
  );
  check(ctrl(0x68696465));
  return { accepted, rejected };
}
