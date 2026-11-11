/** Native constructors only; no external sidecar or protected document input. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createEditor } from '../../../core/src/editor/create-editor.ts';
import { createParagraphSelection } from '../../../core/src/state/paragraph-selection.ts';
import { INSERT_TABLE_COMMAND } from '../../../core/src/commands/commands.ts';
import { createReaderRuntimeFactory } from '../../../core/src/runtime/reader-runtime.ts';
import { getTableInsertAvailability } from '../../../core/src/commands/table-insert.ts';
import { createHwpxEditor } from '../../../../js/hwpx-editor.mjs';
import { createExperimentalHwp5Editor } from '../../../../js/hwp5-editor.mjs';
export const SOURCE_CELL_SPLIT_DOCUMENTS = Object.freeze([
  'single.hwpx',
  'merged.hwpx',
  'two.hwpx',
  'positive.hwp',
  'outline-mismatch.hwp',
  'two.hwp',
]);
export async function generateSourceCellSplitFixtures({ wasmModule, directory }) {
  assert(wasmModule instanceof WebAssembly.Module);
  await mkdir(directory, { recursive: true });
  const resources = {};
  const hashes = {};
  async function store(name, bytes) {
    await writeFile(join(directory, name), bytes, { flag: 'wx' });
    hashes[name] = createHash('sha256').update(bytes).digest('hex');
  }
  async function construct(format, count = 1, width = 30000, rowHeight = 8000) {
    const host = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
    try {
      await host.createDocument({ format });
      for (let index = 0; index < count; index++) {
        const state = host.getEditorState(),
          target =
            state.selection ??
            createParagraphSelection(state, { section: 0, paragraph: 0, startUnit: 0 });
        resources[format] = getTableInsertAvailability(state, target).resources;
        const result = await host.dispatchCommand(INSERT_TABLE_COMMAND, {
          target,
          options: { rows: 2, columns: 2, width, rowHeight, resources: resources[format] },
        });
        assert.equal(result.status, 'committed-with-snapshot', result.error);
      }
      return (await host.save({ allowStaleLayout: true })).bytes;
    } finally {
      await host.dispose();
    }
  }
  for (const [name, count] of [
    ['single.hwpx', 1],
    ['two.hwpx', 2],
  ]) {
    const sdk = await createHwpxEditor(wasmModule);
    try {
      sdk.open(await construct('hwpx', count));
      const bindings = sdk.tableBindings(0);
      assert.equal(new Set(bindings.map((row) => row.tableNode)).size, count);
      for (const [index, row] of bindings.entries())
        sdk.splice(0, row.paragraph, 0, 0, String.fromCharCode(65 + index) + '😀');
      const bytes = sdk.save();
      await store(name, bytes);
      if (count === 1) {
        sdk.open(bytes);
        sdk.enableHistoryV2();
        const result = sdk.mergeSourceTableCells({
          binding: sdk.sourceTableCellMergeBinding(),
          section: 0,
          tableNode: sdk.tableBindings(0)[0].tableNode,
          expectedRows: 2,
          expectedColumns: 2,
          top: 0,
          left: 0,
          bottom: 2,
          right: 2,
        });
        assert.equal(result.nativeCode, 1, result.error);
        await store('merged.hwpx', sdk.save());
      }
    } finally {
      sdk.close();
    }
  }
  for (const [name, mismatch] of [
    ['positive.hwp', false],
    ['outline-mismatch.hwp', true],
  ]) {
    const bytes = await construct('hwp5', 1, mismatch ? 12000 : 30000, mismatch ? 2000 : 8000);
    const sdk = await createExperimentalHwp5Editor(wasmModule, bytes);
    try {
      const rows = sdk.tableBindings(0);
      if (mismatch)
        sdk.setCellSizes(
          rows.map((row) => ({ section: 0, listNode: row.listNode, width: 6000, height: 4000 })),
        );
      sdk.splice({
        section: 0,
        paragraph: rows[0].paragraph,
        startUnit: 0,
        endUnit: 0,
        text: 'A😀A',
      });
      await store(name, sdk.save({ allowStaleLayout: true }).bytes);
    } finally {
      sdk.close();
    }
  }
  await store('two.hwp', await construct('hwp5', 2));
  await writeFile(join(directory, 'resources.json'), JSON.stringify(resources, null, 2), {
    flag: 'wx',
  });
  assert.deepEqual(Object.keys(hashes).sort(), [...SOURCE_CELL_SPLIT_DOCUMENTS].sort());
  return {
    schemaVersion: 1,
    documents: [...SOURCE_CELL_SPLIT_DOCUMENTS],
    sha256: hashes,
    metadata: ['resources.json'],
  };
}
