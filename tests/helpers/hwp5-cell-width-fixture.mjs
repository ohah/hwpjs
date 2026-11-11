import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createEditor, INSERT_TABLE_COMMAND } from '../../packages/core/src/index.ts';
import { getTableInsertAvailability } from '../../packages/core/src/commands/table-insert.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';

/** Author through Native, save and reopen as an original HWP5 source. */
export async function createHwp5CellWidthFixture(
  module,
  { widths = [6000, 14000], heights = [2000, 3000], text = 'A😀A' } = {},
) {
  const host = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  let native;
  try {
    await host.createDocument({ format: 'hwp5' });
    const state = host.getEditorState();
    const { resources } = getTableInsertAvailability(state, state.selection);
    const result = await host.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: state.selection,
      options: {
        rows: heights.length,
        columns: widths.length,
        width: widths.reduce((a, b) => a + b, 0),
        rowHeight: 2000,
        resources,
      },
    });
    if (result.status !== 'committed-with-snapshot') throw Error(result.error);
    native = await createExperimentalHwp5Editor(
      module,
      (await host.save({ allowStaleLayout: true })).bytes,
    );
    const cells = native.tableBindings(0);
    native.setCellSizes(
      cells.map((cell) => ({
        section: 0,
        listNode: cell.listNode,
        width: widths[cell.column],
        height: heights[cell.row],
      })),
    );
    if (text)
      native.splice({ section: 0, paragraph: cells[0].paragraph, startUnit: 0, endUnit: 0, text });
    return native.save({ allowStaleLayout: true }).bytes;
  } finally {
    native?.close();
    await host.dispose();
  }
}
