import assert from "node:assert/strict";
import { polygonBytes } from "./shape-polygon.mjs";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
export const curveRun = (call, b, mode = 1) => call(70, Buffer.concat([Buffer.from([mode]), b]));
export function curveActual(call, b, mode = 1, prefixes = true) {
  const start = mode ? 4 : 2, n = mode ? b.readInt32LE() : b.readInt16LE(), count = Math.max(0, n - 1);
  const end = start + n * 8 + count; assert.ok(n >= 0 && end <= b.length);
  const points = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) {
    points.writeInt32LE(b.readInt32LE(start + 4 * (mode ? i * 2 : i)), i * 8);
    points.writeInt32LE(b.readInt32LE(start + 4 * (mode ? i * 2 + 1 : i + n)), i * 8 + 4);
  }
  const segments = b.subarray(start + n * 8, end), tail = b.subarray(end);
  const expected = Buffer.concat([w(n), points, w(count), segments, w(tail.length), tail]);
  assert.deepEqual(curveRun(call, b, mode), expected);
  if (prefixes) for (let cut = 0; cut < end; cut++) assert.throws(() => curveRun(call, b.subarray(0, cut), mode), /UnexpectedEnd/);
  for (let length = 0; length <= Math.min(4, tail.length); length++) {
    const result = curveRun(call, b.subarray(0, end + length), mode);
    assert.equal(result.readUInt32LE(8 + n * 8 + count), length);
    assert.deepEqual(result.subarray(12 + n * 8 + count), tail.subarray(0, length));
  }
  assert.deepEqual(curveRun(call, b, mode), expected);
  const types = {}; for (const v of segments) types[v] = (types[v] ?? 0) + 1;
  return {points: n, segments: count, types, extra: tail.length, tail: tail.toString('hex'), rejected: prefixes ? end : 0};
}
export function curveEdges(call) {
  let accepted = 0, rejected = 0;
  for (const mode of [0, 1]) {
    const points = [[-2147483648, 17], [-1, 2147483647], [53, -79]];
    const good = polygonBytes(points, mode, Buffer.from([0, 1, 9, 0, 128, 255]));
    const check = (b, prefixes = true) => { rejected += curveActual(call, b, mode, prefixes).rejected; accepted++; };
    check(good);
    for (let at = mode ? 4 : 2; at < good.length; at++) for (const value of [1, 128, 255]) {
      const b = Buffer.from(good); b[at] = value; check(b);
    }
    for (const n of [0, 1, 2]) check(polygonBytes(points.slice(0, n), mode, Buffer.alloc(Math.max(0, n - 1))));
    for (const n of [-1, mode ? -2147483648 : -32768, 4, mode ? 2147483647 : 32767]) {
      const b = Buffer.from(good); if (mode) b.writeInt32LE(n); else b.writeInt16LE(n);
      assert.throws(() => curveRun(call, b, mode), n < 0 ? /NegativePointCount/ : /UnexpectedEnd/); rejected++; check(good, false);
    }
    const large = mode ? 32768 : 32767;
    check(polygonBytes(Array.from({length: large}, (_, i) => [i, -i]), mode, Buffer.alloc(large - 1, 255)), false);
  }
  for (const mode of [2, 255]) { assert.throws(() => curveRun(call, Buffer.alloc(4), mode), /InvalidMode/); rejected++; }
  assert.throws(() => call(70, Buffer.alloc(0)), /UnexpectedEnd/); rejected++;
  return {accepted, rejected};
}
