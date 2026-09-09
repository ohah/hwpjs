import assert from 'node:assert/strict';
import {jpegFrameDequantOracle} from './jpeg-frame-dequant.mjs';
import {jpegSequentialScans} from './jpeg-scan.mjs';
import {jpegFrameInput, jpegFrameFixture} from './jpeg-frame.mjs';
import {jpegIdctVerify} from './jpeg-idct.mjs';

export function jpegFrameSamplesActual(call, raw) {
  const parsed = jpegSequentialScans(raw);
  if (parsed.deferred) return {deferred: true};
  const expected = jpegFrameDequantOracle(raw), actual = call(259, jpegFrameInput(raw));
  const blocks = expected.readUInt32LE(20), precision = parsed.frame[0];
  assert.equal(actual.length, 36 + blocks * 660);
  assert.deepEqual(actual.subarray(0, 36), expected.subarray(0, 36));
  let maximumError = 0, referenceSampleDifferences = 0;
  for (let block = 0; block < blocks; block++) {
    const source = 36 + block * 664, target = 36 + block * 660;
    assert.deepEqual(actual.subarray(target, target + 16), expected.subarray(source, source + 16));
    assert.equal(actual.readUInt32LE(target + 16), precision);
    const values = Array.from({length: 64}, (_, i) => expected.readBigInt64LE(source + 152 + i * 8));
    const result = jpegIdctVerify(actual.subarray(target + 20, target + 660), precision, values);
    maximumError = Math.max(maximumError, result.maximumError);
    referenceSampleDifferences += result.referenceSampleDifferences;
  }
  return {deferred: false, blocks, maximumError, referenceSampleDifferences};
}

export function jpegFrameSamplesEdges(call) {
  let comparisons = 0, rejected = 0, referenceSampleDifferences = 0;
  for (const groups of [[[0,1,2]], [[2],[0],[1]], [[0,2],[1]]])
    for (const precision of [8,12]) for (const interval of [0,1,3])
      for (const dnl of [false,true]) for (const redefine of [false,true]) {
        const result = jpegFrameSamplesActual(call, jpegFrameFixture({groups, precision, interval, dnl, redefine}));
        comparisons++; referenceSampleDifferences += result.referenceSampleDifferences;
      }
  const raw = jpegFrameFixture({width:1, height:1, sampling:[17,17,17]});
  assert.throws(() => call(259, jpegFrameInput(raw), 36 + 3 * 660 - 1), /LimitExceeded/); rejected++;
  return {comparisons, rejected, referenceSampleDifferences};
}
