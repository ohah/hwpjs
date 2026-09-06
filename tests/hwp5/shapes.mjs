import assert from "node:assert/strict";
import { checkDocinfo } from "./docinfo.mjs";
const version = 0x05010001;
function word(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function frame(tag, b, level = 1) {
  return Buffer.concat([word(tag | (level << 10) | (b.length << 20)), b]);
}
function input(tag, b, v = version, level = 1) {
  return Buffer.concat([word(v), frame(tag, b, level)]);
}
function border(flags, count = 3) {
  const head = Buffer.alloc(32);
  for (let i = 0; i < 5; i++) {
    head[2 + i * 6] = i + 1;
    head[3 + i * 6] = i + 8;
    head.writeUInt32LE(0x12340000 + i, 4 + i * 6);
  }
  const parts = [head, word(flags)];
  if (flags & 1) parts.push(word(0x12345678), word(0xaabbccdd), word(-1));
  if (flags & 4) {
    parts.push(
      Buffer.from([4]),
      word(90),
      word(20),
      word(30),
      word(40),
      word(count),
    );
    if (count > 2) for (let i = 0; i < count; i++) parts.push(word(i * 50));
    for (let i = 0; i < count; i++) parts.push(word(0xabcdef00 + i));
  }
  if (flags & 2) parts.push(Buffer.from([5, 246, 20, 3, 0x34, 0x12]));
  parts.push(word(flags & 4 ? 1 : 0));
  if (flags & 4) parts.push(Buffer.from([50]));
  return Buffer.concat(parts);
}
export function shapeEdges(call) {
  for (const flags of [0, 1, 2, 3, 4, 5, 6, 7])
    for (const count of [0, 1, 2, 3]) {
      const b = border(flags, count);
      checkDocinfo(call, version, frame(20, b));
      checkDocinfo(
        call,
        version,
        frame(20, Buffer.concat([b, Buffer.from([0xee, 0xff])])),
      );
      for (let n = 0; n < b.length; n++)
        assert.throws(
          () => call(4, input(20, b.subarray(0, n))),
          /^Error: UnexpectedEnd$/,
        );
    }
  for (const v of [
    0x05000106,
    0x05000107,
    0x05000200,
    0x05000201,
    0x05000204,
    0x05000205,
    0x05000300,
    version,
  ]) {
    for (let n = 0; n <= 80; n++) {
      const valid =
        n >= 68 &&
        (v < 0x05000201 ||
          n === 68 ||
          (n >= 70 && (v < 0x05000300 || n === 70 || n >= 74)));
      const b = Buffer.alloc(n);
      if (valid) checkDocinfo(call, v, frame(21, b));
      else assert.throws(() => call(4, input(21, b, v)), /UnexpectedEnd/);
    }
    for (let n = 0; n <= 64; n++) {
      const valid =
        n >= 42 &&
        (v < 0x05000107 ||
          n === 42 ||
          (n >= 46 &&
            (v < 0x05000205 ||
              n === 46 ||
              (n >= 54 && (v < 0x05010000 || n === 54 || n >= 58)))));
      const b = Buffer.alloc(n);
      if (valid) checkDocinfo(call, v, frame(25, b));
      else assert.throws(() => call(4, input(25, b, v)), /UnexpectedEnd/);
    }
  }
  const unknown = Buffer.concat([
    Buffer.alloc(32),
    word(0x80000007),
    Buffer.from([255]),
  ]);
  checkDocinfo(call, version, frame(20, unknown));
  const huge = border(4);
  huge.writeUInt32LE(0xffffffff, 53);
  assert.throws(() => call(4, input(20, huge)), /UnexpectedEnd/);
  const oversized = border(0);
  oversized.writeUInt32LE(0xffffffff, 36);
  assert.throws(() => call(4, input(20, oversized)), /UnexpectedEnd/);
  // Nonzero signed/language fields ensure roundtrip isn't tested only on zeroes.
  const char = Buffer.from(
    Array.from({ length: 74 }, (_, i) => (i * 13 + 128) & 255),
  );
  const para = Buffer.from(
    Array.from({ length: 58 }, (_, i) => (i * 17 + 128) & 255),
  );
  for (const [tag, b] of [
    [20, border(7)],
    [21, char],
    [25, para],
  ]) {
    assert.throws(
      () => call(4, input(tag, b, version, 0)),
      /InvalidDocInfoLevel/,
    );
    checkDocinfo(call, version, frame(tag, b));
  }
}
export function shapeMutations(call) {
  const cases = [
    ...Array.from({ length: 8 }, (_, flags) => [20, border(flags)]),
    [21, Buffer.alloc(74)],
    [25, Buffer.alloc(58)],
  ];
  let mutations = 0,
    accepted = 0,
    rejected = 0;
  for (const [tag, original] of cases) {
    const coverage = Buffer.alloc(original.length);
    for (let offset = 0; offset < original.length; offset++)
      for (let bit = 0; bit < 8; bit++) {
        const b = Buffer.from(original);
        b[offset] ^= 1 << bit;
        let error;
        try {
          call(4, input(tag, b));
        } catch (e) {
          error = e;
        }
        if (error) {
          assert.equal(error.message, "UnexpectedEnd");
          rejected++;
        } else {
          checkDocinfo(call, version, frame(tag, b));
          accepted++;
        }
        checkDocinfo(call, version, frame(tag, original));
        coverage[offset] |= 1 << bit;
        mutations++;
      }
    assert.deepEqual(coverage, Buffer.alloc(original.length, 255));
  }
  assert.equal(
    mutations,
    cases.reduce((n, [, b]) => n + b.length * 8, 0),
  );
  return {
    cases: cases.length,
    mutations,
    accepted,
    rejected,
    recoveries: mutations,
  };
}
