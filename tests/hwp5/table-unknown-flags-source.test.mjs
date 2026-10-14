import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";

test("noori unknown TABLE flags retain raw values and exact unedited save", async () => {
  const bytes = readFileSync("legacy/noori.hwp");
  const parsed = inspect(bytes);
  assert.equal(parsed.streams.get("FileHeader").readUInt32LE(32), 0x05000300);
  const editor = await createExperimentalHwp5Editor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"), bytes);
  try {
    const raw = records(parsed.sections[0].bytes), stack = [], parents = [];
    for (const [index, row] of raw.entries()) { stack.length = row.level; parents[index] = stack.at(-1) ?? null; stack.push(index); }
    const tables = editor.tableLayoutSources(0);
    assert.equal(tables.length, 5);
    assert.deepEqual(tables.map(row => row.table_flags), [0x0e050b4c, 0x0e07ff1c, 0x04000006, 0x04000006, 0x04000006]);
    for (const row of tables) {
      const record = raw[row.table_record_node], control = raw[row.table_node];
      assert.equal(record.tag, 77); assert.equal(control.tag, 71);
      assert.equal(control.payload.readUInt32LE(0), 0x74626c20);
      assert.equal(parents[row.table_record_node], row.table_node);
      const expected = { flags: record.payload.readUInt32LE(0), rows: record.payload.readUInt16LE(4), columns: record.payload.readUInt16LE(6) };
      const actual = { flags: row.table_flags, rows: row.rows, columns: row.columns };
      assert.deepEqual(actual, expected);
      assert.throws(() => assert.deepEqual(actual, { ...expected, flags: (expected.flags ^ 0x02000000) >>> 0 }));
    }
    assert.deepEqual(Buffer.from(editor.save().bytes), bytes);
  } finally { editor.close(); }
});
