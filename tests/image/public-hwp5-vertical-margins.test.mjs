import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as core from '../../packages/hwpjs/dist/index.js';
import * as runtime from '../../packages/hwpjs/dist/runtime.js';

const fixtures = new URL('../../apps/docs/docs/public/editor/fixtures/', import.meta.url);
const wasm = await readFile(new URL('../../packages/hwpjs/dist/hwpjs.wasm', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.match(process.env.HWPJS_TEST_WASM_EXPECTED_SHA256 ?? '', /^[0-9a-f]{64}$/);
assert.equal(sha256(wasm), process.env.HWPJS_TEST_WASM_EXPECTED_SHA256);
const installed = await runtime.createWasmModuleLoader({
  fetch: async () => new Response(wasm),
})();
const unverified = await WebAssembly.compile(wasm);

// The expected outputs were verified independently: only the two signed
// outer-margin words in Section0 may change.
const cases = [
  [
    'picture',
    11,
    '3052312cbf0d379b32af378a12cbc3b8b913d23770043744a2a1c56d214d308f',
    '5792f7ec3ba1f6833588be856bd09bef46bc95b7a4a72130a0cb5388d1c67d7f',
  ],
  [
    'textbox',
    12,
    '33cd713be59fb751dc9af6f6f9aeda2995015fcf64972c8763cf9721e77114cc',
    '1db299e19ca8488e53397d90ad9cc83ac65b94045a400e0386df924a72292271',
  ],
];

for (const [kind, node, inputSha, editedSha] of cases) {
  const input = await readFile(new URL(`hwp5-${kind}-vertical-margins.hwp`, fixtures));
  assert.equal(sha256(input), inputSha);
  const selector = { section: 0, kind, node };

  test(`public HWP5 ${kind} vertical margins save and round trip`, async () => {
    const editor = core.createEditor({
      runtimeFactory: runtime.createReaderRuntimeFactory({ wasmModule: installed }),
    });
    const load = (bytes) => editor.load(bytes, { format: 'hwp5', editable: true });
    const save = async () => Buffer.from((await editor.save({ allowStaleLayout: true })).bytes);
    try {
      await load(input);
      const before = await save();
      const result = await editor.getHwp5VerticalMargins(selector);
      assert.equal(result.state, 'available');
      assert.deepEqual(
        [
          result.observation.left,
          result.observation.right,
          result.observation.top,
          result.observation.bottom,
        ],
        [0, 0, 0, 0],
      );
      const update = await editor.dispatchCommand(core.SET_HWP5_VERTICAL_MARGINS_COMMAND, {
        target: result.target,
        top: 750,
        bottom: 1500,
      });
      assert.equal(update.status, 'committed-with-snapshot');
      const edited = await save();
      assert.equal(sha256(edited), editedSha);
      await editor.undo();
      assert.deepEqual(await save(), before);
      await editor.redo();
      assert.deepEqual(await save(), edited);
      await load(edited);
      const reopened = await editor.getHwp5VerticalMargins(selector);
      assert.equal(reopened.state, 'available');
      assert.deepEqual(reopened.observation, { ...result.observation, top: 750, bottom: 1500 });
    } finally {
      await editor.dispose();
    }
  });

  test(`unverified module cannot edit public HWP5 ${kind} vertical margins`, async () => {
    const editor = core.createEditor({
      runtimeFactory: runtime.createReaderRuntimeFactory({ wasmModule: unverified }),
    });
    try {
      await editor.load(input, { format: 'hwp5', editable: true });
      assert.equal(editor.getEditorState().status, 'ready');
      assert.equal((await editor.getHwp5VerticalMargins(selector)).state, 'unavailable');
    } finally {
      await editor.dispose();
    }
  });
}
