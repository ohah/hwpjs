import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
} from '../../src/index.ts';
import { createReaderRuntimeFactory } from '../../src/runtime.ts';

const requiredPath = (name: string): string => {
  const value =
    process.env[name] ??
    (name === 'HWPJS_TEST_HWP5_FIXTURE'
      ? fileURLToPath(
          new URL('../../../../apps/docs/docs/public/editor/fixtures/noori.hwp', import.meta.url),
        )
      : name === 'HWPJS_TEST_HWPX_FIXTURE'
        ? fileURLToPath(
            new URL(
              '../../../../apps/docs/docs/public/editor/fixtures/noori.hwpx',
              import.meta.url,
            ),
          )
        : undefined);
  if (!value) throw Error(`${name}Required`);
  if (
    /title-column-roundtrip\.test\.mjs|hwpers_test4_complex_table\.hwp|[/\\]legacy[/\\]hwpers(?:[/\\]|$)/.test(
      value,
    )
  )
    throw Error('ProtectedFixtureDenied');
  return value;
};

for (const format of ['hwp5', 'hwpx'] as const) {
  test(`${format} readonly query preserves capability and reference authority`, async () => {
    const wasmModule = await WebAssembly.compile(
      new Uint8Array(await readFile(requiredPath('HWPJS_TEST_WASM'))),
    );
    const original = new Uint8Array(
      await readFile(
        requiredPath(format === 'hwp5' ? 'HWPJS_TEST_HWP5_FIXTURE' : 'HWPJS_TEST_HWPX_FIXTURE'),
      ),
    );
    const preserved = original.slice();
    const editor = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
    try {
      await editor.load(original, { format, editable: false });
      const state = editor.getEditorState();
      const target = createParagraphSelection(state, {
        section: 0,
        paragraph: 15,
        startUnit: 0,
        endUnit: 0,
      });
      const capabilities = await editor.getFormattingCapabilities();
      if (process.env.HWPJS_REQUIRE_ATOMIC_FORMATTING === '1')
        assert.equal(capabilities.atomic, true, 'AtomicFormattingEngineRequired');
      const fields = ['paragraph.alignment', 'paragraph.grid'] as const;
      if (capabilities.atomic) {
        const query = await editor.queryFormatting(target, { fields: [...fields] });
        assert.deepEqual(Object.keys(query.observations.aggregate).sort(), [...fields].sort());
        for (const field of fields) {
          const value = query.observations.aggregate[field];
          assert.equal(value.state, 'known');
          assert.equal(value.writable, false);
          assert.equal(value.writeUnavailableReason, 'HistoryNotEnabled');
        }
      } else {
        await assert.rejects(
          editor.queryFormatting(target, { fields: [...fields] }),
          (error: unknown) =>
            error instanceof Error &&
            [capabilities.reason, 'UnsupportedFormattingReference'].includes(error.message),
        );
      }
      assert.equal(editor.getEditorState(), state);
      const rejected = await editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
        target,
        selectionVersion: state.stateVersion,
        patch: { paragraph: { alignment: 'RIGHT' } },
      });
      assert.equal(rejected.status, 'rejected-unapplied');
      assert.equal(rejected.error, 'ReadOnlyDocument');
      assert.equal(editor.getEditorState(), state);
      if (capabilities.atomic) {
        await editor.load(original, { format, editable: false });
        await assert.rejects(
          editor.queryFormatting(target, { fields: [...fields] }),
          /StaleTarget/,
        );
        const next = createParagraphSelection(editor.getEditorState(), {
          section: 0,
          paragraph: 15,
          startUnit: 0,
          endUnit: 0,
        });
        const renewed = await editor.queryFormatting(next, { fields: [...fields] });
        assert.equal(renewed.observations.aggregate['paragraph.alignment'].writable, false);
      }
      assert.deepEqual(original, preserved);
    } finally {
      await editor.dispose();
    }
  });
}
