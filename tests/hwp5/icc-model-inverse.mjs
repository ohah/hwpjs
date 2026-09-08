import assert from 'node:assert/strict';
import {modelProfile} from './icc-model.mjs';
import {pointEntries} from './icc-model-forward.mjs';
import {inverseReference, checkVector} from './icc-matrix-reference.mjs';
import {inverseReference as sampled} from './icc-inverse.mjs';
import {endpoint} from './icc-preimage-bounds.mjs';
import {readWide} from './icc-wide-fraction-wire.mjs';
import {trcInverseInput} from './icc-trc-inverse.mjs';

export function inverseModelInput(profile, xyz, precision = 512) {
  const prefix = Buffer.alloc(16); prefix.writeUInt32BE(precision);
  xyz.forEach((v, i) => prefix.writeInt32BE(v, 4 + i * 4));
  return Buffer.concat([prefix, profile]);
}
export function inverseModelParts(out, linear) {
  assert.ok(out.length >= 96);
  assert.equal(out.readUInt32LE(), 1); assert.equal(out.readUInt32LE(4), 1);
  checkVector(out.subarray(8, 72), linear);
  let offset = 96;
  const parts = linear.map(([n, d], i) => {
    assert.equal(out.readUInt32LE(72 + i * 4), n < 0n ? 1 : n > d ? 2 : 0);
    const length = out.readUInt32LE(84 + i * 4), p = out.subarray(offset, offset + length);
    assert.equal(p.length, length); offset += length; return p;
  });
  assert.equal(offset, out.length); return parts;
}
export function modelInverseEdges(call) {
  let comparisons = 0, rejected = 0;
  const identity = [65536, 0, 0, 0, 65536, 0, 0, 0, 65536];
  function check(matrix, kinds, xyz, precision = 512) {
    const b = inverseModelInput(modelProfile(pointEntries(matrix, kinds)), xyz, precision);
    const linear = inverseReference(matrix, xyz);
    if (!linear) { assert.throws(() => call(215, b), /InvalidIccAdaptationSingular/); rejected++; return b; }
    const parts = inverseModelParts(call(215, b), linear);
    parts.forEach((p, i) => {
      assert.equal(p.length, 96); assert.equal(p.readUInt32LE(), 5);
      const [n, d] = linear[i], target = n < 0n ? [0n, 1n] : n > d ? [1n, 1n] : [n, d];
      if (kinds[i] === 0) endpoint(p.subarray(4), target, true);
      else if (kinds[i] === 1) endpoint(p.subarray(4), sampled([0, 12345, 65535], target[0] * 65535n, target[1]), true);
      else if (target[0] === 0n || target[0] === target[1]) endpoint(p.subarray(4), target, true);
      else {
        // Exact sqrt target expression, not a floating point approximation.
        const e = p.subarray(4); assert.equal(e.readUInt32LE(), 1); assert.equal(e.readUInt32LE(4), 1);
        assert.equal(e.readInt32LE(8), 1); assert.ok(readWide(e, 44) > 0n);
        assert.equal(readWide(e, 12) * target[1], readWide(e, 44) * target[0]);
        assert.equal(e.readInt32LE(76), 65536); assert.equal(e.readUInt32LE(80), 131072);
        assert.equal(e.readInt32LE(84), 65536); assert.equal(e.readInt32LE(88), 0);
      }
    }); comparisons++; return b;
  }
  const matrices = [identity, [65536, 65536, 0, 0, 65536, 0, 0, 0, -65536], [3, 2, 1, 0, -7, 5, 0, 0, 11], [2147483647, 2147483646, 0, 2147483646, 2147483645, 0, 0, 0, 1], Array(9).fill(0)];
  for (const precision of [128, 256, 512, 1024]) for (const matrix of matrices) for (let variant = 0; variant < 64; variant++) {
    const kinds = [variant % 4, Math.floor(variant / 4) % 4, Math.floor(variant / 16)];
    for (const xyz of [[0, 16384, 65536], [65536, 131072, -65536], [-2147483648, 2147483647, 1]]) check(matrix, kinds, xyz, precision);
  }
  let seed = 0x4d545243;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed | 0; };
  for (let i = 0; i < 256; i++) check(Array.from({length: 9}, next), [0, 1, 2], Array.from({length: 3}, next));
  // Different channel states in one evaluation must not short-circuit each other.
  const entries = pointEntries(identity, [0, 0, 0]);
  entries[3][1] = trcInverseInput('rTRC', [0n, 1n], [65536, 0, 0, 0, 32768, 65536, 0], 'para', 4).subarray(40);
  entries[4][1] = trcInverseInput('gTRC', [0n, 1n], [65536, 0, 0, 65536, 32768, 65536, 0], 'para', 4).subarray(40);
  const xyz = [32768, 40960, 16384];
  const parts = inverseModelParts(call(215, inverseModelInput(modelProfile(entries), xyz)), [[1n, 2n], [5n, 8n], [1n, 4n]]);
  assert.equal(parts[0].length, 152); assert.equal(parts[0].readUInt32LE(), 4);
  assert.equal(readWide(parts[0], 4), 0n); assert.ok(readWide(parts[0], 36) > 0n);
  const ep = parts[0].subarray(68); assert.equal(ep.readUInt32LE(16), 0);
  assert.equal(ep.readBigUInt64LE() * 2n, ep.readBigUInt64LE(8));
  assert.ok(readWide(ep, 52) > 0n); assert.equal(readWide(ep, 20), readWide(ep, 52));
  assert.deepEqual(parts[1], Buffer.alloc(4)); assert.equal(parts[2].readUInt32LE(), 5); endpoint(parts[2].subarray(4), [1n, 4n], true); comparisons++;
  entries[5][1] = trcInverseInput('bTRC', [0n, 1n], [0]).subarray(40);
  assert.throws(() => call(215, inverseModelInput(modelProfile(entries), xyz)), /NonInvertibleIccGamma/); rejected++;
  const good = check(identity, [0, 1, 2], [16384, 32768, 49152]);
  for (let n = 0; n < good.length; n++) { assert.throws(() => call(215, good.subarray(0, n)), /InvalidProbeInput|InvalidIcc/); rejected++; }
  assert.throws(() => call(215, good, good.length - 1), /LimitExceeded/); rejected++;
  const bad = Buffer.from(good); bad.writeUInt32BE(64); assert.throws(() => call(215, bad), /InvalidIccComparisonPrecision/); rejected++;
  check(identity, [0, 1, 2], [16384, 32768, 49152]);
  return {comparisons, rejected};
}
