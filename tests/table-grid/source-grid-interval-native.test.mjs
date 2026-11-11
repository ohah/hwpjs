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
import { cases } from '../helpers/source-grid-interval-cases.mjs';
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
  for (const mode of ['interval-conflict', 'interval-nonpositive'])
    test(`${format} ${mode}: Native rejects without source/history mutation`, async () => {
      const { createExperimentalHwp5Editor } = await import('../../js/hwp5-editor.mjs');
      const { createHwpxEditor } = await import('../../js/hwpx-editor.mjs');
      const source = new Uint8Array(
        readFileSync(new URL(mode + '.' + (format === 'hwp5' ? 'hwp' : 'hwpx'), root)),
      );
      const n =
        format === 'hwp5'
          ? await createExperimentalHwp5Editor(module, source)
          : await createHwpxEditor(module);
      if (format === 'hwpx') n.open(source);
      try {
        n.enableHistoryV2();
        const node = n.tableBindings(0)[0].tableNode;
        assert.throws(
          () =>
            n.editSourceTableGrid({
              section: 0,
              tableNode: node,
              expectedRows: 3,
              expectedColumns: 3,
              action: 'insert-row',
              index: 1,
              ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
            }),
          /UnsupportedSourceTableGrid|UnsupportedSourceTableGeometry/,
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
