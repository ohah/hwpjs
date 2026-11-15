import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ABI_VERSION,
  REQUIRED_FUNCTIONS,
  EXPERIMENTAL_EDITOR_FUNCTIONS,
  HWPX_CHART_CREATE_PROFILE_FUNCTIONS,
} from '../../js/abi-schema.mjs';
const before = JSON.parse(
  readFileSync(new URL('./fixtures/chart-profile-abi-baseline-4e99.json', import.meta.url), 'utf8'),
);
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
test('profile query is optional ABI6 with identical current37f required/experimental exports', () => {
  assert.equal(ABI_VERSION, before.ABI_VERSION);
  assert.deepEqual(REQUIRED_FUNCTIONS, before.REQUIRED_FUNCTIONS);
  assert.deepEqual(EXPERIMENTAL_EDITOR_FUNCTIONS, before.EXPERIMENTAL_EDITOR_FUNCTIONS);
  assert.deepEqual(HWPX_CHART_CREATE_PROFILE_FUNCTIONS, ['hwpx_edit_chart_create_profile_version']);
  assert.equal(REQUIRED_FUNCTIONS.includes(HWPX_CHART_CREATE_PROFILE_FUNCTIONS[0]), false);
  const source = readFileSync(new URL('../../src/wasm/hwpx_edit.zig', import.meta.url), 'utf8');
  const addition =
    /\/\/ Optional pure version query\. No session\/history\/output allocation or mutation\.\n\/\/ This is candidate source, not a claim about the currently deployed engine\.\nexport fn hwpx_edit_chart_create_profile_version\(\) u32 \{\n    return @import\("\.\.\/hwpx\/chart_create_profile.zig"\)\.wire_version;\n\}\n/;
  assert(addition.test(source));
  assert.equal(
    [...source.matchAll(/\bexport fn hwpx_edit_chart_create_profile_version\(/g)].length,
    1,
    'the pure optional version query is declared exactly once',
  );
  // This test owns the ABI contract and the pure query, not every unrelated
  // bridge implementation byte. Geometry/history behavior has its own Native,
  // normal SDK and persisted-document regression tests.
});
test('public facade observes exact optional query and revocation without instantiating Native', async () => {
  const original = WebAssembly.instantiate;
  let version = 1,
    allocations = 0;
  const wasm = Object.fromEntries(
    [
      ...REQUIRED_FUNCTIONS,
      ...[
        'open',
        'close',
        'section_count',
        'can_edit',
        'splice',
        'save',
        'output_ptr',
        'output_len',
        'output_free',
      ].map((v) => 'hwpx_edit_' + v),
    ].map((name) => [name, () => 1]),
  );
  Object.assign(wasm, {
    memory: new WebAssembly.Memory({ initial: 1 }),
    hwpjs_abi_version: () => ABI_VERSION,
    cfb_alloc: () => {
      ++allocations;
      return 16;
    },
    cfb_free() {},
    hwpx_edit_create_chart: () => 1,
    hwpx_edit_chart_create_profile_version: () => version,
  });
  WebAssembly.instantiate = async () => ({ exports: wasm });
  try {
    const api = await createHwpxEditor(Object.create(WebAssembly.Module.prototype));
    assert.equal(api.chartCreateProfileVersion(), 1);
    assert.equal(api.supportsChartCreateProfileAbi(), true);
    assert.equal(allocations, 0);
    version = 2;
    assert.equal(api.chartCreateProfileVersion(), 0);
    assert.equal(api.supportsChartCreateProfileAbi(), false);
    delete wasm.hwpx_edit_chart_create_profile_version;
    assert.equal(api.chartCreateProfileVersion(), 0);
    api.close();
    assert.throws(() => api.chartCreateProfileVersion(), /EditorClosed/);
  } finally {
    WebAssembly.instantiate = original;
  }
});
