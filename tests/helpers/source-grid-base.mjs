import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { createEditor, INSERT_TABLE_COMMAND } from '../../packages/core/src/index.ts';
import { getTableInsertAvailability } from '../../packages/core/src/commands/table-insert.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
if (!process.env.HWPJS_TEST_WASM || !process.env.HWPJS_TEST_SOURCE_GRID_OUTPUT_DIR)
  throw Error('ExplicitIsolatedInputsRequired');
const output = pathToFileURL(process.env.HWPJS_TEST_SOURCE_GRID_OUTPUT_DIR + '/');
const module = await WebAssembly.compile(readFileSync(process.env.HWPJS_TEST_WASM));
for (const format of ['hwp5', 'hwpx']) {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  let n;
  try {
    await e.createDocument({ format });
    const s = e.getEditorState(),
      { resources } = getTableInsertAvailability(s, s.selection);
    const r = await e.dispatchCommand(INSERT_TABLE_COMMAND, {
      target: s.selection,
      options: { rows: 3, columns: 3, width: 18000, rowHeight: 3000, resources },
    });
    if (r.status !== 'committed-with-snapshot') throw Error(r.error);
    const bytes = (await e.save({ allowStaleLayout: true })).bytes;
    n =
      format === 'hwp5'
        ? await createExperimentalHwp5Editor(module, bytes)
        : await createHwpxEditor(module);
    if (format === 'hwpx') n.open(bytes);
    const cells = n.tableBindings(0);
    for (const c of cells) {
      const text = `R${c.row}C${c.column}😀`;
      if (format === 'hwp5')
        n.splice({ section: 0, paragraph: c.paragraph, startUnit: 0, endUnit: 0, text });
      else n.splice(0, c.paragraph, 0, 0, text);
    }
    const saved = format === 'hwp5' ? n.save({ allowStaleLayout: true }).bytes : n.save();
    writeFileSync(new URL('regular.' + (format === 'hwp5' ? 'hwp' : 'hwpx'), output), saved);
  } finally {
    n?.close();
    await e.dispose();
  }
}
