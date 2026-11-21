import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as core from '../../packages/hwpjs/dist/index.js';
import * as runtime from '../../packages/hwpjs/dist/runtime.js';

const fixtures = new URL('../../apps/docs/docs/public/editor/fixtures/', import.meta.url);
const images = new URL('../../src/testing/fixtures/image-source-crop/', import.meta.url);
const wasm = await readFile(new URL('../../packages/hwpjs/dist/hwpjs.wasm', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.match(process.env.HWPJS_TEST_WASM_EXPECTED_SHA256 ?? '', /^[0-9a-f]{64}$/);
assert.equal(sha256(wasm), process.env.HWPJS_TEST_WASM_EXPECTED_SHA256);
const module = await runtime.createWasmModuleLoader({ fetch: async () => new Response(wasm) })();

// Whole-file hashes independently checked against the CFB and ZIP/XML
// structures after insertion from these public blank fixtures.
const savedFiles = [
  ['hwp5', 'png', '6b2010227e9d6cd41c242e0a29281eddb58f8f618c5df137c4ca3d518665dda2'],
  ['hwp5', 'jpg', 'b90fa62b8dbd41c1cbee11322dc7bf96f16050a5ca3bfb7c1ca92ec7c13d6e32'],
  ['hwpx', 'png', '3beb9964f3a194f9d54ecac8ccc11949d1289fa141487028f6d070fd2b4ef255'],
  ['hwpx', 'jpg', '2917e05616ab6d2b149554a06ecbce53492f812f0c00931c687dc2ebe35814c7'],
];

for (const [format, extension, expected] of savedFiles) {
  test(`public SDK inserts ${extension} into ${format} through save, undo, redo and fresh reopen`, async () => {
    const suffix = format === 'hwp5' ? 'hwp' : 'hwpx';
    const input = await readFile(new URL(`image-insert-blank.${suffix}`, fixtures));
    const image = await readFile(new URL(`own-quadrants.${extension}`, images));
    const editor = core.createEditor({
      runtimeFactory: runtime.createReaderRuntimeFactory({ wasmModule: module }),
    });
    const load = (bytes) => editor.load(new Uint8Array(bytes), { format, editable: true });
    const save = async (edited) =>
      Buffer.from(
        (await editor.save(edited && format === 'hwp5' ? { allowStaleLayout: true } : {})).bytes,
      );
    const state = () => editor.getEditorState();
    try {
      await load(input);
      assert.equal(state().status, 'ready');
      const first = state().content.paragraphs[0];
      assert.equal(first.text.replaceAll('\ufffc', ''), '');
      await editor.setSelection(
        core.createParagraphSelection(state(), {
          section: first.section,
          paragraph: first.paragraph,
          startUnit: first.text.length,
        }),
      );
      const target =
        format === 'hwp5'
          ? state().selection
          : await editor.getInlineObjectInsertTarget(
              { section: first.section, paragraph: first.paragraph + 1 },
              first.text.length,
            );
      const result = await editor.dispatchCommand(core.INSERT_IMAGE_COMMAND, {
        target,
        selectionVersion: state().stateVersion,
        options: { imageBytes: new Uint8Array(image), width: 7200, height: 3600 },
      });
      assert.equal(result.status, 'committed-with-snapshot');
      assert.equal(state().nativeHistoryRevision, 1);
      const saved = await save(true);
      assert.equal(sha256(saved), expected);
      await editor.undo();
      assert.deepEqual(await save(false), input);
      await editor.redo();
      assert.deepEqual(await save(true), saved);
      await load(saved);
      assert.equal(state().nativeHistoryRevision, 0);
      assert.deepEqual(await save(false), saved);
    } finally {
      await editor.dispose();
    }
  });
}
