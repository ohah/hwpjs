import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  createEditor,
  EDIT_SOURCE_TABLE_GRID_COMMAND as GRID,
  UNDO_COMMAND,
  REDO_COMMAND,
  createParagraphSelection,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import { cases } from '../helpers/source-grid-cases.mjs';
import { sourceTableGridHistory } from '../../web/preview/source-table-grid-history.mjs';
assert(
  process.env.HWPJS_TEST_WASM && process.env.HWPJS_TEST_SOURCE_GRID_FIXTURE_DIR,
  'Explicit isolated WASM and fixture directory required',
);
const module = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
const root = pathToFileURL(process.env.HWPJS_TEST_SOURCE_GRID_FIXTURE_DIR + '/');
mkdirSync(new URL('native-evidence/', root), { recursive: true });
const save = async (e) => (await e.save({ allowStaleLayout: true })).bytes;
const command = (e, c) => e.dispatchCommand(c, { token: e.getEditorState().token });
for (const format of ['hwp5', 'hwpx'])
  for (const mode of Object.keys(cases))
    for (const [action, value] of Object.entries(cases[mode]))
      test(`${format} ${mode} ${action}: owned history and independent whole-file oracle`, async (t) => {
        const ext = format === 'hwp5' ? 'hwp' : 'hwpx';
        const original = new Uint8Array(readFileSync(new URL(mode + '.' + ext, root)));
        const editor = createEditor({
          runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
        });
        t.after(() => editor.dispose());
        await editor.load(original, { format, editable: true });
        assert.deepEqual(await save(editor), original);
        const table = editor.getEditorState().content.tables.at(-1);
        const request = {
          section: 0,
          tableNode: table.tableNode,
          expectedRows: 3,
          expectedColumns: 3,
          action,
          index: value.index,
          ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
        };
        await editor.setSelection(
          createParagraphSelection(editor.getEditorState(), {
            section: 0,
            paragraph: table.cells[0].paragraphs[0],
            startUnit: 0,
            endUnit: 0,
          }),
        );
        const beforeState = editor.getEditorState();
        const r = await editor.dispatchCommand(GRID, request);
        assert.equal(r.status, 'committed-with-snapshot', r.error);
        assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
        const after = await save(editor);
        const bookmark = sourceTableGridHistory({
          before: beforeState,
          after: editor.getEditorState(),
          request,
        });
        assert(bookmark, 'actual Native snapshot produces a source history bookmark');
        const input = {
          format,
          table: mode === 'nested' ? 1 : 0,
          matrix: value.matrix,
          rowTemplates: value.rowTemplates,
          before: Buffer.from(original).toString('base64'),
          after: Buffer.from(after).toString('base64'),
        };
        for (const flags of [[], ['-O']]) {
          const out = JSON.parse(
            execFileSync(
              'python3',
              [
                ...flags,
                new URL('../../tools/source-table-grid-oracle.py', import.meta.url).pathname,
              ],
              { input: JSON.stringify(input) },
            ),
          );
          assert.equal(out.rows, value.matrix.length);
          const wrong = structuredClone(input);
          wrong.matrix = wrong.matrix.map((row) =>
            row.map((key) => key.replace(/[AI]/g, (c) => (c === 'A' ? 'I' : 'A'))),
          );
          assert.throws(
            () =>
              execFileSync(
                'python3',
                [
                  ...flags,
                  new URL('../../tools/source-table-grid-oracle.py', import.meta.url).pathname,
                ],
                { input: JSON.stringify(wrong), stdio: ['pipe', 'pipe', 'pipe'] },
              ),
            (e) => e.status !== 0,
          );
        }
        writeFileSync(new URL(`native-evidence/${format}-${mode}-${action}.${ext}`, root), after);
        await command(editor, UNDO_COMMAND);
        assert.deepEqual(await save(editor), original);
        await command(editor, REDO_COMMAND);
        assert.deepEqual(await save(editor), after);
        await editor.load(after, { format, editable: true });
        assert.deepEqual(await save(editor), after);
      });

for (const format of ['hwp5', 'hwpx'])
  for (const mode of ['ambiguous', 'protected-nested', 'outer-nested'])
    test(`${format} ${mode}: Native owns rejection, exact source and no history`, async () => {
      const { createExperimentalHwp5Editor } = await import('../../js/hwp5-editor.mjs');
      const { createHwpxEditor } = await import('../../js/hwpx-editor.mjs');
      const ext = format === 'hwp5' ? 'hwp' : 'hwpx';
      const source = new Uint8Array(
        readFileSync(new URL((mode === 'outer-nested' ? 'nested' : mode) + '.' + ext, root)),
      );
      const n =
        format === 'hwp5'
          ? await createExperimentalHwp5Editor(module, source)
          : await createHwpxEditor(module);
      if (format === 'hwpx') n.open(source);
      try {
        n.enableHistoryV2();
        const nodes = [...new Set(n.tableBindings(0).map((c) => c.tableNode))];
        assert(nodes.length > 0);
        const node = mode === 'outer-nested' ? nodes[0] : nodes.at(-1);
        const dimension = mode === 'outer-nested' ? 1 : 3;
        assert.throws(
          () =>
            n.editSourceTableGrid({
              section: 0,
              tableNode: node,
              expectedRows: dimension,
              expectedColumns: dimension,
              action: 'insert-row',
              index: 1,
              ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
            }),
          /Ambiguous|Unsupported|Protected/,
        );
        assert.equal(n.historyRevision(), 0);
        assert.equal(n.historyStats().undoCount, 0);
        assert.equal(n.historyStats().poisoned, false);
        assert.deepEqual(
          format === 'hwp5' ? n.save({ allowStaleLayout: true }).bytes : n.save(),
          source,
        );
      } finally {
        n.close();
      }
    });
for (const format of ['hwp5', 'hwpx'])
  test(`${format}: refusal that would erase track witnesses keeps exact bytes and undo/redo`, async (t) => {
    const source = new Uint8Array(
      readFileSync(new URL('vertical.' + (format === 'hwp5' ? 'hwp' : 'hwpx'), root)),
    );
    const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
    t.after(() => e.dispose());
    await e.load(source, { format, editable: true });
    const request = (action, index) => {
      const table = e.getEditorState().content.tables[0];
      return {
        section: 0,
        tableNode: table.tableNode,
        expectedRows: table.rows,
        expectedColumns: table.columns,
        action,
        index,
        ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
      };
    };
    assert.equal(
      (await e.dispatchCommand(GRID, request('delete-column', 2))).status,
      'committed-with-snapshot',
    );
    const before = await save(e);
    const rejected = await e.dispatchCommand(GRID, request('delete-column', 1));
    assert.equal(rejected.status, 'rejected-unapplied');
    assert.equal(rejected.error, 'AmbiguousSourceTableTracks');
    assert.equal(e.getEditorState().nativeHistoryRevision, 1);
    assert.deepEqual(await save(e), before);
    await command(e, UNDO_COMMAND);
    assert.deepEqual(await save(e), source);
    await command(e, REDO_COMMAND);
    assert.deepEqual(await save(e), before);
  });
for (const format of ['hwp5', 'hwpx'])
  test(`${format}: after a real commit a mismatched reply requires refresh and never retries`, async (t) => {
    const { createReaderEditorRuntime } = await import('../../packages/core/src/runtime.ts');
    const actual = createReaderEditorRuntime({ wasmModule: module });
    let writes = 0;
    const runtime = {
      async request(m, c) {
        const reply = await actual.request(m, c);
        if (m.kind === 'source-table-grid') {
          writes++;
          return { ...reply, kind: 'wrong-grid-reply' };
        }
        return reply;
      },
      dispose: () => actual.dispose(),
    };
    const e = createEditor({ runtimeFactory: () => runtime });
    t.after(() => e.dispose());
    const source = new Uint8Array(
      readFileSync(new URL('regular.' + (format === 'hwp5' ? 'hwp' : 'hwpx'), root)),
    );
    await e.load(source, { format, editable: true });
    const table = e.getEditorState().content.tables[0];
    const request = {
      section: 0,
      tableNode: table.tableNode,
      expectedRows: 3,
      expectedColumns: 3,
      action: 'insert-row',
      index: 1,
      ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
    };
    assert.equal((await e.dispatchCommand(GRID, request)).status, 'committed-refresh-required');
    assert.equal(writes, 1);
    assert.equal((await e.dispatchCommand(GRID, request)).status, 'rejected-unapplied');
    assert.equal(writes, 1);
    await e.refresh();
    assert.equal(e.getEditorState().nativeHistoryRevision, 1);
    assert.equal(e.getEditorState().content.tables[0].rows, 4);
    assert.equal(writes, 1);
    await command(e, UNDO_COMMAND);
    assert.deepEqual(await save(e), source);
  });
