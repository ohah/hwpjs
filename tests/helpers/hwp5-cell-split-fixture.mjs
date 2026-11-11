import { createEditor, INSERT_TABLE_COMMAND } from '../../packages/core/src/index.ts';
import { getTableInsertAvailability } from '../../packages/core/src/commands/table-insert.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';

export async function createHwp5CellSplitFixture(module) {
  const host = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  let native;
  try {
    await host.createDocument({ format: 'hwp5' });
    const state = host.getEditorState();
    const { resources } = getTableInsertAvailability(state, state.selection);
    const reply = await host.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: state.selection,
      options: { rows: 2, columns: 2, width: 30000, rowHeight: 8000, resources },
    });
    if (reply.status !== 'committed-with-snapshot') throw Error(reply.error);
    native = await createExperimentalHwp5Editor(
      module,
      (await host.save({ allowStaleLayout: true })).bytes,
    );
    const first = native.tableBindings(0)[0];
    native.splice({
      section: 0,
      paragraph: first.paragraph,
      startUnit: 0,
      endUnit: 0,
      text: 'A😀A',
    });
    return native.save({ allowStaleLayout: true }).bytes;
  } finally {
    native?.close();
    await host.dispose();
  }
}
