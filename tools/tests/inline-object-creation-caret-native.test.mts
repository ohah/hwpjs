import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime/reader-runtime.ts';
import { createParagraphSelection } from '../../packages/core/src/state/paragraph-selection.ts';
import {
  getInlineObjectInsertAvailability,
  INSERT_EQUATION_COMMAND,
  CREATE_CHART_COMMAND,
} from '../../packages/core/src/commands/inline-object-insert.ts';
import {
  SPLICE_TEXT_COMMAND,
  INSERT_DOCUMENT_COMMAND,
} from '../../packages/core/src/commands/commands.ts';
import { currentDocumentInsertCaret } from '../../packages/core/src/commands/document-insert.ts';
import {
  compileInlineObjectCreationInputs,
  validateInlineObjectCaretFixtures,
} from './helpers/inline-object-creation-inputs.mjs';
const { module, evidence } = await compileInlineObjectCreationInputs();
const here = new URL('./fixtures/inline-object-caret/', import.meta.url);
validateInlineObjectCaretFixtures();
const create = () =>
  createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
const equation = () => ({
  script: 'a+b',
  width: 6000,
  height: 2000,
  baseLine: 85,
  baseUnit: 1000,
  version: 'Equation Version 60',
  font: 'HYhwpEQ',
});
const chart = () => ({
  width: 16000,
  height: 10000,
  categories: ['추가'],
  series: [{ name: '두 번째', values: [42] }],
});
const save = (name: string, bytes: Uint8Array) =>
  writeFile(new URL(name, evidence), bytes, { flag: 'wx' });
async function split(editor: any) {
  const result = await editor.requestExperimental(
    { kind: 'split', section: 0, paragraph: 0, atUnit: 1, endUnit: 1, anchored: true },
    { mutation: true, token: editor.getEditorState().token },
  );
  assert.equal(result.status, 'committed-with-snapshot');
}
async function select(editor: any, paragraph = 1, startUnit = 0) {
  await editor.setSelection(
    createParagraphSelection(editor.getEditorState(), { section: 0, paragraph, startUnit }),
  );
}
function payload(editor: any, options: any) {
  const state = editor.getEditorState();
  return { target: state.selection, selectionVersion: state.stateVersion, options };
}
for (const mode of ['saved', 'live'])
  for (const [kind, command, options] of [
    ['equation', INSERT_EQUATION_COMMAND, equation],
    ['chart', CREATE_CHART_COMMAND, chart],
  ] as const)
    test(`actual Core ${mode} empty second body: ${kind} single edge, save reopen undo redo`, async () => {
      const editor = create(),
        reopened = create();
      try {
        await editor.load(
          await readFile(
            new URL(
              `${mode === 'saved' ? 'caret-after-split' : 'chart-created-edited'}.hwpx`,
              here,
            ),
          ),
          { format: 'hwpx' },
        );
        if (mode === 'live') await split(editor);
        const row = (editor.getEditorState().content as any).paragraphs[1];
        assert.equal(row.text, '');
        assert.equal(row.plainEditable, mode === 'saved');
        if (mode === 'live') assert.equal(row.anchorEditable, true);
        await select(editor);
        assert.equal(
          getInlineObjectInsertAvailability(editor.getEditorState(), kind).enabled,
          true,
        );
        if (mode === 'live') {
          const s = editor.getEditorState();
          assert.throws(
            () => currentDocumentInsertCaret(s, s.selection as any, s.stateVersion),
            /UnsupportedDocumentInsertOwner/,
          );
          const strictBefore = (await editor.save()).bytes,
            strictStats = editor.getEditorState().nativeHistoryStats,
            current = editor.getEditorState();
          const strictResult = await editor.dispatchCommand(INSERT_DOCUMENT_COMMAND, {
            target: current.selection as any,
            selectionVersion: current.stateVersion,
            bytes: new Uint8Array(await readFile(new URL('caret-after-split.hwpx', here))),
          });
          assert.equal(strictResult.status, 'rejected-unapplied');
          assert.equal(strictResult.error, 'UnsupportedDocumentInsertOwner');
          assert.deepEqual(editor.getEditorState().nativeHistoryStats, strictStats);
          assert.deepEqual((await editor.save()).bytes, strictBefore);
        }
        const before = (await editor.save()).bytes,
          previous = editor.getEditorState();
        await save(`${mode}-${kind}-before.hwpx`, before);
        const result = await editor.dispatchCommand(command as any, payload(editor, options()));
        assert.equal(result.status, 'committed-with-snapshot', JSON.stringify(result));
        const after = editor.getEditorState();
        assert.equal(after.nativeHistoryRevision, previous.nativeHistoryRevision! + 1);
        assert.equal(
          after.nativeHistoryStats?.undoCount,
          previous.nativeHistoryStats!.undoCount! + 1,
        );
        assert.equal(after.nativeHistoryStats?.redoCount, 0);
        const bytes = (await editor.save()).bytes;
        await save(`${mode}-${kind}-after.hwpx`, bytes);
        await reopened.load(bytes, { format: 'hwpx' });
        await save(`${mode}-${kind}-reopened.hwpx`, (await reopened.save()).bytes);
        assert.equal((await editor.undo()).status, 'committed-with-snapshot');
        assert.equal(editor.getEditorState().nativeHistoryRevision, previous.nativeHistoryRevision);
        assert.deepEqual((await editor.save()).bytes, before);
        await save(`${mode}-${kind}-undo.hwpx`, (await editor.save()).bytes);
        assert.equal((await editor.redo()).status, 'committed-with-snapshot');
        assert.equal(editor.getEditorState().nativeHistoryRevision, after.nativeHistoryRevision);
        assert.deepEqual((await editor.save()).bytes, bytes);
        await save(`${mode}-${kind}-redo.hwpx`, (await editor.save()).bytes);
        await save(
          `${mode}-${kind}-result.json`,
          new TextEncoder().encode(
            JSON.stringify(
              {
                mode,
                kind,
                rowBefore: row,
                revisionBefore: previous.nativeHistoryRevision,
                revisionAfter: after.nativeHistoryRevision,
                status: result.status,
              },
              null,
              2,
            ),
          ),
        );
      } finally {
        await reopened.dispose();
        await editor.dispose();
      }
    });
test('actual Core nonempty anchored chart host is still unavailable for creation', async () => {
  const editor = create();
  try {
    await editor.load(await readFile(new URL('chart-created-edited.hwpx', here)), {
      format: 'hwpx',
    });
    await select(editor, 0, 1);
    const before = (await editor.save()).bytes,
      stats = editor.getEditorState().nativeHistoryStats;
    for (const [kind, command, options] of [
      ['equation', INSERT_EQUATION_COMMAND, equation],
      ['chart', CREATE_CHART_COMMAND, chart],
    ] as const) {
      assert.equal(getInlineObjectInsertAvailability(editor.getEditorState(), kind).enabled, false);
      assert.equal(
        (await editor.dispatchCommand(command as any, payload(editor, options()))).status,
        'rejected-unapplied',
      );
    }
    assert.deepEqual((await editor.save()).bytes, before);
    assert.deepEqual(editor.getEditorState().nativeHistoryStats, stats);
  } finally {
    await editor.dispose();
  }
});
test('actual Core duplicate queued captures on empty anchored row commit only once', async () => {
  const editor = create();
  try {
    await editor.load(await readFile(new URL('chart-created-edited.hwpx', here)), {
      format: 'hwpx',
    });
    await split(editor);
    await select(editor);
    const p = payload(editor, equation()),
      revision = editor.getEditorState().nativeHistoryRevision!;
    const first = editor.dispatchCommand(INSERT_EQUATION_COMMAND, p),
      second = editor.dispatchCommand(INSERT_EQUATION_COMMAND, p);
    assert.equal((await first).status, 'committed-with-snapshot');
    assert.equal((await second).status, 'rejected-unapplied');
    assert.equal(editor.getEditorState().nativeHistoryRevision, revision + 1);
  } finally {
    await editor.dispose();
  }
});
test('actual Core empty-anchor budget rejection preserves existing text redo', async () => {
  const editor = create();
  try {
    await editor.load(await readFile(new URL('chart-created-edited.hwpx', here)), {
      format: 'hwpx',
      history: { maxCheckpointOwnedBytes: 1024 * 1024 },
    });
    await split(editor);
    await select(editor);
    const spliced = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: editor.getEditorState().selection as any,
      text: 'X',
    });
    assert.equal((spliced as any).status, 'committed-with-snapshot');
    await editor.undo();
    await select(editor);
    const before = (await editor.save()).bytes,
      stats = editor.getEditorState().nativeHistoryStats;
    assert.equal((editor.getEditorState().content as any).paragraphs[1].text, '');
    assert.equal(stats?.redoCount, 1);
    assert.equal(
      getInlineObjectInsertAvailability(editor.getEditorState(), 'equation').enabled,
      true,
    );
    const result = await editor.dispatchCommand(
      INSERT_EQUATION_COMMAND,
      payload(editor, equation()),
    );
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(result.error, 'HistoryEntryOwnedLimitExceeded');
    assert.deepEqual(editor.getEditorState().nativeHistoryStats, stats);
    assert.deepEqual((await editor.save()).bytes, before);
    assert.equal((await editor.redo()).status, 'committed-with-snapshot');
    assert.equal((editor.getEditorState().content as any).paragraphs[1].text, 'X');
    await save('budget-preserved-redo.hwpx', (await editor.save()).bytes);
  } finally {
    await editor.dispose();
  }
});
