import assert from 'node:assert/strict';

export function jpegIdctInput(precision, values, transform = true) {
  assert.equal(values.length, 64);
  const out = Buffer.alloc(513); out[0] = precision;
  values.forEach((value, i) => transform ? out.writeBigInt64LE(BigInt(value), 1 + i * 8) : out.writeDoubleLE(value, 1 + i * 8));
  return out;
}

// Direct two-dimensional summation; no product basis table or separable pass.
export function jpegIdctReference(values) {
  if (values.slice(1).every(value => value === 0n || value === 0)) return Array(64).fill(Number(values[0]) / 8);
  return Array.from({length: 64}, (_, i) => {
    const x = i % 8, y = Math.floor(i / 8); let sum = 0;
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      sum += Number(values[v * 8 + u]) * (u ? 1 : Math.SQRT1_2) * (v ? 1 : Math.SQRT1_2)
        * Math.cos((2 * x + 1) * u * Math.PI / 16) * Math.cos((2 * y + 1) * v * Math.PI / 16) / 4;
    }
    return sum;
  });
}

export function jpegRestoredSample(value, precision) {
  assert.ok(Number.isFinite(value));
  return Math.max(0, Math.min(2 ** precision - 1, Math.floor(value + 2 ** (precision - 1) + 0.5)));
}

export function jpegIdctActual(call, precision, values) {
  const actual = call(257, jpegIdctInput(precision, values));
  return jpegIdctVerify(actual, precision, values);
}

export function jpegIdctVerify(actual, precision, values) {
  assert.equal(actual.length, 640);
  const expected = jpegIdctReference(values);
  // Absolute error budget scales with input L1 norm, not the output value:
  // cancellation must not disguise a transposition or a lost coefficient.
  const tolerance = Math.max(1e-12, values.reduce((sum, value) => sum + Math.abs(Number(value)), 0) * 1e-14);
  let maximumError = 0, referenceSampleDifferences = 0;
  for (let i = 0; i < 64; i++) {
    const centered = actual.readDoubleLE(i * 8), sample = actual.readUInt16LE(512 + i * 2);
    const error = Math.abs(centered - expected[i]);
    assert.ok(Number.isFinite(centered) && error <= tolerance, `IDCT position ${i}: ${error} > ${tolerance}`);
    assert.equal(sample, jpegRestoredSample(centered, precision));
    if (sample !== jpegRestoredSample(expected[i], precision)) referenceSampleDifferences++;
    maximumError = Math.max(maximumError, error);
  }
  return {maximumError, referenceSampleDifferences};
}

export function jpegIdctEdges(call) {
  let comparisons = 0, rejected = 0, maximumError = 0, referenceSampleDifferences = 0;
  const check = (precision, values) => {
    const result = jpegIdctActual(call, precision, values); comparisons++;
    maximumError = Math.max(maximumError, result.maximumError);
    referenceSampleDifferences += result.referenceSampleDifferences;
  };
  const reject = (mode, input, error, limit = 67108864) => { assert.throws(() => call(mode, input, limit), error); rejected++; };
  for (const precision of [8, 12]) {
    for (let dc = -32768; dc < 32768; dc++) { const values = Array(64).fill(0); values[0] = dc; check(precision, values); }
    for (let at = 0; at < 64; at++) for (const magnitude of [-8, 8, -2147483648, 2147483647]) {
      const values = Array(64).fill(0); values[at] = magnitude; check(precision, values);
    }
    for (const scale of [1, 1000000]) check(precision, Array.from({length: 64}, (_, i) => (((i * 37 + 11) % 257) - 128) * scale));
    for (let base = 0; base < 2 ** precision; base += 64) for (const delta of [0, 0.5, 0.5 - 1e-9]) {
      const values = Array.from({length: 64}, (_, i) => base + i - 2 ** (precision - 1) + delta);
      const actual = call(258, jpegIdctInput(precision, values, false)); assert.equal(actual.length, 128);
      values.forEach((value, i) => assert.equal(actual.readUInt16LE(i * 2), jpegRestoredSample(value, precision))); comparisons++;
    }
    for (const invalid of [NaN, Infinity, -Infinity]) for (let at = 0; at < 64; at++) {
      const values = Array(64).fill(0); values[at] = invalid;
      reject(258, jpegIdctInput(precision, values, false), /InvalidJpegSample/);
    }
  }
  const input = jpegIdctInput(8, Array(64).fill(0));
  for (const mode of [257, 258]) {
    for (let length = 0; length < input.length; length++) reject(mode, input.subarray(0, length), /UnexpectedEnd/);
    for (let precision = 0; precision < 256; precision++) if (precision !== 8 && precision !== 12) {
      const invalid = Buffer.from(input); invalid[0] = precision; reject(mode, invalid, /InvalidJpegPrecision/);
    }
    reject(mode, Buffer.concat([input, Buffer.of(0)]), /TrailingJpegTransformBytes/);
  }
  reject(257, input, /LimitExceeded/, 639);
  reject(258, input, /LimitExceeded/, 512);
  return {comparisons, rejected, maximumError, referenceSampleDifferences};
}
