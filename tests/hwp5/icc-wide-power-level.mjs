import assert from 'node:assert/strict';
import {reference} from './icc-normalized-power-level.mjs';
import {readWide, writeUnsigned} from './icc-wide-fraction-wire.mjs';
export function widePowerInput(g, offset, n, d) {
  const b = Buffer.alloc(136); b.writeInt32BE(g); b.writeInt32BE(offset, 4);
  writeUnsigned(b, 8, n, 64); writeUnsigned(b, 72, d, 64); return b;
}
export function widePowerLevelEdges(call) {
  let comparisons = 0, rejected = 0;
  function check(g, offset, n, d) {
    const b = widePowerInput(g, offset, n, d); let expected;
    try { expected = reference(g, offset, n, d); } catch (e) { assert.throws(() => call(221, b), new RegExp(e.message)); rejected++; return; }
    const out = call(221, b); assert.equal(out.length, 8 + 268 * expected.signs.length);
    assert.equal(out.readUInt32LE(), Number(expected.all)); assert.equal(out.readUInt32LE(4), expected.signs.length);
    expected.signs.forEach((sign, i) => {
      const at = 8 + 268 * i; assert.equal(out.readInt32LE(at), sign);
      if (sign === 0) { assert.deepEqual(out.subarray(at, at + 268), Buffer.alloc(268)); return; }
      const rn = readWide(out, at + 4, 128), rd = readWide(out, at + 132, 128), magnitude = expected.value[0] < 0n ? -expected.value[0] : expected.value[0];
      assert.ok(rn > 0n && rd > 0n); assert.equal(rn * expected.value[1], rd * magnitude);
      assert.equal(out.readInt32LE(at + 260), g < 0 ? -65536 : 65536); assert.equal(out.readUInt32LE(at + 264), Math.abs(g));
    }); comparisons++;
  }
  const max = (1n << 512n) - 1n;
  const gs = [-2147483648, -196608, -131072, -65536, -32768, -1, 0, 1, 32768, 65536, 98304, 131072, 196608, 2147483647];
  const offsets = [-2147483648, -65536, -32768, 0, 1, 32768, 65536, 2147483647];
  for (const g of gs) for (const offset of offsets) for (const [n, d] of [[0n, 1n], [1n, 1n], [1n, 3n], [1n, max], [max / 2n, max], [max - 1n, max], [max, max]]) check(g, offset, n, d);
  const even = max - 1n; for (const n of [even / 2n - 1n, even / 2n, even / 2n + 1n]) check(0, -32768, n, even);
  let seed = 0x524f4f54;
  const wide = () => { let n = 0n; for (let i = 0; i < 16; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; n = (n << 32n) | BigInt(seed); } return n; };
  for (let i = 0; i < 1024; i++) { const d = wide() || 1n; check(gs[i % gs.length], offsets[i % offsets.length], wide() % (d + 1n), d); }
  for (const target of [[0n, 0n], [2n, 1n]]) check(0, 0, ...target);
  const good = widePowerInput(65536, 1, max / 2n, max);
  for (let len = 0; len < good.length; len++) { assert.throws(() => call(221, good.subarray(0, len)), /InvalidProbeInput/); rejected++; }
  assert.throws(() => call(221, Buffer.concat([good, Buffer.alloc(1)])), /InvalidProbeInput/); rejected++;
  assert.throws(() => call(221, good, good.length - 1), /LimitExceeded/); rejected++;
  check(65536, 1, max / 2n, max); return {comparisons, rejected};
}
