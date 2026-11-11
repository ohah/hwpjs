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
import { cases as regularCases } from '../helpers/source-grid-cases.mjs';
const cases = Object.fromEntries(
  ['caption-top-before', 'caption-bottom-before', 'caption-top-after', 'caption-bottom-after'].map(
    (profile) => [profile, regularCases.nested],
  ),
);
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
  for (const mode of Object.keys(cases).filter(
    (mode) => format === 'hwpx' || !mode.endsWith('-after'),
  ))
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
        const originalCaption = captionSnapshot(editor.getEditorState());
        assert.equal(editor.getEditorState().capabilities.sourceTableGridAvailable, true);
        assert.equal(editor.getEditorState().content.sourceTableGridAvailable, true);
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
        assert.deepEqual(captionSnapshot(editor.getEditorState()), originalCaption);
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
                new URL('../../tools/source-table-grid-caption-oracle.py', import.meta.url)
                  .pathname,
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
                  new URL('../../tools/source-table-grid-caption-oracle.py', import.meta.url)
                    .pathname,
                ],
                { input: JSON.stringify(wrong), stdio: ['pipe', 'pipe', 'pipe'] },
              ),
            (e) => e.status !== 0,
          );
        }

        if (action === 'insert-row') {
          const tampered = execFileSync(
            'python3',
            [
              '-B',
              new URL('../helpers/source-grid-caption-fixtures.py', import.meta.url).pathname,
              '--tamper',
              ext,
            ],
            { input: after },
          );
          for (const flags of [[], ['-O']])
            assert.throws(
              () =>
                execFileSync(
                  'python3',
                  [
                    ...flags,
                    new URL('../../tools/source-table-grid-caption-oracle.py', import.meta.url)
                      .pathname,
                  ],
                  {
                    input: JSON.stringify({ ...input, after: tampered.toString('base64') }),
                    stdio: ['pipe', 'pipe', 'pipe'],
                  },
                ),
              (e) => e.status === 1,
            );
        }
        writeFileSync(new URL(`native-evidence/${format}-${mode}-${action}.${ext}`, root), after);
        await command(editor, UNDO_COMMAND);
        assert.deepEqual(await save(editor), original);
        await command(editor, REDO_COMMAND);
        assert.deepEqual(await save(editor), after);
        await editor.load(after, { format, editable: true });
        assert.deepEqual(await save(editor), after);
        assert.deepEqual(captionSnapshot(editor.getEditorState()), originalCaption);
      });

function captionSnapshot(state) {
  const content = state.content,
    table = content.tables[0];
  const captions =
    content.format === 'hwp5'
      ? content.hwp5Captions
      : content.tables.filter((t) => t.sourceCaption);
  assert.equal(captions.length, 1);
  if (content.format === 'hwp5') assert.deepEqual(content.hwp5CaptionGeometryErrors, []);
  assert.equal(table.captionParagraphs.length, 2);
  assert(table.sourceCaption);
  assert.deepEqual(
    content.format === 'hwp5' ? content.hwp5CaptionErrors : content.tableCaptionBindingErrors,
    [],
  );
  const ids = content.format === 'hwp5' ? captions[0].paragraphs : table.captionParagraphs;
  assert.equal(ids.length, 2);
  const paragraphs = ids.map((id) => content.paragraphs.find((p) => p.paragraph === id));
  assert.deepEqual(
    paragraphs.map((p) => p.text),
    ['\ud55c\uae00 \ucea1\uc158\ud83d\ude00', '\ubcf4\uc874 \ub450 \ubc88\uc9f8\ud83d\ude00'],
  );
  for (const p of paragraphs) assert.equal(p.tableCell, undefined);
  for (const c of table.cells)
    for (const id of c.paragraphs)
      assert(!ids.includes(id), 'caption cannot be a source cell paragraph');
  const source = content.format === 'hwp5' ? captions[0].source : table.sourceCaption;
  const scalar = Object.fromEntries(
    Object.entries(source).filter(
      ([k]) => !['control_node', 'table_record_node', 'list_node', 'caption_node'].includes(k),
    ),
  );
  return { text: paragraphs.map((p) => p.text), scalar };
}

async function native(format, bytes, run) {
  const { createExperimentalHwp5Editor } = await import('../../js/hwp5-editor.mjs');
  const { createHwpxEditor } = await import('../../js/hwpx-editor.mjs');
  const n =
    format === 'hwp5'
      ? await createExperimentalHwp5Editor(module, bytes)
      : await createHwpxEditor(module);
  try {
    if (format === 'hwpx') n.open(bytes);
    n.enableHistoryV2();
    return await run(n);
  } finally {
    n.close();
  }
}
const nativeSave = (n, format) =>
  format === 'hwp5' ? n.save({ allowStaleLayout: true }).bytes : n.save();
for (const format of ['hwp5', 'hwpx'])
  for (const mode of ['caption-top-before', 'caption-bottom-before'])
    test(`${format} ${mode}: actual SDK capability and Native mutation`, async () => {
      const source = new Uint8Array(
        readFileSync(new URL(mode + '.' + (format === 'hwp5' ? 'hwp' : 'hwpx'), root)),
      );
      await native(format, source, async (n) => {
        assert.equal(n.supportsSourceTableGrid(), true);
        assert.equal(n.historyRevision(), 0);
        const node = n.tableBindings(0)[0].tableNode;
        const cap = format === 'hwp5' ? n.captionSources(0) : n.tableCaption(0, node);
        assert(cap);
        assert.equal(n.historyRevision(), 0);
        n.editSourceTableGrid({
          section: 0,
          tableNode: node,
          expectedRows: 3,
          expectedColumns: 3,
          action: 'insert-row',
          index: 1,
          ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
        });
        assert.equal(n.historyRevision(), 1);
        const after = nativeSave(n, format);
        const expected = regularCases.nested['insert-row'];
        const input = {
          format,
          table: 0,
          matrix: expected.matrix,
          rowTemplates: expected.rowTemplates,
          before: Buffer.from(source).toString('base64'),
          after: Buffer.from(after).toString('base64'),
        };
        for (const flags of [[], ['-O']])
          assert.equal(
            JSON.parse(
              execFileSync(
                'python3',
                [
                  ...flags,
                  new URL('../../tools/source-table-grid-caption-oracle.py', import.meta.url)
                    .pathname,
                ],
                { input: JSON.stringify(input) },
              ),
            ).rows,
            4,
          );
      });
    });
for (const format of ['hwp5', 'hwpx'])
  for (const mode of [
    'unknown-extension',
    'unknown-flags',
    'list-extension',
    'field',
    'cache',
    'nested',
    'duplicate',
    'wrong-owner',
    ...(format === 'hwpx' ? ['list-cache', 'reference'] : ['presence', 'presence-without-list']),
  ])
    test(`${format} caption ${mode}: Native refusal owns bytes and history`, async () => {
      const path = new URL(
        'caption-reject-' + mode + '.' + (format === 'hwp5' ? 'hwp' : 'hwpx'),
        root,
      );
      const source = new Uint8Array(readFileSync(path));
      const node = Number(
        execFileSync(
          'python3',
          [
            '-B',
            new URL('../helpers/source-grid-caption-fixtures.py', import.meta.url).pathname,
            '--describe',
            path.pathname,
          ],
          { encoding: 'utf8' },
        ),
      );
      await native(format, source, (n) => {
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
          /Unsupported|UnexpectedEnd|Invalid|Duplicate|Ambiguous/,
        );
        assert.equal(n.historyRevision(), 0);
        assert.equal(n.historyStats().undoCount, 0);
        assert.equal(n.historyStats().poisoned, false);
        assert.deepEqual(nativeSave(n, format), source);
      });
    });
for (const format of ['hwp5', 'hwpx'])
  test(`${format} actual table-caption fixture remains unsupported and byte exact`, async () => {
    const source = new Uint8Array(
      readFileSync(
        new URL(
          '../../apps/docs/docs/public/editor/fixtures/table-caption.' +
            (format === 'hwp5' ? 'hwp' : 'hwpx'),
          import.meta.url,
        ),
      ),
    );
    await native(format, source, (n) => {
      const cells = n.tableBindings(0);
      const nodes = [...new Set(cells.map((c) => c.tableNode))];
      assert.equal(nodes.length, 8);
      for (const node of nodes)
        for (const action of ['insert-row', 'insert-column'])
          assert.throws(
            () =>
              n.editSourceTableGrid({
                section: 0,
                tableNode: node,
                expectedRows: 1,
                expectedColumns: 1,
                action,
                index: 1,
                ...(format === 'hwp5' ? { layout: 'observed8' } : {}),
              }),
            /UnsupportedSourceTableGrid|UnsupportedSourceTableStructure/,
          );
      assert.equal(n.historyRevision(), 0);
      assert.equal(n.historyStats().undoCount, 0);
      assert.equal(n.historyStats().poisoned, false);
      assert.deepEqual(nativeSave(n, format), source);
    });
  });
