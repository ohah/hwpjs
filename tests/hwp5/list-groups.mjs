import assert from "node:assert/strict";
const word = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
const version = 0x05000307;
const frame = (tag, level, b = Buffer.alloc(0)) =>
  Buffer.concat([word(tag | (level << 10) | (b.length << 20)), b]);
export function listsActual(call, v, bytes) {
  const nodes = [];
  for (let p = 0; p < bytes.length; ) {
    const bits = bytes.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(p);
      p += 4;
    }
    const level = (bits >>> 10) & 1023;
    let parent = nodes.length - 1;
    while (parent >= 0 && nodes[parent].level >= level) parent--;
    nodes.push({
      level,
      parent,
      tag: bits & 1023,
      raw: bytes.subarray(p, p + n),
    });
    p += n;
  }
  const rows = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.tag !== 72) continue;
    assert.ok(node.parent >= 0);
    let begin = i + 1;
    while (begin < nodes.length && nodes[begin].level > node.level) begin++;
    let end = begin,
      count = 0,
      intervening = 0;
    for (; end < nodes.length; end++) {
      const next = nodes[end];
      if (
        next.level < node.level ||
        (next.parent === node.parent && next.tag === 72)
      )
        break;
      if (next.parent === node.parent) {
        if (next.tag === 66) count++;
        else intervening++;
      }
    }
    assert.equal(node.raw.readUInt16LE(), count);
    rows.push([i, node.parent, begin, end, count, intervening]);
  }
  rows.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  assert.deepEqual(
    call(15, Buffer.concat([word(v), bytes])),
    Buffer.concat(rows.flatMap((r) => r.map(word))),
  );
  return [
    rows.length,
    rows.reduce((n, r) => n + r[4], 0),
    rows.reduce((n, r) => n + r[5], 0),
  ];
}
export function listEdges(call) {
  const h = frame(66, 0, Buffer.alloc(24)),
    ctrl = frame(71, 1, word(0x74626c20));
  const list = (count, level = 2) => {
    const b = Buffer.alloc(8);
    b.writeUInt16LE(count);
    return frame(72, level, b);
  };
  const para = frame(66, 2, Buffer.alloc(24));
  const good = Buffer.concat([h, ctrl, list(1), frame(900, 2), para, list(0)]);
  assert.deepEqual(listsActual(call, version, good), [2, 1, 1]);
  const run = (b) => call(15, Buffer.concat([word(version), b]));
  for (const [bytes, error] of [
    [list(0, 0), /OrphanListHeader/],
    [Buffer.concat([h, ctrl, para]), /OrphanListParagraph/],
    [Buffer.concat([h, ctrl, list(0), para]), /ListParagraphCountMismatch/],
    [Buffer.concat([h, ctrl, list(1)]), /ListParagraphCountMismatch/],
    [
      Buffer.concat([h, ctrl, list(1), frame(66, 3, Buffer.alloc(24))]),
      /ListParagraphCountMismatch|OrphanListParagraph/,
    ],
    [
      Buffer.concat([h, ctrl, list(1), list(1), para]),
      /ListParagraphCountMismatch/,
    ],
  ]) {
    assert.throws(() => run(bytes), error);
    listsActual(call, version, good);
  }
  for (let bit = 0; bit < 16; bit++) {
    assert.throws(
      () => run(Buffer.concat([h, ctrl, list(1 ^ (1 << bit)), para])),
      /ListParagraphCountMismatch/,
    );
    listsActual(call, version, good);
  }
  // Intervening unknown record contains a separate nested list; no flattening.
  const nested = Buffer.concat([
    h,
    ctrl,
    list(1),
    frame(76, 2),
    list(1, 3),
    frame(66, 3, Buffer.alloc(24)),
    para,
  ]);
  assert.deepEqual(listsActual(call, version, nested), [2, 2, 1]);
  assert.deepEqual(listsActual(call, version, Buffer.alloc(0)), [0, 0, 0]);
  assert.deepEqual(listsActual(call, version, h), [0, 0, 0]);
  return { countMutations: 16, recoveries: 16 };
}
