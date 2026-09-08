import assert from 'node:assert/strict';
import {readWide, writeUnsigned} from './icc-wide-fraction-wire.mjs';
export function wideLinearInput(values) {
  const out = Buffer.alloc(values.length * 64);
  values.forEach((v, i) => writeUnsigned(out, i * 64, BigInt.asUintN(512, v), 64)); return out;
}
export function wideLinearTargetEdges(call) {
  let normalized = 0, compared = 0, rejected = 0;
  const max = (1n << 512n) - 1n, hi = (1n << 511n) - 1n, min = -(1n << 511n);
  function normalize(n, d) {
    const b = wideLinearInput([n, d]);
    if (!d) { assert.throws(() => call(217, b), /InvalidIccMatrixCoordinate/); rejected++; return; }
    const out = call(217, b); assert.equal(out.length, 132);
    const clipping = n < 0n ? 1 : n > d ? 2 : 0;
    assert.equal(out.readUInt32LE(), clipping);
    assert.equal(readWide(out, 4, 64), clipping === 1 ? 0n : clipping === 2 ? 1n : n);
    assert.equal(readWide(out, 68, 64), clipping ? 1n : d); normalized++;
  }
  function compare(a, b) {
    const out = call(218, wideLinearInput([...a, ...b])); assert.equal(out.length, 4);
    const left = a[0] * b[1], right = b[0] * a[1];
    assert.equal(out.readInt32LE(), left < right ? -1 : left > right ? 1 : 0); compared++;
  }
  for (const d of [0n, 1n, 2n, hi, hi + 1n, max]) for (const n of [min, min + 1n, -1n, 0n, 1n, hi - 1n, hi]) normalize(n, d);
  for (let bit = 0n; bit < 512n; bit++) {
    const d = 1n << bit;
    for (const n of [d - 1n, d, d + 1n]) if (n <= hi) { normalize(n, d); normalize(-n, d); }
    compare([d - 1n, d], [d, d + (d < max ? 1n : 0n)]);
  }
  compare([max - 1n, max], [max - 2n, max - 1n]);
  compare([max, max], [1n, 1n]); compare([0n, max], [0n, 1n]);
  let seed = 0x54415247;
  const wide = () => { let n = 0n; for (let i = 0; i < 16; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; n = (n << 32n) | BigInt(seed); } return n; };
  for (let i = 0; i < 1024; i++) {
    const a = wide(), b = wide() || 1n, c = wide(), d = wide() || 1n;
    normalize(BigInt.asIntN(512, a), b);
    compare([a % (b + 1n), b], [c % (d + 1n), d]);
  }
  for (const bad of [[0n, 0n], [2n, 1n]]) for (const values of [[...bad, 0n, 1n], [0n, 1n, ...bad]]) { assert.throws(() => call(218, wideLinearInput(values)), /InvalidIccCurveCoordinate/); rejected++; }
  for (const [mode, b] of [[217, wideLinearInput([hi, max])], [218, wideLinearInput([max - 1n, max, max - 2n, max - 1n])]]) {
    for (let len = 0; len < b.length; len++) { assert.throws(() => call(mode, b.subarray(0, len)), /InvalidProbeInput/); rejected++; }
    assert.throws(() => call(mode, Buffer.concat([b, Buffer.alloc(1)])), /InvalidProbeInput/); rejected++;
    assert.throws(() => call(mode, b, b.length - 1), /LimitExceeded/); rejected++;
  }
  normalize(hi, max); compare([max - 1n, max], [max - 2n, max - 1n]);
  return {normalized, compared, rejected};
}
