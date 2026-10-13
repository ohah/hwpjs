import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
const wasm = () => readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
const options = { rows: 2, columns: 2, width: 101, rowHeight: 17, resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 } };
const source = () => readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");

test("public table creation and cell input save reopen undo redo exact bytes", async () => {
  const editor = await createHwpxEditor(wasm());
  const reopened = await createHwpxEditor(wasm());
  const bytes = source();
  try {
    editor.open(bytes); editor.enableHistory();
    const resources = editor.tableCreationResources();
    for (const [kind, id] of Object.entries(options.resources)) assert(resources[kind].includes(id));
    assert.deepEqual(Buffer.from(editor.save()), bytes);
    const identity = editor.insertTable(0, 2, 0, options);
    assert.equal(typeof identity, "string");
    const [table] = editor.createdTables(0);
    assert.equal(table.identity, identity);
    assert.deepEqual(table.cells.map(c => c.width), [51, 50, 51, 50]);
    editor.setCreatedCellText(0, identity, 0, 0, "입력😀<&\r");
    assert.deepEqual(Buffer.from(editor.saveForDisplay()), bytes);
    assert.equal(editor.createdTables(0)[0].cells[0].text, "입력😀<&\r");
    const saved = editor.save();
    reopened.open(saved);
    assert.equal(reopened.anchorText(0, 3), "입력😀<&\r");
    assert.equal(editor.undo(), true);
    assert.equal(editor.createdTables(0)[0].cells[0].text, "");
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.createdTables(0), []);
    assert.deepEqual(Buffer.from(editor.save()), bytes);
    assert.throws(() => editor.insertTable(0, 2, 0, { ...options, rows: 0 }));
    assert.throws(() => editor.insertTable(0, 2, 0, { ...options, resources: { ...options.resources, style: 0xffffffff } }), /InvalidStyleReference/);
    assert.equal(editor.redo(), true); assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), Buffer.from(saved));
    const second = editor.insertTable(0, 2, 0, options);
    assert.notEqual(second, identity);
    const tables = editor.createdTables(0);
    assert.notEqual(tables[0].instance_id, tables[1].instance_id);
    assert.equal(new Set(tables.flatMap(t => t.cells.map(c => c.paragraph_id))).size, 8);
  } finally { reopened.close(); editor.close(); }
});

test("public table creation without history rejects malformed requests atomically", async () => {
  const editor = await createHwpxEditor(wasm());
  const bytes = source();
  try {
    editor.open(bytes);
    for (const patch of [{ rows: 0 }, { columns: 0 }, { width: 1 }, { rowHeight: 0 }, { rows: 0xffffffff }, { rows: -1 }, { resources: null },
      { rows: NaN }, { columns: Infinity }, { width: 101.5 }, { rowHeight: "17" }, { rows: true },
      { rows: 0x100000000 }, { resources: [] },
      ...[NaN, Infinity, -1, 1.5, "1", true, 0x100000000].map(character => ({ resources: { ...options.resources, character } }))]) {
      assert.throws(() => editor.insertTable(0, 2, 0, { ...options, ...patch }));
      assert.deepEqual(Buffer.from(editor.save()), bytes);
      assert.deepEqual(editor.createdTables(0), []);
    }
    for (const invalid of [NaN, Infinity, -1, 1.5, "0", true, 0x100000000]) {
      for (const coordinates of [[invalid, 2, 0], [0, invalid, 0], [0, 2, invalid]]) {
        assert.throws(() => editor.insertTable(...coordinates, options), error => error instanceof RangeError && error.message === "InvalidInteger");
        assert.deepEqual(Buffer.from(editor.save()), bytes);
        assert.deepEqual(editor.createdTables(0), []);
      }
    }
    assert.throws(() => editor.insertTable(99, 2, 0, options), /InvalidSectionIndex/);
    assert.throws(() => editor.insertTable(0, 2, 0xffffffff, options));
    const id = editor.insertTable(0, 2, 0, options);
    editor.setCreatedCellText(0, id, 1, 1, "끝😀");
    assert.equal(editor.createdTables(0)[0].cells[3].text, "끝😀");
  } finally { editor.close(); }
});

test("public table creation checkpoint budget refusal leaves no current table or history", async () => {
  const editor = await createHwpxEditor(wasm());
  const bytes = source();
  try {
    editor.open(bytes); editor.enableHistory({ maxCheckpointBytes: 1 });
    for (let repeat = 0; repeat < 3; repeat++) {
      assert.throws(() => editor.insertTable(0, 2, 0, options), /LimitExceeded/);
      assert.deepEqual(editor.createdTables(0), []);
      assert.deepEqual(Buffer.from(editor.save()), bytes);
      assert.equal(editor.undo(), false); assert.equal(editor.redo(), false);
    }
  } finally { editor.close(); }
});

test("table creation resource options include current cloned formats without changing history", async () => {
  const editor = await createHwpxEditor(wasm());
  try {
    editor.open(source()); editor.enableHistory();
    const original = editor.tableCreationResources();
    assert.equal(editor.undo(), false);
    editor.setParagraphAlignment({ section: 0, paragraph: 2, alignment: "CENTER" });
    const paragraph = editor.paragraphShapeId(0, 2);
    assert(!original.paragraph.includes(paragraph));
    editor.setCharacterProperties({ section: 0, paragraph: 2, startUnit: 0, endUnit: 1, properties: { size: 1234 } });
    const before = editor.save();
    const current = editor.tableCreationResources();
    assert(current.paragraph.includes(paragraph));
    assert(current.character.some(id => !original.character.includes(id)));
    assert.deepEqual(Buffer.from(editor.save()), Buffer.from(before));
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.tableCreationResources().character, original.character);
  } finally { editor.close(); }
});
