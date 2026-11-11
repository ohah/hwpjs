import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { INSERT_TABLE_COMMAND } from '../../packages/core/src/commands/commands.ts';
import { getTableInsertAvailability } from '../../packages/core/src/commands/table-insert.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';

/** Synthetic source table, rebuilt from a saved constructor document for each test run. */
export async function createCellWidthFixture(module) {
  const host = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  const editor = await createHwpxEditor(module);
  try {
    await host.createDocument({ format: 'hwpx' });
    const state = host.getEditorState();
    const { resources } = getTableInsertAvailability(state, state.selection);
    const result = await host.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: state.selection,
      options: { rows: 2, columns: 2, width: 20000, rowHeight: 2000, resources },
    });
    if (result.status !== 'committed-with-snapshot') throw Error(result.error);
    const { bytes } = await host.save();
    editor.open(bytes);
    const cells = editor.tableBorderSources(0).cells;
    editor.setCellSizes(
      cells.map((cell, index) => ({
        section: 0,
        listNode: cell.list_node,
        width: index % 2 === 0 ? 6000 : 14000,
        height: 2000,
      })),
    );
    return editor.save();
  } finally {
    editor.close();
    await host.dispose();
  }
}
