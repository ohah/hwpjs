import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import {
  createWasmModuleLoader,
  readKnownNativeModule,
} from '../../packages/core/src/wasm-module-loader.ts';
import { allowsOwnerWindowProjection } from '../../packages/core/src/internal/native-runtime-origin.ts';
const path = process.env.HWPJS_TEST_WASM;
assert(
  typeof path === 'string' &&
    isAbsolute(path) &&
    !path.split('/').includes('..') &&
    !/hwpers|title-column-roundtrip/i.test(path),
);
const pin = process.env.HWPJS_TEST_WASM_SHA256;
assert.match(pin ?? '', /^[a-f0-9]{64}$/);
const bytes = await readFile(path);
assert.equal(createHash('sha256').update(bytes).digest('hex'), pin);
test('integrated actual Native enters the product known owner-window profile without registration hooks', async () => {
  const module = await createWasmModuleLoader({ fetch: async () => new Response(bytes) })();
  const contract = readKnownNativeModule(module);
  assert.equal(contract?.sha256, pin);
  assert.equal(allowsOwnerWindowProjection(contract), true);
});
test('same bytes compiled directly stay unregistered and unknown digest cannot enter the owner profile', async () => {
  const module = await WebAssembly.compile(bytes);
  assert.equal(readKnownNativeModule(module), undefined);
  assert.equal(
    allowsOwnerWindowProjection({
      contract: 'hwp5-exclusive-text-delta-v1',
      sha256: 'f'.repeat(64),
    }),
    false,
  );
});
