// Shared test boundary: explicit fresh WASM only; no discovery or stale fallback.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve, join } from 'node:path';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import {
  createWasmModuleLoader,
  readKnownNativeModule,
} from '../../packages/core/src/wasm-module-loader.ts';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const path = process.env.HWPJS_TEST_WASM;
const expected = process.env.HWPJS_TEST_WASM_SHA256;
assert.ok(
  path && isAbsolute(path) && path.endsWith('.wasm'),
  'explicit absolute HWPJS_TEST_WASM mandatory',
);
assert.ok(!/hwpers|title-column-roundtrip/.test(path), 'excluded input before access');
assert.match(expected ?? '', /^[0-9a-f]{64}$/, 'explicit HWPJS_TEST_WASM_SHA256 mandatory');
const bytes = readFileSync(path);
assert.equal(hash(bytes), expected, 'main-granted WASM SHA');
export const module = await createWasmModuleLoader({
  url: 'https://table-appearance-test.invalid/pinned.wasm',
  fetch: async () =>
    new Response(Uint8Array.from(bytes), { headers: { 'Content-Type': 'application/wasm' } }),
})();
assert.equal(
  readKnownNativeModule(module)?.sha256,
  expected,
  'official loader must recognize this exact granted module',
);
export const wasmSha256 = expected;
export const evidence = resolve(
  'zig-out/verification/table-range-new-document-r1/integration',
  `native-${process.pid}-${Date.now()}`,
);
mkdirSync(evidence, { recursive: true });
writeFileSync(
  join(evidence, 'identity.json'),
  JSON.stringify(
    {
      wasmPath: path,
      wasmSha256: expected,
      execution: 'actual SDK and ReaderCore; independent save oracle separate; UI not covered',
    },
    null,
    2,
  ),
);
export const targets = Object.freeze({
  hwp5: [
    { section: 0, tableNode: 20, listNode: 21 },
    { section: 0, tableNode: 20, listNode: 36 },
  ],
  hwpx: [
    { section: 0, tableNode: 59, listNode: 66, colorEncoding: 'colorref24' },
    { section: 0, tableNode: 59, listNode: 100, colorEncoding: 'colorref24' },
  ],
});
const pins = {
  hwp5: ['noori.hwp', 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f'],
  hwpx: ['noori.hwpx', '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab'],
};
export function fixture(format) {
  const [name, pin] = pins[format];
  const valuePath = process.env[format === 'hwp5' ? 'HWPJS_TEST_NOORI' : 'HWPJS_TEST_NOORI_HWPX'];
  assert.ok(valuePath && isAbsolute(valuePath), 'explicit allowed Noori fixture env mandatory');
  const aliases = [
    'legacy/rust/crates/hwp-core/tests/fixtures',
    'apps/docs/docs/public/editor/fixtures',
  ].map((dir) => resolve(dir, name));
  assert.ok(
    aliases.includes(valuePath),
    'only named public/legacy Noori aliases admitted before access',
  );
  const value = readFileSync(valuePath);
  assert.equal(hash(value), pin, `only pinned original ${name}`);
  return value;
}
export async function openSDK(format, input) {
  if (format === 'hwp5') return createExperimentalHwp5Editor(module, input);
  const editor = await createHwpxEditor(module);
  try {
    editor.open(input);
    return editor;
  } catch (error) {
    editor.close();
    throw error;
  }
}
export const saveSDK = (format, editor) =>
  Buffer.from(format === 'hwp5' ? editor.save({ allowStaleLayout: true }).bytes : editor.save());
export const owner = ({ section, tableNode, listNode }) => ({ section, tableNode, listNode });
export function artifact(name, bytes) {
  assert.match(name, /^[a-z0-9.-]+$/);
  writeFileSync(join(evidence, name), bytes);
  return { name, sha256: hash(bytes), bytes: bytes.length };
}
export function receipt(name, body) {
  return async () => {
    const result = { name, wasmSha256, status: 'running' };
    try {
      result.observations = await body();
      result.status = 'pass';
    } catch (error) {
      result.status = 'fail';
      result.error = String(error?.stack ?? error);
      throw error;
    } finally {
      writeFileSync(join(evidence, `${name}.json`), JSON.stringify(result, null, 2));
    }
  };
}
