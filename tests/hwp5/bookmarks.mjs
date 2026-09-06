import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const u = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const frame = (tag, level, b) =>
  Buffer.concat([
    w(tag | (level << 10) | (Math.min(b.length, 4095) << 20)),
    ...(b.length >= 4095 ? [w(b.length)] : []),
    b,
  ]);
const item = (id, type, b) => Buffer.concat([u(id), u(type), b]);
const set = (items, id = 0x021b) =>
  Buffer.concat([u(id), u(items.length), u(0), ...items]);
const name = (b) => item(0x4000, 1, Buffer.concat([u(b.length / 2), b]));
const ctrl = (id = 0x626f6b6d, level = 0) => frame(71, level, w(id));
const run = (call, v, b) => {
  const out = call(36, Buffer.concat([w(v), b]));
  assert.equal(out.length, 32);
  return Array.from({ length: 8 }, (_, i) => out.readUInt32LE(i * 4));
};
// Independent hierarchy and ParameterSet traversal. No fixed name offset.
export function bookmarkExpected(b) {
  const stats = Array(8).fill(0),
    stack = [];
  for (const r of documentRecords(b)) {
    const level = (b.readUInt32LE(r.offset) >>> 10) & 1023;
    stack.length = level;
    const p = b.subarray(r.start, r.end);
    const isBook = r.tag === 71 && p.readUInt32LE() === 0x626f6b6d;
    if (isBook) {
      stats[0]++;
      stats[7] += p.length - 4;
    }
    if (r.tag === 87 && stack[level - 1] === true) {
      stats[1]++;
      let o = 0,
        rootId,
        names = [];
      const word = () => {
        const n = p.readUInt16LE(o);
        o += 2;
        return n;
      };
      function value(type, depth, id) {
        if (type === 0x8000) {
          const sid = word(),
            count = word();
          word();
          if (depth === 0) rootId = sid;
          for (let i = 0; i < count; i++) {
            const itemId = word();
            value(word(), depth + 1, itemId);
          }
        } else if (type === 1) {
          const size = word() * 2;
          if (o + size > p.length) throw Error("UnexpectedEnd");
          if (depth === 1 && id === 0x4000) names.push(p.subarray(o, o + size));
          o += size;
        } else if (type >= 2 && type <= 9) {
          o += 4;
        } else if (type === 0) {
        } else if (type === 0x8002) {
          o += 2;
        } else throw Error("UnsupportedParameterType");
        if (o > p.length) throw Error("UnexpectedEnd");
      }
      try {
        value(0x8000, 0, null);
        if (rootId !== 0x021b) stats[5]++;
        else if (names.length) {
          assert.equal(names.length, 1);
          stats[2]++;
          stats[3] += names[0].length / 2;
        } else stats[4]++;
      } catch (e) {
        if (e.message !== "UnsupportedParameterType") throw e;
        stats[6]++;
      }
    }
    stack.push(isBook);
  }
  return stats;
}
export function bookmarkActual(call, v, b) {
  const want = bookmarkExpected(b);
  assert.deepEqual(run(call, v, b), want);
  return want;
}
export function bookmarkEdges(call) {
  const v = 0x05010001,
    good = set([name(Buffer.from([0, 0, 0, 216, 255, 254]))]);
  const wrap = (p) => Buffer.concat([ctrl(), frame(87, 1, p)]);
  let accepted = 0,
    rejected = 0;
  const check = (b) => {
    accepted++;
    return bookmarkActual(call, v, b);
  };
  for (let n = 0; n < good.length; n++) {
    assert.throws(
      () => run(call, v, wrap(good.subarray(0, n))),
      /UnexpectedEnd/,
    );
    rejected++;
    check(wrap(good));
  }
  assert.deepEqual(check(wrap(good)), [1, 1, 1, 3, 0, 0, 0, 0]);
  for (const units of [1, 32768, 65535]) {
    const payload = set([name(Buffer.alloc(units * 2, 255))]);
    assert.equal(check(wrap(payload))[3], units);
    assert.throws(
      () => run(call, v, wrap(payload.subarray(0, payload.length - 1))),
      /UnexpectedEnd/,
    );
    rejected++;
    check(wrap(good));
  }
  assert.deepEqual(
    check(wrap(set([name(Buffer.alloc(0))]))),
    [1, 1, 1, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(check(wrap(set([]))), [1, 1, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(check(wrap(set([], 99))), [1, 1, 0, 0, 0, 1, 0, 0]);
  check(wrap(Buffer.concat([good, Buffer.from([7, 8, 9])])));
  // A nested same-ID string is not the root name; order and other items vary.
  check(
    wrap(
      set([
        item(8, 0x8000, good),
        item(9, 2, w(123)),
        name(Buffer.from("ab", "utf16le")),
      ]),
    ),
  );
  assert.equal(check(wrap(set([item(8, 0x8000, good)])))[4], 1);
  for (const b of [
    set([name(Buffer.alloc(0)), name(Buffer.alloc(0))]),
    set([item(0x4000, 2, w(0))]),
  ]) {
    assert.throws(
      () => run(call, v, wrap(b)),
      /DuplicateNamedFieldName|InvalidNamedFieldType/,
    );
    rejected++;
    check(wrap(good));
  }
  assert.equal(check(wrap(set([item(1, 0x7777, Buffer.from([1, 2]))])))[6], 1);
  assert.deepEqual(check(ctrl()), [1, 0, 0, 0, 0, 0, 0, 0]);
  // Sibling, wrong alias, and descendant under a different control cannot donate names.
  for (const b of [
    Buffer.concat([ctrl(), frame(87, 0, good)]),
    Buffer.concat([ctrl(0x626b6d6b), frame(87, 1, good)]),
    Buffer.concat([ctrl(), ctrl(0x6964786d, 1), frame(87, 2, good)]),
  ])
    assert.equal(check(b)[1], 0);
  check(Buffer.concat([wrap(good), ctrl(), frame(87, 1, set([]))]));
  return { accepted, rejected };
}
