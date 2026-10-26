import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { decodeCreatedTables } from "../../js/hwpx-created-tables.mjs";
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const row = {
  identity: "9007199254740993",
  instance_id: 33,
  host_paragraph: 2,
  anchor_unit: 0,
  rows: 1,
  columns: 2,
  width: 101,
  height: 17,
  resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 },
  cells: [
    { paragraph_id: 1000000, row: 0, column: 0, x: 0, y: 0, width: 51, height: 17, text: "" },
    {
      paragraph_id: 1000001,
      row: 0,
      column: 1,
      x: 51,
      y: 0,
      width: 50,
      height: 17,
      text: "현재😀",
    },
  ],
};
test("created table wire retains exact identity and rejects truncation and forged source nodes", () => {
  const bytes = encode([row]);
  assert.deepEqual(decodeCreatedTables(bytes), [row]);
  for (let cut = 0; cut < bytes.length; cut++)
    assert.throws(() => decodeCreatedTables(bytes.subarray(0, cut)), /InvalidCreatedTables/);
  for (const identity of [0, "0", "01", "-1", "18446744073709551616"])
    assert.throws(
      () => decodeCreatedTables(encode([{ ...row, identity }])),
      /InvalidCreatedTables/,
    );
  for (const patch of [
    { source_node: 3 },
    { rows: 0 },
    { width: 100 },
    { cells: [row.cells[0], row.cells[0]] },
    { resources: { ...row.resources, paragraph: -1 } },
  ])
    assert.throws(
      () => decodeCreatedTables(encode([{ ...row, ...patch }])),
      /InvalidCreatedTables/,
    );
  assert.throws(() => decodeCreatedTables(encode([row, row])), /InvalidCreatedTables/);
  assert.throws(() => decodeCreatedTables(new Uint8Array([255])), /InvalidCreatedTables/);
  assert.throws(() => decodeCreatedTables(bytes.buffer), /InvalidCreatedTables/);
  for (const patch of [{ x: 50 }, { y: 1 }, { height: 16 }, { text: "\ud800" }, { source_node: 8 }])
    assert.throws(
      () =>
        decodeCreatedTables(
          encode([{ ...row, cells: [row.cells[0], { ...row.cells[1], ...patch }] }]),
        ),
      /InvalidCreatedTables/,
    );
  assert.deepEqual(decodeCreatedTables(encode([])), []);
  assert.deepEqual(
    decodeCreatedTables(encode([{ ...row, identity: "18446744073709551615" }]))[0].identity,
    "18446744073709551615",
  );
});
test("public created table query stays empty for source tables and preserves original bytes", async () => {
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  const bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx");
  try {
    editor.open(bytes);
    editor.enableHistory();
    assert.deepEqual(editor.createdTables(0), []);
    assert.throws(() => editor.createdTables(99), /InvalidSectionIndex/);
    assert.deepEqual(Buffer.from(editor.save()), bytes);
    assert.equal(editor.undo(), false);
    assert.equal(editor.redo(), false);
  } finally {
    editor.close();
  }
});
