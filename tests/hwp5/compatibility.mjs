import assert from "node:assert/strict";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const frame = (tag, level, b, extended = false) =>
  Buffer.concat([
    w((tag | (level << 10) | ((extended ? 4095 : b.length) << 20)) >>> 0),
    ...(extended ? [w(b.length)] : []),
    b,
  ]);
export function compatibilityEdges(call) {
  let accepted = 0,
    rejected = 0;
  const version = w(0x05000107);
  const run = (b) => call(4, Buffer.concat([version, b]));
  const check = (tag, b, extended = false) => {
    const r = frame(tag, tag === 30 ? 0 : 1, b, extended);
    assert.deepEqual(run(r), Buffer.concat([w(tag), w(r.length), r]));
    accepted++;
  };
  for (const tag of [30, 31]) {
    const size = tag === 30 ? 4 : 20;
    const good = Buffer.concat(
      Array.from({ length: size / 4 }, (_, i) =>
        w([0xffffffff, 0x80000000, 0x12345678, 0, 1][i]),
      ),
    );
    for (const extended of [false, true]) {
      check(tag, good, extended);
      check(tag, Buffer.concat([good, Buffer.from([7, 0, 9])]), extended);
      for (let n = 0; n < size; n++) {
        assert.throws(
          () =>
            run(frame(tag, tag === 30 ? 0 : 1, good.subarray(0, n), extended)),
          /UnexpectedEnd/,
        );
        rejected++;
        check(tag, good);
      }
    }
    for (const level of [0, 1, 2, 1023])
      if (level !== (tag === 30 ? 0 : 1)) {
        assert.throws(
          () => run(frame(tag, level, good)),
          /InvalidDocInfoLevel/,
        );
        rejected++;
      }
    for (let field = 0; field < size / 4; field++)
      for (let bit = 0; bit < 32; bit++) {
        const b = Buffer.alloc(size);
        b.writeUInt32LE((1 << bit) >>> 0, field * 4);
        check(tag, b);
      }
  }
  for (const n of [0, 1, 2, 3, 0x80000000, 0xffffffff]) check(30, w(n));
  return { accepted, rejected };
}
