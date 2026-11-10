import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifiedNativeContract,
  verifiedOwnerWindowProfile,
} from '../../src/internal/native-module-profiles.ts';
import { allowsOwnerWindowProjection } from '../../src/internal/native-runtime-origin.ts';
import { readKnownNativeModule } from '../../src/wasm-module-loader.ts';
const older = [
  '8e0ff0d0e80f185f255024cb9d946b0469648fd5eb175ef6c7aa3562124c91ff',
  'a38f4df7993c8f645fd28fd13df0108f9be4ba5ca55736e76e334d7d8968343f',
];
const current = '202fc55283b670ea7c695ef3a326a0e6b8c86af3def7232c8e5bfab003699389';
test('verified profile preserves known-only and owner-window tiers', () => {
  for (const sha of older) {
    assert(verifiedNativeContract(sha));
    assert.equal(verifiedOwnerWindowProfile(sha), false);
  }
  for (const sha of [
    current,
    'e2e0333e3e703328a970126aab88e9d2a302a7fb1897e6822cc15b727f4684cc',
    '28d2f91917e81d0522ffe04d6ddff150aee2ad815a9ed1ed6d470af905aaacca',
    'fee47642df3a3626d3b37662e13d4130b02f44e1b86843b207ab6d64b99f3ab6',
    '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc',
  ]) {
    const contract = verifiedNativeContract(sha);
    assert(contract);
    assert.equal(contract.sha256, sha);
    assert(Object.isFrozen(contract));
    assert.equal(allowsOwnerWindowProjection(contract), true);
    assert.throws(() => {
      (contract as any).sha256 = '0'.repeat(64);
    });
  }
});
test('unknown profiles and metadata never register a caller-compiled module', async () => {
  for (const sha of ['', '0'.repeat(64), current.toUpperCase(), current + '\n']) {
    assert.equal(verifiedNativeContract(sha), undefined);
    assert.equal(verifiedOwnerWindowProfile(sha), false);
  }
  assert.equal(allowsOwnerWindowProjection(undefined), false);
  assert.equal(allowsOwnerWindowProjection({ contract: 'other', sha256: current } as any), false);
  verifiedNativeContract(current);
  const module = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  assert.equal(readKnownNativeModule(module), undefined);
});
