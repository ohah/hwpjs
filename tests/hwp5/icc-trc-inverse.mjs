import assert from 'node:assert/strict';
import {endpoint} from './icc-preimage-bounds.mjs';
import {writeUnsigned as writeUnsignedBE} from './icc-wide-fraction-wire.mjs';

export function trcInverseInput(name, target, values, kind = 'curv', fn = 0, precision = 512, bits = 128) {
  const width = bits / 8, prefix = 4 + 2 * width;
  const b = Buffer.alloc(prefix + 16 + values.length * (kind === 'curv' ? 2 : 4));
  b.writeUInt32BE(precision);
  writeUnsignedBE(b, 4, target[0], width);
  writeUnsignedBE(b, 4 + width, target[1], width);
  b.write(name, prefix); b.write(kind, prefix + 4);
  if (kind === 'curv') b.writeUInt32BE(values.length, prefix + 12);
  else b.writeUInt16BE(fn, prefix + 12);
  values.forEach((v, i) => kind === 'curv' ? b.writeUInt16BE(v, prefix + 16 + i * 2) : b.writeInt32BE(v, prefix + 16 + i * 4));
  return b;
}

export function trcInverseEdges(call, bits = 128) {
  const modes = bits === 128 ? [213, 214] : [236, 237];
  const v2 = modes[0], v4 = modes[1], width = bits === 128 ? 32 : 128;
  const inputFor = (...args) => { while (args.length < 6) args.push(undefined); return trcInverseInput(...args, bits); };
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
    assert.equal(out.length, 32 + 2 * width); assert.equal(out.readUInt32LE(), 5);
    endpoint(out.subarray(4), x, true, width); selected++;
  }
  const max = (1n << BigInt(bits)) - 1n;
  for (const mode of modes) for (const precision of [128, 256, 512, 1024]) {
    for (const [channel, name] of ['rTRC', 'gTRC', 'bTRC', 'kTRC'].entries()) {
      const input = (t, values, kind = 'curv', fn = 0) => inputFor(name, t, values, kind, fn, precision);
      for (const t of [[0n, 1n], [1n, 3n], [max - 1n, max], [1n, 1n]]) check(mode, input(t, []), channel, t);
      for (const n of [1n, max / 2n, max - 1n]) {
        check(mode, input([n, max], [0, 65535]), channel, [n, max]);
        check(mode, input([n, max], [65535, 0]), channel, [max - n, max]);
      }
      for (const [gamma, t, x] of [[256, [1n, 3n], [1n, 3n]], [512, [1n, 4n], [1n, 2n]], [128, [1n, 2n], [1n, 4n]], [1024, [1n, 16n], [1n, 2n]]]) check(mode, input(t, [gamma]), channel, x);
      // Independent exact expectations: two endpoint plateaus and linear interior.
      for (const t of [[0n, 1n], [1n, 2n], [1n, 1n]]) {
        check(mode, input(t, [0, 0, 65535, 65535]), channel, t[0] === 0n ? [1n, 3n] : t[0] === t[1] ? [2n, 3n] : [1n, 2n]);
        check(mode, input(t, [65535, 65535, 0, 0]), channel, t[0] === 0n ? [2n, 3n] : t[0] === t[1] ? [1n, 3n] : [1n, 2n]);
      }
      check(mode, input([0n, 1n], [100, 200]), channel, [0n, 1n]);
      check(mode, input([1n, 1n], [100, 200]), channel, [1n, 1n]);
      const para = input([1n, 4n], [131072], 'para');
      if (mode === v2) reject(mode, para, /InvalidIccTrcType/);
      else check(mode, para, channel, [1n, 2n]);
      reject(mode, input([0n, 1n], [0]), /NonInvertibleIccGamma/);
      reject(mode, input([0n, 1n], [0, 65535, 0]), /NonMonotonicIccCurve/);
      reject(mode, input([0n, 1n], [17, 17]), /ConstantIccCurve/);
    }
  }
  for (const [t, values, status, length] of [
    [[3n, 5n], [65536, 0, 0, 65536, 32768, 65536, 0], 0, 4],
    [[1n, 2n], [65536, 0, 0, 0, 32768, 65536, 0], 4, bits === 128 ? 152 : 216],
  ]) {
    const out = inspect(v4, inputFor('rTRC', t, values, 'para', 4), 0);
    assert.equal(out.readUInt32LE(), status); assert.equal(out.length, length);
    if (status === 0) unattained++; else ambiguous++;
  }
  const unknown = inspect(v4, inputFor('kTRC', [65537n * 65537n << BigInt(bits - 64), max], [131072, 65537, 0, 0, 1], 'para', 3, 128), 3);
  assert.deepEqual(unknown, Buffer.from([1, 0, 0, 0])); undecided++;
  for (const mode of modes) {
    const good = inputFor('gTRC', [1n, 4n], [512]);
    for (let n = 0; n < good.length; n++) reject(mode, good.subarray(0, n), /InvalidProbeInput|InvalidIcc/);
    reject(mode, good, /LimitExceeded/, good.length - 1);
    reject(mode, Buffer.concat([good, Buffer.alloc(1)]), /InvalidIcc/);
    for (const t of [[0n, 0n], [2n, 1n]]) reject(mode, inputFor('rTRC', t, []), /InvalidIccCurveCoordinate/);
    reject(mode, inputFor('RTRC', [0n, 1n], []), /UnhandledIccTrc/);
    reject(mode, inputFor('rTRC', [0n, 1n], [], 'curv', 0, 64), /InvalidIccComparisonPrecision/);
    check(mode, good, 1, [1n, 2n]);
  }
  return {selected, rejected, unattained, ambiguous, undecided};
}
