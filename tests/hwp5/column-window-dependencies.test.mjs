import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { hwp5ColumnWindowDependencies } from "../../web/preview/hwp5-column-window-dependencies.mjs";
import { planParagraphDependencies } from "../../web/preview/paragraph-dependency-plan.mjs";

function fixture() {
  const projection = { sections: [{ index: 0, paragraphs: [{}, {}, {}, {}, {}] }] };
  const flows = Array.from({ length: 5 }, (_, paragraph) => ({ paragraph, source_node: 100 + paragraph, generated: false, host: "body", parent_node: null, list_node: null }));
  flows[1] = { ...flows[1], host: "table_cell", parent_node: 9, list_node: 10 };
  const columns = [0, 1, 2].map(current_paragraph => ({ current_paragraph, paragraph_node: 100 + current_paragraph }));
  return { projection, flows, columns, editor: { paragraphFlow: () => flows, columnSources: () => columns } };
}

test("column windows retain preceding declarations without crossing logical lists", () => {
  const { projection, flows, columns, editor } = fixture(), before = structuredClone({ flows, columns });
  const found = hwp5ColumnWindowDependencies(editor, projection);
  assert.deepEqual(found.dependencies.get(2), [0]);
  assert.deepEqual(found.dependencies.get(4), [2]);
  assert.equal(found.dependencies.has(1), false);
  assert.deepEqual(planParagraphDependencies({ ...found, offset: 4, count: 1, maxParagraphs: 5 }).ordinals, [0, 2, 4]);
  assert.deepEqual({ flows, columns }, before);
});

test("column windows refuse generated forged duplicate and missing declaration owners", () => {
  for (const mutate of [
    ({ flows }) => { flows[0].generated = true; },
    ({ columns }) => { columns[0].paragraph_node = 999; },
    ({ columns }) => { columns.push({ ...columns[0] }); },
    ({ columns }) => { columns[0].current_paragraph = 99; },
    ({ flows }) => { flows.pop(); },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => hwp5ColumnWindowDependencies(value.editor, value.projection), /WindowDependencyBindingMismatch/);
  }
});

test("actual multi-column declarations retain their complete prior owner chain", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-layout.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input), reader = await createHwp5Reader(wasm);
  try {
    const sources = editor.columnSources(0);
    assert.deepEqual(sources.map(row => row.current_paragraph), [0, 1, 3, 6, 10, 12]);
    const found = hwp5ColumnWindowDependencies(editor, reader.readText(input));
    const plan = planParagraphDependencies({ ...found, offset: 6, count: 1, maxParagraphs: 10 });
    assert.deepEqual(plan.ordinals, [0, 1, 3, 6]);
    assert.deepEqual(planParagraphDependencies({ ...found, offset: 12, count: 1, maxParagraphs: 10 }).ordinals, [12]);
    assert.deepEqual(planParagraphDependencies({ ...found, offset: 13, count: 1, maxParagraphs: 10 }).ordinals, [12, 13]);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally { editor.close(); reader.close(); }
});
