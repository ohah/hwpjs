import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  createEditor,
  createParagraphSelection,
  INSERT_TABLE_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../src/index.ts';
import { createReaderRuntimeFactory } from '../../src/runtime/reader-runtime.ts';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const wasmPath = process.env.HWPJS_TEST_WASM;
const fixtureRoot = process.env.TABLE_FIXTURE_ROOT;
const out = process.env.TABLE_INSERT_OUTPUT;
const expectedWasm = process.env.HWPJS_TEST_WASM_EXPECTED_SHA256;
assert(wasmPath, 'HWPJS_TEST_WASM 명시 필요');
assert(fixtureRoot, 'TABLE_FIXTURE_ROOT 명시 필요');
assert(out, 'TABLE_INSERT_OUTPUT 소유 디렉터리 명시 필요');
assert(expectedWasm && /^[a-f0-9]{64}$/.test(expectedWasm), '검토된 엔진 SHA256 명시 필요');
const bytes = readFileSync(wasmPath);
assert.equal(sha(bytes), expectedWasm);
const module = await WebAssembly.compile(bytes);
for (const [format, file, pin] of [
  [
    'hwp5',
    'footnote-endnote.hwp',
    '360c6dc2c679e03e48396b11d7f31823a577d64e96a9ec75e074390385b865a9',
  ],
  [
    'hwpx',
    'footnote-endnote.hwpx',
    '4704e5bcdd7c83d974e155c987b77a78e360b319f4c0437b5d8a69e43c827f1b',
  ],
] as const)
  test(format + ' 공개 명령·현재관측·단일undo/redo·stale·저장재열기', async () => {
    const original = readFileSync(join(fixtureRoot, file));
    assert.equal(sha(original), pin);
    const editor = createEditor({
      runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
    });
    try {
      await editor.load(original, { format, editable: true });
      const before = editor.getEditorState();
      const content = before.content as any;
      assert.equal(content.tableCreationAvailable, true);
      const row = content.paragraphs.find((p: any) => p.section === 0 && p.paragraph === 0);
      assert(row);
      assert.equal(row.selectionOwner, 'section:0:body');
      assert.equal(row.editable, true);
      const target = createParagraphSelection(before, {
        section: 0,
        paragraph: 0,
        startUnit: row.text.length,
      });
      const resources = Object.fromEntries(
        ['paragraph', 'character', 'style', 'border_fill'].map((key) => {
          const ids = content.tableCreationResources[key];
          assert(Array.isArray(ids) && ids.length);
          return [key, ids[0]];
        }),
      ) as any;
      const options = { rows: 1, columns: 1, width: 15000, rowHeight: 5400, resources };
      const command = await editor.dispatchCommand(INSERT_TABLE_COMMAND, { target, options });
      assert.equal(command.status, 'committed-with-snapshot', command.error ?? '표삽입실패');
      const after = editor.getEditorState(),
        observed = after.content as any;
      assert.equal(after.operationRevision, before.operationRevision + 1);
      assert.equal(after.selection, before.selection);
      assert.equal(observed.createdTables.length, (content.createdTables?.length ?? 0) + 1);
      const table = observed.createdTables.at(-1);
      assert.equal(table.hostParagraph, 0);
      assert.equal(table.rows, 1);
      assert.equal(table.columns, 1);
      assert.equal(table.width, 15000);
      assert.equal(table.height, 5400);
      assert.equal(table.cells.length, 1);
      assert.equal(table.cells[0].text, '');
      for (const p of content.paragraphs.filter((p: any) => p.paragraph !== 0))
        assert.equal(
          observed.paragraphs.find(
            (q: any) => q.section === p.section && q.paragraph === p.paragraph,
          )?.text,
          p.text,
        );
      const stale = await editor.dispatchCommand(INSERT_TABLE_COMMAND, { target, options });
      assert.equal(stale.status, 'rejected-unapplied');
      assert.equal(stale.error, 'StaleTarget');
      assert.equal(editor.getEditorState(), after);
      const saved = await editor.save({ allowStaleLayout: true });
      const edited = new Uint8Array(saved.bytes);
      writeFileSync(join(out, format + '-edited.' + (format === 'hwp5' ? 'hwp' : 'hwpx')), edited);
      const undo = await editor.dispatchCommand(UNDO_COMMAND, {
        token: editor.getEditorState().token,
      });
      assert.equal(undo.status, 'committed-with-snapshot', undo.error ?? 'undo실패');
      const restored = await editor.save({ allowStaleLayout: true });
      assert.deepEqual(new Uint8Array(restored.bytes), new Uint8Array(original));
      const redo = await editor.dispatchCommand(REDO_COMMAND, {
        token: editor.getEditorState().token,
      });
      assert.equal(redo.status, 'committed-with-snapshot', redo.error ?? 'redo실패');
      const repeated = await editor.save({ allowStaleLayout: true });
      assert.deepEqual(new Uint8Array(repeated.bytes), edited);
      await editor.load(edited, { format, editable: true });
      const reopened = editor.getEditorState().content as any;
      assert.equal(reopened.createdTables.length, 0);
      assert.equal(reopened.tables.length, (content.tables?.length ?? 0) + 1);
      const old = await editor.dispatchCommand(INSERT_TABLE_COMMAND, { target, options });
      assert.equal(old.status, 'rejected-unapplied');
      assert.equal(old.error, 'StaleTarget');
      await editor.load(edited, { format, editable: false });
      const readonlyState = editor.getEditorState();
      const readonlyRow = (readonlyState.content as any).paragraphs.find(
        (p: any) => p.section === 0 && p.paragraph === 0,
      );
      const readonlyTarget = createParagraphSelection(readonlyState, {
        section: 0,
        paragraph: 0,
        startUnit: readonlyRow.text.length,
      });
      const denied = await editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        target: readonlyTarget,
        options,
      });
      assert.equal(denied.status, 'rejected-unapplied');
      assert.equal(denied.error, 'ReadOnlyDocument');
      assert.equal(editor.getEditorState(), readonlyState);
      const report = {
        format,
        fixtureSHA: pin,
        wasmSHA: sha(bytes),
        target: { section: target.section, paragraph: target.paragraph, unit: target.startUnit },
        options,
        identity: table.identity,
        editedSHA: sha(edited),
        bytes: edited.length,
        status: command.status,
        undoOriginalBytesExact: true,
        redoEditedBytesExact: true,
        reopenedSourceTables: reopened.tables.length,
        staleError: stale.error,
        newTableSelected: false,
        readonlyError: denied.error,
        WorkerExecuted: false,
      };
      writeFileSync(join(out, format + '-RESULT.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
    } finally {
      await editor.dispose();
    }
  });
