import assert from 'node:assert/strict';
import {readWide, writeUnsigned} from './icc-wide-fraction-wire.mjs';
export function gammaWideInput(raw, n, d) {
  const b = Buffer.alloc(130); b.writeUInt16BE(raw); writeUnsigned(b, 2, n, 64); writeUnsigned(b, 66, d, 64); return b;
}
export function gammaWideInverseEdges(call) {
  let rational = 0, power = 0, rejected = 0;
  function check(raw, n, d) {
    const b = gammaWideInput(raw, n, d);
    if (!d || n > d || !raw) { assert.throws(() => call(220, b), !d || n > d ? /InvalidIccCurveCoordinate/ : /NonInvertibleIccGamma/); rejected++; return; }
    const out = call(220, b); assert.equal(out.length, 144);
    const exact = raw === 256 || n === 0n || n === d;
    assert.equal(out.readUInt32LE(), exact ? 0 : 1); assert.equal(out.readUInt32LE(4), 0);
    assert.equal(readWide(out, 8, 64), n); assert.equal(readWide(out, 72, 64), d);
    if (exact) { assert.deepEqual(out.subarray(136), Buffer.alloc(8)); rational++; }
    else { assert.equal(out.readInt32LE(136), 65536); assert.equal(out.readUInt32LE(140), raw * 256); power++; }
  }
  const max = (1n << 512n) - 1n;
  for (let raw = 0; raw < 65536; raw++) for (const [n, d] of [[0n, max], [max, max], [max - 1n, max], [1n, max]]) check(raw, n, d);
  for (const raw of [0, 1, 128, 256, 512, 65535]) {
    for (const target of [[0n, 0n], [2n, 1n], [1n, 4n], [2n, 8n], [1n, 2n]]) check(raw, ...target);
  }
  const good = gammaWideInput(512, 1n, 4n);
  for (let len = 0; len < good.length; len++) { assert.throws(() => call(220, good.subarray(0, len)), /InvalidProbeInput/); rejected++; }
  assert.throws(() => call(220, Buffer.concat([good, Buffer.alloc(1)])), /InvalidProbeInput/); rejected++;
  assert.throws(() => call(220, good, good.length - 1), /LimitExceeded/); rejected++;
  check(512, 1n, 4n); return {rational, power, rejected};
}
