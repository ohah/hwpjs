import assert from 'node:assert/strict';
import {inverseReference} from './icc-matrix-reference.mjs';
import {writeUnsigned, readWide} from './icc-wide-fraction-wire.mjs';
import {pointInput, pointEntries, checkPoint} from './icc-model-forward.mjs';
import {modelProfile} from './icc-model.mjs';
export function fractionMatrixInput(matrix, numerators, denominator) {
  const b = Buffer.alloc(164);
  matrix.forEach((v, i) => b.writeInt32BE(v, i * 4));
  numerators.forEach((v, i) => writeUnsigned(b, 36 + i * 32, BigInt.asUintN(256, v)));
  writeUnsigned(b, 132, denominator); return b;
}
export function readFractionMatrix(out) {
  assert.equal(out.length, 256);
  const read = offset => { let n = 0n; for (let i = 7; i >= 0; i--) n = (n << 64n) | out.readBigUInt64LE(offset + i * 8); return n; };
  const denominator = read(192); assert.ok(denominator > 0n);
  return {numerators: [0, 64, 128].map(o => BigInt.asIntN(512, read(o))), denominator};
}
export function fractionMatrixInverseEdges(call) {
  let comparisons = 0, rejected = 0;
  function check(matrix, n, d) {
    const input = fractionMatrixInput(matrix, n, d), expected = inverseReference(matrix, n);
    if (d === 0n || !expected) { assert.throws(() => call(216, input), d === 0n ? /InvalidIccMatrixCoordinate/ : /InvalidIccAdaptationSingular/); rejected++; return; }
    const out = readFractionMatrix(call(216, input));
    expected.forEach(([a, b], i) => assert.equal(out.numerators[i] * b * d, a * 65536n * out.denominator));
    // Substitute into original equations independently of the row-reduction oracle.
    for (let r = 0; r < 3; r++) assert.equal(matrix.slice(r * 3, r * 3 + 3).reduce((s, a, c) => s + BigInt(a) * out.numerators[c], 0n) * d, n[r] * out.denominator * 65536n);
    comparisons++;
  }
  const max = (1n << 256n) - 1n, min = -(1n << 255n), hi = (1n << 255n) - 1n;
  const identity = [65536, 0, 0, 0, 65536, 0, 0, 0, 65536];
  for (let variant = 0; variant < 3 ** 9; variant++) {
    let v = variant; const matrix = Array.from({length: 9}, () => { const n = v % 3 - 1; v = Math.floor(v / 3); return n; });
    check(matrix, [min, hi, -1n], max);
  }
  let seed = 0x57494445;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const wide = () => { let n = 0n; for (let i = 0; i < 8; i++) n = (n << 32n) | BigInt(next()); return n; };
  for (let i = 0; i < 512; i++) check(Array.from({length: 9}, () => next() | 0), Array.from({length: 3}, () => BigInt.asIntN(256, wide())), wide() || 1n);
  for (const d of [1n, max]) for (const n of [[min, hi, -1n], [1n, -2n, 0n]]) {
    check(identity, n, d);
    check([2147483647, 2147483646, 0, 2147483646, 2147483645, 0, 0, 0, 1], n, d);
    check([-2147483648, 2147483647, 0, 2147483647, -2147483648, 0, 0, 0, -2147483648], n, d);
  }
  check(Array(9).fill(0), [0n, 0n, 0n], 0n);
  check(identity, [0n, 0n, 0n], 0n);
  const good = fractionMatrixInput(identity, [min, hi, -1n], max);
  for (let len = 0; len < good.length; len++) { assert.throws(() => call(216, good.subarray(0, len)), /InvalidProbeInput/); rejected++; }
  assert.throws(() => call(216, Buffer.concat([good, Buffer.alloc(1)])), /InvalidProbeInput/); rejected++;
  assert.throws(() => call(216, good, good.length - 1), /LimitExceeded/); rejected++;
  check(identity, [min, hi, -1n], max);
  const u64 = (1n << 64n) - 1n;
  for (const matrix of [identity, [12345, -45678, 0, 0, 65536, 32768, 0, 0, -98765], [2147483647, 2147483646, 0, 2147483646, 2147483645, 0, 0, 0, 1]]) {
    const points = [[u64 - 1n, u64], [1n, u64 - 1n], [2n, u64 - 2n]];
    const forward = call(176, pointInput(modelProfile(pointEntries(matrix, [0, 0, 0])), points));
    checkPoint(forward, matrix, [0, 0, 0], points); comparisons++;
    const n = [0, 1, 2].map(i => BigInt.asIntN(256, readWide(forward, 12 + 32 * i))), d = readWide(forward, 108);
    const inverse = readFractionMatrix(call(216, fractionMatrixInput(matrix, n, d)));
    points.forEach(([a, b], i) => assert.equal(inverse.numerators[i] * b, a * inverse.denominator)); comparisons++;
  }
  return {comparisons, rejected};
}
