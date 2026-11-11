import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import {
  createEditor,
  createParagraphSelection,
  getSelectionFormatting,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';

assert(
  process.env.HWPJS_TEST_WASM &&
    process.env.HWPJS_TEST_NARROW_SPLIT_WASM &&
    process.env.HWPJS_TEST_EVIDENCE,
  'ExplicitEmptyCaretInputsRequired',
);
const current = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
const oldBytes = readFileSync(process.env.HWPJS_TEST_NARROW_SPLIT_WASM);
assert.equal(
  createHash('sha256').update(oldBytes).digest('hex'),
  '8ab4d335f7fba4aa764ed3e1191c390f17ee80f053b9ada89748a490547d1980',
);
const old = await WebAssembly.compile(oldBytes);
const input = new Uint8Array(
  readFileSync(new URL('../../apps/docs/docs/public/editor/fixtures/page.hwp', import.meta.url)),
);
assert.equal(
  createHash('sha256').update(input).digest('hex'),
  '0677cebef471d6878e287fe72d199a2dcf3a147236caaa7c613990cf52fb3e67',
);
for (const editable of [true, false])
  test(
    'actual Core empty caret observes source without a character write: editable=' + editable,
    async (t) => {
      const editor = createEditor({
        runtimeFactory: createReaderRuntimeFactory({ wasmModule: current }),
      });
      t.after(() => editor.dispose());
      await editor.load(input, { format: 'hwp5', editable });
      await editor.setSelection(
        createParagraphSelection(editor.getEditorState(), {
          section: 0,
          paragraph: 4,
          startUnit: 0,
          endUnit: 0,
        }),
      );
      const before = editor.getEditorState(),
        observed = getSelectionFormatting(before);
      assert.equal(observed.size, 1000);
      assert.deepEqual(observed.fontNames.hangul, { kind: 'single', name: '바탕' });
      assert(observed.characterAvailableReason);
      assert.equal(editor.getEditorState(), before);
      if (editable) assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, input);
    },
  );
test('older Native proof remains unknown and query preserves its original bytes', async (t) => {
  const editor = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: old }) });
  t.after(() => editor.dispose());
  await editor.load(input, { format: 'hwp5', editable: true });
  await editor.setSelection(
    createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 4,
      startUnit: 0,
      endUnit: 0,
    }),
  );
  assert.equal(getSelectionFormatting(editor.getEditorState()).size, null);
  assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, input);
});
test('SDK empty proof and Unicode insertion retain original shape and exact history', async (t) => {
  const editor = await createExperimentalHwp5Editor(current, input);
  t.after(() => editor.close());
  editor.enableHistoryV2({});
  assert.deepEqual(editor.characterRanges(0, 4), [
    { start: 0, end: 0, charShapeId: 1, insertion: true },
  ]);
  assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, input);
  assert.equal(editor.historyRevision(), 0);
  editor.splice({ section: 0, paragraph: 4, startUnit: 0, endUnit: 0, text: '사😀' });
  const output = editor.save({ allowStaleLayout: true }).bytes;
  const directory = join(process.env.HWPJS_TEST_EVIDENCE, 'empty-unicode');
  mkdirSync(directory, { recursive: true });
  const before = join(directory, 'before.hwp'),
    after = join(directory, 'after.hwp');
  writeFileSync(before, input);
  writeFileSync(after, output);
  const oracle = new URL('./empty-caret-insert-oracle.py', import.meta.url).pathname;
  for (const flags of [[], ['-O']]) {
    execFileSync('python3', [...flags, oracle, before, after, '사😀', '1000'], { stdio: 'pipe' });
    assert.throws(
      () =>
        execFileSync('python3', [...flags, oracle, before, after, '사😀', '1100'], {
          stdio: 'pipe',
        }),
      (error) => error.status === 1,
    );
  }
  assert.equal(editor.historyRevision(), 1);
  assert.equal(editor.undo(), true);
  assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, input);
  assert.equal(editor.redo(), true);
  assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, output);
});
