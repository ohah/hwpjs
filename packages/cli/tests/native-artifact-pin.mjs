import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LEGACY820_WASM_SHA256 =
  '82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc';
const isSHA256 = (value) =>
  typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);

// A declared expectation is independent of the tested bytes and their reported SHA.
export function nativeArtifactExpectedSHA256(env = process.env) {
  const value = env.HWPJS_TEST_WASM_EXPECTED_SHA256;
  if (value === undefined) return LEGACY820_WASM_SHA256;
  assert.ok(isSHA256(value), 'InvalidExpectedWasmSHA256');
  return value;
}

export function publicManifestWasmSHA256(manifest) {
  const value = manifest?.wasmSha256;
  assert.ok(isSHA256(value), 'InvalidPublicManifestWasmSHA256');
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(
    process.argv.length === 4 && process.argv[2] === '--manifest',
    'ExplicitPublicManifestRequired',
  );
  const path = process.argv[3];
  assert.ok(
    !/hwpers|title-column-roundtrip/i.test(path) && !path.split(/[\\/]/).includes('..'),
    'ProtectedBeforeAccess',
  );
  console.log(publicManifestWasmSHA256(JSON.parse(readFileSync(path, 'utf8'))));
}
