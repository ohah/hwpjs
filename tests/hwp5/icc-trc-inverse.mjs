import assert from 'node:assert/strict';
import {endpoint} from './icc-preimage-bounds.mjs';
import {writeUnsigned as writeUnsignedBE} from './icc-wide-fraction-wire.mjs';

export function trcInverseInput(name, target, values, kind = 'curv', fn = 0, precision = 512) {
  const b = Buffer.alloc(52 + values.length * (kind === 'curv' ? 2 : 4));
  b.writeUInt32BE(precision);
  writeUnsignedBE(b, 4, target[0], 16);
  writeUnsignedBE(b, 20, target[1], 16);
  b.write(name, 36); b.write(kind, 40);
  if (kind === 'curv') b.writeUInt32BE(values.length, 48);
  else b.writeUInt16BE(fn, 48);
  values.forEach((v, i) => kind === 'curv' ? b.writeUInt16BE(v, 52 + i * 2) : b.writeInt32BE(v, 52 + i * 4));
  return b;
}

export function trcInverseEdges(call) {
  let selected = 0, rejected = 0, unattained = 0, ambiguous = 0, undecided = 0;
  function reject(mode, b, pattern, limit) { assert.throws(() => call(mode, b, limit), pattern); rejected++; }
  function inspect(mode, b, channel) {
    const out = call(mode, b);
    assert.equal(out.readUInt32LE(), channel);
    assert.equal(out.readUInt32LE(4), 1);
    return out.subarray(8);
  }
  function check(mode, b, channel, x) {
    const out = inspect(mode, b, channel);
    assert.equal(out.length, 96); assert.equal(out.readUInt32LE(), 5);
    endpoint(out.subarray(4), x, true); selected++;
  }
  const max = (1n << 128n) - 1n;
  for (const mode of [213, 214]) for (const precision of [128, 256, 512, 1024]) {
    for (const [channel, name] of ['rTRC', 'gTRC', 'bTRC', 'kTRC'].entries()) {
      const input = (t, values, kind = 'curv', fn = 0) => trcInverseInput(name, t, values, kind, fn, precision);
      for (const t of [[0n, 1n], [1n, 3n], [max - 1n, max], [1n, 1n]]) check(mode, input(t, []), channel, t);
      for (const [gamma, t, x] of [[256, [1n, 3n], [1n, 3n]], [512, [1n, 4n], [1n, 2n]], [128, [1n, 2n], [1n, 4n]], [1024, [1n, 16n], [1n, 2n]]]) check(mode, input(t, [gamma]), channel, x);
      // Independent exact expectations: two endpoint plateaus and linear interior.
      for (const t of [[0n, 1n], [1n, 2n], [1n, 1n]]) {
        check(mode, input(t, [0, 0, 65535, 65535]), channel, t[0] === 0n ? [1n, 3n] : t[0] === t[1] ? [2n, 3n] : [1n, 2n]);
        check(mode, input(t, [65535, 65535, 0, 0]), channel, t[0] === 0n ? [2n, 3n] : t[0] === t[1] ? [1n, 3n] : [1n, 2n]);
      }
      check(mode, input([0n, 1n], [100, 200]), channel, [0n, 1n]);
      check(mode, input([1n, 1n], [100, 200]), channel, [1n, 1n]);
      const para = input([1n, 4n], [131072], 'para');
      if (mode === 213) reject(mode, para, /InvalidIccTrcType/);
      else check(mode, para, channel, [1n, 2n]);
      reject(mode, input([0n, 1n], [0]), /NonInvertibleIccGamma/);
      reject(mode, input([0n, 1n], [0, 65535, 0]), /NonMonotonicIccCurve/);
      reject(mode, input([0n, 1n], [17, 17]), /ConstantIccCurve/);
    }
  }
  for (const [t, values, status, length] of [
    [[3n, 5n], [65536, 0, 0, 65536, 32768, 65536, 0], 0, 4],
    [[1n, 2n], [65536, 0, 0, 0, 32768, 65536, 0], 4, 152],
  ]) {
    const out = inspect(214, trcInverseInput('rTRC', t, values, 'para', 4), 0);
    assert.equal(out.readUInt32LE(), status); assert.equal(out.length, length);
    if (status === 0) unattained++; else ambiguous++;
  }
  const unknown = inspect(214, trcInverseInput('kTRC', [65537n * 65537n << 64n, max], [131072, 65537, 0, 0, 1], 'para', 3, 128), 3);
  assert.deepEqual(unknown, Buffer.from([1, 0, 0, 0])); undecided++;
  for (const mode of [213, 214]) {
    const good = trcInverseInput('gTRC', [1n, 4n], [512]);
    for (let n = 0; n < good.length; n++) reject(mode, good.subarray(0, n), /InvalidProbeInput|InvalidIcc/);
    reject(mode, good, /LimitExceeded/, good.length - 1);
    reject(mode, Buffer.concat([good, Buffer.alloc(1)]), /InvalidIcc/);
    for (const t of [[0n, 0n], [2n, 1n]]) reject(mode, trcInverseInput('rTRC', t, []), /InvalidIccCurveCoordinate/);
    reject(mode, trcInverseInput('RTRC', [0n, 1n], []), /UnhandledIccTrc/);
    reject(mode, trcInverseInput('rTRC', [0n, 1n], [], 'curv', 0, 64), /InvalidIccComparisonPrecision/);
    check(mode, good, 1, [1n, 2n]);
  }
  return {selected, rejected, unattained, ambiguous, undecided};
}
