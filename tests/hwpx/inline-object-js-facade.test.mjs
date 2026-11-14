import test from 'node:test';
import assert from 'node:assert/strict';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { ABI_VERSION, REQUIRED_FUNCTIONS } from '../../js/abi-schema.mjs';
const eq = {
  section: 0,
  paragraph: 1,
  start: 1,
  expectedText: 'a😀b',
  script: 'x',
  width: 1,
  height: 1,
  baseLine: 85,
  baseUnit: 1000,
  version: 'v',
  font: 'f',
};
const chart = {
  target: { section: 0, paragraph: 1, unit: 1, expected_text: 'a😀b' },
  size: { width: 1, height: 1 },
  data: { categories: ['A'], series: [{ name: 'S', values: ['3'] }] },
};
test('public createHwpxEditor exposes real insertEquation/createChart facade with JS mock exports', async () => {
  const saved = WebAssembly.instantiate,
    calls = [];
  let allocs = 0,
    frees = 0;
  const memory = new WebAssembly.Memory({ initial: 1 });
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
      ].map((x) => 'hwpx_edit_' + x),
    ].map((k) => [k, () => 1]),
  );
  Object.assign(wasm, {
    memory,
    hwpjs_abi_version: () => ABI_VERSION,
    cfb_alloc: () => {
      allocs++;
      return 16;
    },
    cfb_free: () => {
      frees++;
    },
  });
  for (const key of ['hwpx_edit_insert_equation', 'hwpx_edit_create_chart'])
    wasm[key] = (ptr, size) => {
      calls.push([
        key,
        JSON.parse(new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, size))),
      ]);
      return 1;
    };
  // No module compile or WASM execution: only facade construction against mocked JS exports.
  WebAssembly.instantiate = async () => ({ exports: wasm });
  try {
    const api = await createHwpxEditor(Object.create(WebAssembly.Module.prototype));
    assert.equal(api.insertEquation(eq).application, 'applied');
    assert.equal(api.createChart(chart).application, 'applied');
    assert.deepEqual(calls, [
      ['hwpx_edit_insert_equation', eq],
      ['hwpx_edit_create_chart', chart],
    ]);
    assert.equal(allocs, 2);
    assert.equal(frees, 2);
    api.close();
    assert.throws(() => api.insertEquation(eq), /EditorClosed/);
    delete wasm.hwpx_edit_create_chart;
    delete wasm.hwpx_edit_insert_equation;
    const old = await createHwpxEditor(Object.create(WebAssembly.Module.prototype));
    assert.equal(old.supportsEquationInsertionAbi(), false);
    assert.equal(old.supportsChartCreationAbi(), false);
    assert.throws(() => old.insertEquation(eq), /Unavailable/);
    assert.throws(() => old.createChart(chart), /Unavailable/);
    assert.equal(allocs, 2);
    old.close();
  } finally {
    WebAssembly.instantiate = saved;
  }
});
