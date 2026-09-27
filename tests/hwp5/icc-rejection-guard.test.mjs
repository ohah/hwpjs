import assert from 'node:assert/strict';
import test from 'node:test';
import {expectedOracleError,expectedProbeError} from './icc.mjs';

test('ICC rejection guard distinguishes parser errors from host failures',()=>{
  assert.equal(expectedProbeError(Error('InvalidIccTagBounds')),true);
  assert.equal(expectedProbeError(Error('LimitExceeded')),true);
  assert.equal(expectedProbeError(new TypeError('InvalidIccTagBounds')),false);
  assert.equal(expectedProbeError(new RangeError('InvalidIccTagBounds')),false);
  assert.equal(expectedProbeError(new WebAssembly.RuntimeError('InvalidIccTagBounds')),false);
  assert.equal(expectedProbeError(Error('host failure')),false);
});

test('ICC oracle guard does not hide programming errors',()=>{
  assert.equal(expectedOracleError(new assert.AssertionError({message:'expected invalid input'})),true);
  const zlib=new Error('invalid deflate');zlib.code='Z_DATA_ERROR';
  assert.equal(expectedOracleError(zlib),true);
  const limit=new RangeError('buffer limit');limit.code='ERR_BUFFER_TOO_LARGE';
  assert.equal(expectedOracleError(limit),true);
  assert.equal(expectedOracleError(new TypeError('oracle bug')),false);
  assert.equal(expectedOracleError(new RangeError('oracle bug')),false);
});
