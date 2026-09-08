import assert from 'node:assert/strict';
import {modelProfile} from './icc-model.mjs';
import {pointEntries} from './icc-model-forward.mjs';
import {inverseReference, fraction} from './icc-matrix-reference.mjs';
import {readFractionMatrix} from './icc-fraction-matrix-inverse.mjs';
import {inverseReference as sampled} from './icc-inverse.mjs';
import {endpoint} from './icc-preimage-bounds.mjs';
import {readWide, writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {trcInverseInput} from './icc-trc-inverse.mjs';

export function fractionModelInput(profile, n, d, precision = 512) {
  const b = Buffer.alloc(132); b.writeUInt32BE(precision);
  n.forEach((v, i) => writeUnsigned(b, 4 + 32 * i, BigInt.asUintN(256, v)));
  writeUnsigned(b, 100, d); return Buffer.concat([b, profile]);
}
export function fractionModelParts(out, linear) {
  assert.ok(out.length >= 288);
  assert.equal(out.readUInt32LE(), 1); assert.equal(out.readUInt32LE(4), 1);
  const raw = readFractionMatrix(out.subarray(8, 264));
  let offset = 288;
  const parts = linear.map(([n, d], i) => {
    assert.equal(raw.numerators[i] * d, n * raw.denominator);
    assert.equal(out.readUInt32LE(264 + 4 * i), n < 0n ? 1 : n > d ? 2 : 0);
    const length = out.readUInt32LE(276 + 4 * i), p = out.subarray(offset, offset + length);
    assert.equal(p.length, length); offset += length; return p;
  });
  assert.equal(offset, out.length); return parts;
}
export function fractionModelInverseEdges(call) {
  let comparisons = 0, rejected = 0;
  const identity = [65536, 0, 0, 0, 65536, 0, 0, 0, 65536];
  function check(matrix, kinds, n, d, precision = 512) {
    const input = fractionModelInput(modelProfile(pointEntries(matrix, kinds)), n, d, precision);
    const inverse = inverseReference(matrix, n);
    if (d === 0n || !inverse) {
      assert.throws(() => call(238, input), d === 0n ? /InvalidIccMatrixCoordinate/ : /InvalidIccAdaptationSingular/);
      rejected++; return input;
    }
    const linear = inverse.map(([a, b]) => fraction(a * 65536n, b * d));
    const parts = fractionModelParts(call(238, input), linear);
    parts.forEach((p, i) => {
      assert.equal(p.length, 288); assert.equal(p.readUInt32LE(), 5);
      const [a, b] = linear[i], target = a < 0n ? [0n, 1n] : a > b ? [1n, 1n] : [a, b];
      if (kinds[i] === 0) endpoint(p.subarray(4), target, true, 128);
      else if (kinds[i] === 1) endpoint(p.subarray(4), sampled([0, 12345, 65535], target[0] * 65535n, target[1]), true, 128);
      else if (target[0] === 0n || target[0] === target[1]) endpoint(p.subarray(4), target, true, 128);
      else {
        const e = p.subarray(4);
        assert.equal(e.readUInt32LE(), 1); assert.equal(e.readUInt32LE(4), 1); assert.equal(e.readInt32LE(8), 1);
        const rn = readWide(e, 12, 128), rd = readWide(e, 140, 128);
        assert.ok(rd > 0n); assert.equal(rn * target[1], rd * target[0]);
        assert.equal(e.readInt32LE(268), 65536); assert.equal(e.readUInt32LE(272), 131072);
        assert.equal(e.readInt32LE(276), 65536); assert.equal(e.readInt32LE(280), 0);
      }
    }); comparisons++; return input;
  }
  const max = (1n << 256n) - 1n, min = -(1n << 255n), hi = (1n << 255n) - 1n;
  const matrices = [identity, [65536, 65536, 0, 0, 65536, 0, 0, 0, -65536], [3, 2, 1, 0, -7, 5, 0, 0, 11], [2147483647, 2147483646, 0, 2147483646, 2147483645, 0, 0, 0, 1], Array(9).fill(0)];
  for (const precision of [128, 256, 512, 1024]) for (const matrix of matrices) for (let v = 0; v < 64; v++) {
    const kinds = [v % 4, Math.floor(v / 4) % 4, Math.floor(v / 16)];
    for (const [n, d] of [[[min, hi, 1n], max], [[1n, 2n, -1n], 1n], [[1n, hi, 0n], max]]) check(matrix, kinds, n, d, precision);
  }
  let seed = 0x46545243;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const wide = () => { let n = 0n; for (let i = 0; i < 8; i++) n = (n << 32n) | BigInt(next()); return n; };
  for (let i = 0; i < 256; i++) check(Array.from({length: 9}, () => next() | 0), [0, 1, 2], Array.from({length: 3}, () => BigInt.asIntN(256, wide())), wide() || 1n);
  const entries = pointEntries(identity, [0, 0, 0]);
  for (const values of [[0, 0, 65535, 65535], [65535, 65535, 0, 0]]) {
    const plateaus = pointEntries(identity, [0, 0, 0]);
    for (const [i, name] of ['rTRC', 'gTRC', 'bTRC'].entries()) plateaus[i + 3][1] = trcInverseInput(name, [0n, 1n], values).subarray(40);
    for (const n of [[-1n, 1n, hi], [0n, 1n, 2n]]) {
      const d = n[0] < 0n ? max : 1n;
      const parts = fractionModelParts(call(238, fractionModelInput(modelProfile(plateaus), n, d)), n.map(v => [v, d]));
      parts.forEach((p, i) => {
        const target = n[i] < 0n ? [0n, 1n] : n[i] > d ? [1n, 1n] : [n[i], d];
        assert.equal(p.length, 288); assert.equal(p.readUInt32LE(), 5);
        endpoint(p.subarray(4), sampled(values, target[0] * 65535n, target[1]), true, 128);
      }); comparisons++;
    }
  }
  entries[3][1] = trcInverseInput('rTRC', [0n, 1n], [65536, 0, 0, 0, 32768, 65536, 0], 'para', 4).subarray(40);
  entries[4][1] = trcInverseInput('gTRC', [0n, 1n], [65536, 0, 0, 65536, 32768, 65536, 0], 'para', 4).subarray(40);
  const parts = fractionModelParts(call(238, fractionModelInput(modelProfile(entries), [4n, 5n, 2n], 8n)), [[1n, 2n], [5n, 8n], [1n, 4n]]);
  assert.equal(parts[0].length, 216); assert.equal(parts[0].readUInt32LE(), 4);
  assert.equal(readWide(parts[0], 4, 64), 0n); assert.ok(readWide(parts[0], 68, 64) > 0n);
  const ep = parts[0].subarray(132);
  assert.equal(ep.readUInt32LE(16), 0); assert.equal(ep.readBigUInt64LE() * 2n, ep.readBigUInt64LE(8));
  assert.ok(readWide(ep, 52) > 0n); assert.equal(readWide(ep, 20), readWide(ep, 52));
  assert.deepEqual(parts[1], Buffer.alloc(4)); assert.equal(parts[2].readUInt32LE(), 5);
  endpoint(parts[2].subarray(4), [1n, 4n], true, 128); comparisons++;
  entries[5][1] = trcInverseInput('bTRC', [0n, 1n], [0]).subarray(40);
  assert.throws(() => call(238, fractionModelInput(modelProfile(entries), [4n, 5n, 2n], 8n)), /NonInvertibleIccGamma/); rejected++;
  check(identity, [0, 0, 0], [0n, 0n, 0n], 0n);
  check(Array(9).fill(0), [0, 0, 0], [0n, 0n, 0n], 0n);
  const good = check(identity, [0, 1, 2], [1n, hi, -1n], max);
  for (let n = 0; n < good.length; n++) { assert.throws(() => call(238, good.subarray(0, n)), /InvalidProbeInput|InvalidIcc/); rejected++; }
  assert.throws(() => call(238, good, good.length - 1), /LimitExceeded/); rejected++;
  const bad = Buffer.from(good); bad.writeUInt32BE(64); assert.throws(() => call(238, bad), /InvalidIccComparisonPrecision/); rejected++;
  check(identity, [0, 1, 2], [1n, hi, -1n], max);
  return {comparisons, rejected};
}
