import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime/reader-runtime.ts';
import { SPLICE_TEXT_COMMAND } from '../../packages/core/src/commands/commands.ts';
import { createParagraphSelection } from '../../packages/core/src/state/paragraph-selection.ts';
import {
  INSERT_EQUATION_COMMAND,
  CREATE_CHART_COMMAND,
  getInlineObjectInsertAvailability,
} from '../../packages/core/src/commands/inline-object-insert.ts';
import { compileInlineObjectCreationInputs } from './helpers/inline-object-creation-inputs.mjs';
const { module, old, seed: seedBytes, evidence: ev } = await compileInlineObjectCreationInputs();
const seed = new Uint8Array(seedBytes);
const equation = () => ({
  script: 'a < b & c',
  width: 6000,
  height: 2000,
  baseLine: 85,
  baseUnit: 1000,
  version: 'Equation Version 60',
  font: 'HYhwpEQ',
});
const chart = () => ({
  width: 20000,
  height: 12000,
  categories: ['한<&', '😀'],
  series: [
    { name: 'S<&', values: [1.5, -200] },
    { name: '둘', values: [0, 30] },
  ],
});
const save = async (name: string, bytes: Uint8Array) =>
  writeFile(new URL(name, ev), bytes, { flag: 'wx' });
const create = (wasmModule = module) =>
  createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
async function select(editor: any) {
  await editor.setSelection(
    createParagraphSelection(editor.getEditorState(), { section: 0, paragraph: 0, startUnit: 1 }),
  );
}
function payload(editor: any, options: any) {
  const state = editor.getEditorState();
  return { target: state.selection, selectionVersion: state.stateVersion, options };
}
for (const [kind, command, options] of [
  ['equation', INSERT_EQUATION_COMMAND, equation],
  ['chart', CREATE_CHART_COMMAND, chart],
] as const)
  test(`actual Core ${kind}: reused load availability, one v2 edge, save reopen undo redo`, async () => {
    const editor = create(),
      reopened = create();
    try {
      await editor.load(seed, { format: 'hwpx' });
      const initial = editor.getEditorState();
      assert.equal(initial.nativeHistoryStats?.protocolVersion, 2);
      assert.equal((initial.content as any).equationInsertionAvailable, true);
      assert.equal((initial.content as any).chartCreationAvailable, true);
      await select(editor);
      assert.equal(getInlineObjectInsertAvailability(editor.getEditorState(), kind).enabled, true);
      const before = (await editor.save()).bytes;
      await save(`core-${kind}-before.hwpx`, before);
      const previous = editor.getEditorState();
      const result = await editor.dispatchCommand(command as any, payload(editor, options()));
      assert.equal(result.status, 'committed-with-snapshot', JSON.stringify(result));
      const after = editor.getEditorState();
      assert.equal(after.nativeHistoryRevision, 1);
      assert.equal(after.nativeHistoryStats?.undoCount, 1);
      assert.equal(after.nativeHistoryStats?.redoCount, 0);
      assert.equal(after.operationRevision, previous.operationRevision + 1);
      const bytes = (await editor.save()).bytes;
      await save(`core-${kind}-after.hwpx`, bytes);
      const owned = bytes.slice();
      bytes.fill(0);
      assert.deepEqual((await editor.save()).bytes, owned);
      await reopened.load(owned, { format: 'hwpx' });
      assert.equal(reopened.getEditorState().status, 'ready');
      await save(`core-${kind}-reopened.hwpx`, (await reopened.save()).bytes);
      assert.equal((await editor.undo()).status, 'committed-with-snapshot');
      assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
      await save(`core-${kind}-undo.hwpx`, (await editor.save()).bytes);
      assert.equal((await editor.redo()).status, 'committed-with-snapshot');
      assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
      await save(`core-${kind}-redo.hwpx`, (await editor.save()).bytes);
      await save(
        `core-${kind}-result.json`,
        new TextEncoder().encode(
          JSON.stringify(
            {
              status: result.status,
              before: previous.nativeHistoryStats,
              after: after.nativeHistoryStats,
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
test('actual Core queued capture owns arrays and second identical capture is rejected without second history edge', async () => {
  const editor = create();
  try {
    await editor.load(seed, { format: 'hwpx' });
    await select(editor);
    const options = chart(),
      capture = payload(editor, options);
    const first = editor.dispatchCommand(CREATE_CHART_COMMAND, capture);
    const second = editor.dispatchCommand(CREATE_CHART_COMMAND, capture);
    options.categories[0] = 'MUTATED';
    options.series[0].values[0] = 999;
    assert.equal((await first).status, 'committed-with-snapshot');
    assert.equal((await second).status, 'rejected-unapplied');
    assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
    assert.equal(editor.getEditorState().nativeHistoryStats?.undoCount, 1);
    await save('core-queued-chart.hwpx', (await editor.save()).bytes);
  } finally {
    await editor.dispose();
  }
});
test('actual Core update collector stops stale second creation with one native edge', async () => {
  const editor = create();
  try {
    await editor.load(seed, { format: 'hwpx' });
    await select(editor);
    const p = payload(editor, equation());
    const result = await editor.update((q) => {
      q.dispatchCommand(INSERT_EQUATION_COMMAND, p);
      q.dispatchCommand(INSERT_EQUATION_COMMAND, p);
    });
    assert.deepEqual(
      result.results.map((x) => x.status),
      ['committed-with-snapshot', 'rejected-unapplied'],
    );
    assert.equal(result.stoppedIndex, 1);
    assert.equal(editor.getEditorState().nativeHistoryStats?.undoCount, 1);
    await save('core-collected-equation.hwpx', (await editor.save()).bytes);
  } finally {
    await editor.dispose();
  }
});
for (const [label, wasmModule, history] of [
  ['old879', old, undefined],
  ['explicit-v1', module, { mode: 'legacy-v1' }],
] as const)
  test(`actual Core ${label}: insertion unavailable and bytes/history unchanged`, async () => {
    const editor = create(wasmModule);
    try {
      await editor.load(seed, { format: 'hwpx', ...(history ? { history } : {}) } as any);
      await select(editor);
      const before = (await editor.save()).bytes,
        stats = editor.getEditorState().nativeHistoryStats;
      assert.equal((editor.getEditorState().content as any).equationInsertionAvailable, false);
      assert.equal((editor.getEditorState().content as any).chartCreationAvailable, false);
      for (const [command, options] of [
        [INSERT_EQUATION_COMMAND, equation()],
        [CREATE_CHART_COMMAND, chart()],
      ] as const)
        assert.equal(
          (await editor.dispatchCommand(command as any, payload(editor, options))).status,
          'rejected-unapplied',
        );
      assert.deepEqual((await editor.save()).bytes, before);
      assert.deepEqual(editor.getEditorState().nativeHistoryStats, stats);
      await save(`core-${label}-unchanged.hwpx`, before);
    } finally {
      await editor.dispose();
    }
  });
test('actual Core rejected creation under explicit checkpoint budget preserves existing redo', async () => {
  const editor = create();
  try {
    await editor.load(seed, { format: 'hwpx', history: { maxCheckpointOwnedBytes: 1024 * 1024 } });
    await select(editor);
    assert.equal(
      (
        await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
          target: editor.getEditorState().selection as any,
          text: 'Z',
        })
      ).status,
      'committed-with-snapshot',
    );
    await editor.undo();
    await select(editor);
    const before = (await editor.save()).bytes,
      stats = editor.getEditorState().nativeHistoryStats;
    const result = await editor.dispatchCommand(
      INSERT_EQUATION_COMMAND,
      payload(editor, equation()),
    );
    console.log(
      JSON.stringify({
        cohort: 'actual-core-budget-rejection',
        status: result.status,
        error: result.error,
        nativeCode: (result.reply as any)?.formattingNativeCode,
      }),
    );
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal((result.reply as any)?.formattingNativeCode, 0);
    assert.deepEqual(editor.getEditorState().nativeHistoryStats, stats);
    assert.deepEqual((await editor.save()).bytes, before);
    assert.equal(editor.getEditorState().nativeHistoryStats?.redoCount, 1);
    await save('core-budget-rejected.hwpx', before);
    assert.equal((await editor.redo()).status, 'committed-with-snapshot');
    assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
    await save('core-budget-preserved-redo.hwpx', (await editor.save()).bytes);
    await save(
      'core-budget-rejection.json',
      new TextEncoder().encode(
        JSON.stringify(
          { status: result.status, error: result.error, reply: result.reply, beforeStats: stats },
          null,
          2,
        ),
      ),
    );
  } finally {
    await editor.dispose();
  }
});
