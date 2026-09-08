import assert from 'node:assert/strict';
import {inverseInput, inverseReference} from './icc-inverse.mjs';
import {readWide, writeUnsigned} from './icc-wide-fraction-wire.mjs';
export function sampledWideInput(values, n, d) {
  const prefix = Buffer.alloc(128); writeUnsigned(prefix, 0, n, 64); writeUnsigned(prefix, 64, d, 64);
  return Buffer.concat([prefix, inverseInput(values, 0).subarray(2)]);
}
export function sampledWideInverseEdges(call) {
  let comparisons = 0, rejected = 0;
  function check(values, n, d) {
    const b = sampledWideInput(values, n, d); let expected;
    try { expected = inverseReference(values, n * 65535n, d); } catch (e) { assert.throws(() => call(219, b), new RegExp(e.message)); rejected++; return; }
    const out = call(219, b); assert.equal(out.length, 256);
    const rn = readWide(out, 0, 128), rd = readWide(out, 128, 128);
    assert.ok(rd > 0n && rn <= rd); assert.equal(rn * expected[1], rd * expected[0]); comparisons++;
  }
  const max = (1n << 512n) - 1n;
  for (let size = 2; size <= 6; size++) for (let code = 0; code < 3 ** size; code++) {
    let v = code; const values = Array.from({length: size}, () => { const value = [0, 32768, 65535][v % 3]; v = Math.floor(v / 3); return value; });
    for (const [n, d] of [[0n, 1n], [1n, max], [max / 2n, max], [max - 1n, max], [1n, 1n], [32768n, 65535n]]) check(values, n, d);
  }
  let seed = 0x53414d50;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const wide = () => { let n = 0n; for (let i = 0; i < 16; i++) n = (n << 32n) | BigInt(next()); return n; };
  for (let i = 0; i < 512; i++) {
    const values = [0, ...Array.from({length: 2 + i % 61}, () => next() % 65536), 65535].sort((a, b) => a - b);
    const d = wide() || 1n, n = wide() % (d + 1n); check(values, n, d); check([...values].reverse(), n, d);
  }
  for (const values of [[0, 0, 32768, 32768, 65535, 65535], [65535, 65535, 32768, 32768, 0, 0], [100, 100, 200, 200]]) for (const [n, d] of [[0n, 1n], [1n, 1n], [32768n, 65535n]]) check(values, n, d);
  const out = call(219, sampledWideInput([0, 65535], max - 1n, max));
  assert.ok(readWide(out, 0, 128) > max); assert.ok(readWide(out, 128, 128) > max); comparisons++;
  for (const [n, d] of [[0n, 0n], [2n, 1n]]) { assert.throws(() => call(219, sampledWideInput([0, 65535], n, d)), /InvalidIccCurveCoordinate/); rejected++; }
  for (const values of [[], [512]]) { assert.throws(() => call(219, sampledWideInput(values, 0n, 1n)), /InvalidIccInverseSamples/); rejected++; }
  const good = sampledWideInput([0, 65535], 1n, max);
  for (let len = 0; len < good.length; len++) { assert.throws(() => call(219, good.subarray(0, len)), /InvalidProbeInput|InvalidIcc/); rejected++; }
  assert.throws(() => call(219, Buffer.concat([good, Buffer.alloc(1)])), /InvalidIcc/); rejected++;
  assert.throws(() => call(219, good, good.length - 1), /LimitExceeded/); rejected++;
  check([0, 65535], 1n, max); return {comparisons, rejected};
}
