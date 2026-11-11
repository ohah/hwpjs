import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { INSERT_TABLE_COMMAND } from '../../packages/core/src/commands/commands.ts';
import { getTableInsertAvailability } from '../../packages/core/src/commands/table-insert.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';

export async function createCellHeightFixture(
  module,
  { heights = [1500, 4500, 3000], text = 'A😀A' } = {},
) {
  const host = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  const native = await createHwpxEditor(module);
  try {
    await host.createDocument({ format: 'hwpx' });
    const state = host.getEditorState();
    const { resources } = getTableInsertAvailability(state, state.selection);
    const result = await host.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: state.selection,
      options: { rows: 3, columns: 2, width: 20000, rowHeight: 3000, resources },
    });
    if (result.status !== 'committed-with-snapshot') throw Error(result.error);
    native.open((await host.save()).bytes);
    const cells = native.tableBorderSources(0).cells;
    native.setCellSizes(
      cells.map((cell, index) => ({
        section: 0,
        listNode: cell.list_node,
        width: index % 2 === 0 ? 6000 : 14000,
        height: heights[Math.floor(index / 2)],
      })),
    );
    const bindings = native.tableBindings(0);
    // Source text is authored through the same native editor used by product typing.
    const first = bindings.find((binding) => binding.listNode === cells[0].list_node);
    native.splice(0, first.paragraph, 0, 0, text);
    return native.save();
  } finally {
    native.close();
    await host.dispose();
  }
}

export async function createMixedHeightFixture(module) {
  const editor = await createHwpxEditor(module);
  try {
    editor.open(await createCellHeightFixture(module));
    editor.enableHistoryV2();
    const tableNode = editor.tableBorderSources(0).cells[0].table_node;
    const result = editor.mergeSourceTableCells({
      binding: editor.sourceTableCellMergeBinding(),
      section: 0,
      tableNode,
      expectedRows: 3,
      expectedColumns: 2,
      top: 0,
      left: 0,
      bottom: 2,
      right: 1,
    });
    if (result.nativeCode !== 1) throw Error(result.error);
    return editor.save();
  } finally {
    editor.close();
  }
}
