import assert from "node:assert/strict";
export const polygonRun = (call, b, mode = 1) => call(66, Buffer.concat([Buffer.from([mode]), b]));
export function polygonBytes(points, mode, tail = Buffer.alloc(0)) {
  const start = mode ? 4 : 2, b = Buffer.alloc(start + points.length * 8 + tail.length);
  if (mode) b.writeInt32LE(points.length); else b.writeInt16LE(points.length);
  points.forEach(([x, y], i) => {
    b.writeInt32LE(x, start + 4 * (mode ? i * 2 : i));
    b.writeInt32LE(y, start + 4 * (mode ? i * 2 + 1 : i + points.length));
  });
  b.set(tail, start + points.length * 8); return b;
}
export function polygonActual(call, b, mode = 1, prefixes = true) {
  const start = mode ? 4 : 2, n = mode ? b.readInt32LE() : b.readInt16LE();
  assert.ok(n >= 0 && n <= Math.floor((b.length - start) / 8));
  const end = start + n * 8, extra = b.length - end, expected = Buffer.alloc(8 + n * 8 + extra);
  expected.writeUInt32LE(n);
  for (let i = 0; i < n; i++) {
    expected.writeInt32LE(b.readInt32LE(start + 4 * (mode ? i * 2 : i)), 4 + i * 8);
    expected.writeInt32LE(b.readInt32LE(start + 4 * (mode ? i * 2 + 1 : i + n)), 8 + i * 8);
  }
  expected.writeUInt32LE(extra, 4 + n * 8); b.copy(expected, 8 + n * 8, end);
  assert.deepEqual(polygonRun(call, b, mode), expected);
  if (prefixes) for (let i = 0; i < end; i++) assert.throws(() => polygonRun(call, b.subarray(0, i), mode), /UnexpectedEnd/);
  for (let tail = 0; tail <= Math.min(4, extra); tail++) {
    const partial = polygonRun(call, b.subarray(0, end + tail), mode);
    assert.equal(partial.readUInt32LE(4 + n * 8), tail);
    assert.deepEqual(partial.subarray(8 + n * 8), b.subarray(end, end + tail));
  }
  assert.deepEqual(polygonRun(call, b, mode), expected);
  return {count: n, extra, tail: b.subarray(end).toString('hex'), rejected: prefixes ? end : 0};
}
export function polygonEdges(call) {
  let accepted = 0, rejected = 0;
  for (const mode of [0, 1]) {
    const points = [[-2147483648, 19], [-1, 2147483647], [73, -53]];
    const good = polygonBytes(points, mode, Buffer.from([0, 128, 254, 255]));
    const check = (b, prefixes = true) => { rejected += polygonActual(call, b, mode, prefixes).rejected; accepted++; };
    for (const n of [0, 1, 2, 3]) check(polygonBytes(points.slice(0, n), mode));
    const start = mode ? 4 : 2;
    for (let at = start; at < good.length; at++) for (const value of [1, 128, 255]) {
      const changed = Buffer.from(good); changed[at] = value; check(changed);
    }
    for (let tail = 0; tail <= 4; tail++) check(good.subarray(0, good.length - 4 + tail));
    for (const n of [-1, mode ? -2147483648 : -32768, 4, mode ? 2147483647 : 32767]) {
      const changed = Buffer.from(good);
      if (mode) changed.writeInt32LE(n); else changed.writeInt16LE(n);
      assert.throws(() => polygonRun(call, changed, mode), n < 0 ? /NegativePointCount/ : /UnexpectedEnd/); rejected++;
      check(good, false);
    }
    for (let bit = 0; bit < start * 8; bit++) {
      const changed = Buffer.from(good); changed[Math.floor(bit / 8)] ^= 1 << (bit % 8);
      const n = mode ? changed.readInt32LE() : changed.readInt16LE();
      if (n >= 0 && n <= 3) check(changed, false);
      else { assert.throws(() => polygonRun(call, changed, mode), n < 0 ? /NegativePointCount/ : /UnexpectedEnd/); rejected++; check(good, false); }
    }
    const largeCount = mode ? 32768 : 32767;
    check(polygonBytes(Array.from({length: largeCount}, (_, i) => [i, -i]), mode), false);
  }
  const ambiguous = polygonBytes([[17, 23], [-19, 31], [53, -79]], 1, Buffer.alloc(4));
  assert.notDeepEqual(polygonRun(call, ambiguous, 0), polygonRun(call, ambiguous, 1));
  for (const mode of [2, 255]) { assert.throws(() => polygonRun(call, Buffer.alloc(4), mode), /InvalidMode/); rejected++; }
  assert.throws(() => call(66, Buffer.alloc(0)), /UnexpectedEnd/); rejected++;
  return {accepted, rejected};
}
