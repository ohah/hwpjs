import assert from 'node:assert/strict';
export function expectBmpError(run,pattern) {
  assert.throws(run,error=>error?.constructor===Error&&pattern.test(error.message));
}
export function isBmpOracleRejection(error) {
  return error instanceof assert.AssertionError||(error?.constructor===Error&&error.message==='missing EOB');
}
