import assert from "node:assert/strict";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
export function numberControlActual(call, bytes) {
  const stats = [0, 0, 0, 0];
  for (let p = 0; p < bytes.length; ) {
    const bits = bytes.readUInt32LE(p);
    p += 4;
    let size = bits >>> 20;
    if (size === 4095) {
      size = bytes.readUInt32LE(p);
      p += 4;
    }
    const b = bytes.subarray(p, p + size);
    p += size;
    if ((bits & 1023) !== 71 || b.length < 4) continue;
    const id = b.readUInt32LE(0),
      isAuto = id === 0x61746e6f;
    if (!isAuto && id !== 0x6e776e6f) continue;
    assert.deepEqual(call(32, b), b);
    stats[isAuto ? 0 : 1]++;
    stats[2] += (b.readUInt32LE(4) & 15) > 5;
    stats[3] += b.length - (isAuto ? 16 : 10);
  }
  return stats;
}
export function numberControlEdges(call) {
  let accepted = 0,
    rejected = 0;
  for (const [id, size] of [
    [0x61746e6f, 12],
    [0x6e776e6f, 6],
  ]) {
    const check = (p) => {
      const b = Buffer.concat([w(id), p]);
      assert.deepEqual(call(32, b), b);
      accepted++;
    };
    const good = Buffer.alloc(size, 255);
    for (let len = 0; len < size; len++) {
      assert.throws(
        () => call(32, Buffer.concat([w(id), good.subarray(0, len)])),
        /UnexpectedEnd/,
      );
      rejected++;
      check(good);
    }
    for (let bit = 0; bit < size * 8; bit++) {
      const b = Buffer.alloc(size);
      b[bit >>> 3] = 1 << (bit & 7);
      check(b);
    }
    for (let len = 0; len < 4; len++)
      check(Buffer.concat([good, Buffer.alloc(len, 0x81)]));
  }
  for (const id of [0x6175746e, 0x6e65776e]) {
    assert.throws(() => call(32, w(id)), /UnknownNumberControl/);
    rejected++;
  }
  return { accepted, rejected };
}
