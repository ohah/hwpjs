import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_NATIVE_WASM_SHA256 =
  'd849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb';
const sha256 = (value) =>
  typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);

/** Omitted env preserves the pinned legacy CLI; malformed explicit values never fall back. */
export function nativeWasmExpectedSHA256(env = process.env) {
  const value = env.HWPJS_TEST_WASM_EXPECTED_SHA256;
  if (value === undefined) return DEFAULT_NATIVE_WASM_SHA256;
  assert(sha256(value), 'InvalidExpectedWasmSHA256');
  return value;
}

/** The official producer's files entry is the sole CI expectation. */
export function manifestWasmSHA256(manifest) {
  const value = manifest?.files?.['hwpjs.wasm'];
  assert(sha256(value), 'WasmManifestPinMissing');
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(
    process.argv.length === 4 && process.argv[2] === '--manifest',
    'ExplicitWasmManifestRequired',
  );
  const path = process.argv[3];
  assert(
    !/hwpers|title-column-roundtrip/i.test(path) && !path.split(/[\\/]/).includes('..'),
    'ProtectedBeforeAccess',
  );
  console.log(manifestWasmSHA256(JSON.parse(readFileSync(path, 'utf8'))));
}
