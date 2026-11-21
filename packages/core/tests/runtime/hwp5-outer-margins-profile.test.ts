import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifiedNativeContract,
  verifiedOwnerWindowProfile,
} from '../../src/internal/native-module-profiles.ts';
const candidate = '031f96d83972292860db24bd0bcdd9cdbd79af130f43ecd1ef43e50b98affbc7';
const older = '6e10907b7d9105e96d9ade30968e775cb1e636bc3dfc5e079bc6638409696064';
test('controlled H5 margins candidate keeps the exact prior owner-window contract shape', () => {
  for (const sha of [candidate, older]) {
    const value = verifiedNativeContract(sha);
    assert(value);
    assert.equal(value.contract, 'hwp5-exclusive-text-delta-v1');
    assert.equal(value.sha256, sha);
    assert.deepEqual(Object.keys(value).sort(), ['contract', 'sha256']);
    assert(Object.isFrozen(value));
    assert.equal(verifiedNativeContract(sha), value);
    assert.equal(verifiedOwnerWindowProfile(sha), true);
  }
});
test('candidate lookup does not admit unknown or malformed content identities', () => {
  for (const sha of [
    '',
    '0'.repeat(64),
    candidate.toUpperCase(),
    candidate + '\n',
    candidate.slice(0, -1) + '8',
  ]) {
    assert.equal(verifiedNativeContract(sha), undefined);
    assert.equal(verifiedOwnerWindowProfile(sha), false);
  }
});
test('known-only historical profiles retain refusal of owner-window preference', () => {
  for (const sha of [
    '8e0ff0d0e80f185f255024cb9d946b0469648fd5eb175ef6c7aa3562124c91ff',
    'a38f4df7993c8f645fd28fd13df0108f9be4ba5ca55736e76e334d7d8968343f',
  ]) {
    assert(verifiedNativeContract(sha));
    assert.equal(verifiedOwnerWindowProfile(sha), false);
  }
});
