import assert from "node:assert/strict";
import { checkBody } from "./body.mjs";
const ids = [0x74626c20, 0x67736f20, 0x65716564];
const word = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const frame = (id, b) => {
  const n = b.length + 4;
  return Buffer.concat([
    word(71 | ((n >= 4095 ? 4095 : n) << 20)),
    ...(n >= 4095 ? [word(n)] : []),
    word(id),
    b,
  ]);
};
export function objectEdges(call) {
  const version = 0x05010001;
  const original = Buffer.alloc(51, 0xa5);
  original.writeUInt16LE(3, 40);
  let mutations = 0,
    rejected = 0;
  for (const id of ids) {
    for (let n = 0; n < 48; n++) {
      const bytes = frame(id, original.subarray(0, n));
      if (n === 40) checkBody(call, version, bytes);
      else
        assert.throws(
          () => call(8, Buffer.concat([word(version), bytes])),
          /UnexpectedEnd/,
        );
    }
    for (const v of [0x05000107, 0x05000300, 0x05010001, 0x05010100]) {
      checkBody(call, v, frame(id, original));
      const empty = Buffer.alloc(42);
      checkBody(call, v, frame(id, empty));
      checkBody(call, v, frame(id, empty.subarray(0, 40)));
    }
    for (let p = 0; p < original.length; p++)
      for (let bit = 0; bit < 8; bit++) {
        const b = Buffer.from(original);
        b[p] ^= 1 << bit;
        const bytes = frame(id, b);
        if (42 + b.readUInt16LE(40) * 2 > b.length) {
          assert.throws(
            () => call(8, Buffer.concat([word(version), bytes])),
            /UnexpectedEnd/,
          );
          rejected++;
        } else checkBody(call, version, bytes);
        checkBody(call, version, frame(id, original));
        mutations++;
      }
    const max = Buffer.alloc(42 + 65535 * 2, 0xff);
    checkBody(call, version, frame(id, max));
    assert.throws(
      () =>
        call(8, Buffer.concat([word(version), frame(id, max.subarray(0, -1))])),
      /UnexpectedEnd/,
    );
  }
  assert.equal(mutations, 1224);
  return { mutations, rejected, recoveries: mutations };
}
// Independent fixture coverage; mode 8 reconstructs every parsed field separately.
export function objectActual(section) {
  const counts = [0, 0, 0, 0, 0, 0, 0]; // table, drawing, equation, absent, empty, text, negative position
  for (let p = 0; p < section.length; ) {
    const bits = section.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = section.readUInt32LE(p);
      p += 4;
    }
    const b = section.subarray(p, p + n);
    p += n;
    if ((bits & 1023) !== 71) continue;
    const kind = ids.indexOf(b.readUInt32LE());
    if (kind < 0) continue;
    counts[kind]++;
    assert.ok(n >= 44);
    if (n === 44) counts[3]++;
    else {
      const length = b.readUInt16LE(44);
      assert.equal(n, 46 + length * 2);
      counts[length === 0 ? 4 : 5]++;
    }
    if (b.readInt32LE(8) < 0 || b.readInt32LE(12) < 0) counts[6]++;
  }
  return counts;
}
