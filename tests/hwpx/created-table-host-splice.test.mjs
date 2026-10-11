import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { spawnSync } from "node:child_process";

test("public generated table host prefix keeps complete XML ZIP and native redo on refusal", async () => {
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    editor.open(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx")); editor.enableHistory();
    const identity = editor.insertTable(0, 2, 2, { rows: 1, columns: 1, width: 100, rowHeight: 17, resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 } });
    const table = editor.createdTables(0)[0], before = editor.save();
    assert.equal(editor.createdTableHostMode(0), true);
    assert.equal(editor.createdTableHostMode(0, true), false);
    assert.throws(() => editor.createdTableHostMode(0, 1), /InvalidCreatedTableHostMode/);
    assert.throws(() => editor.createdTableHostMode(0xffffffff), /InvalidSectionIndex/);
    assert.equal(editor.canSplitParagraph({ section: 0, paragraph: 2, atUnit: 0 }), false);
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 2, atUnit: 0 }), /UnsupportedCreatedTableHostEdit/);
    assert.deepEqual(Buffer.from(editor.save()), Buffer.from(before));
    editor.splice(0, 2, 0, 0, "앞😀<&");
    assert.equal(editor.createdTables(0)[0].anchor_unit, 7);
    assert.equal(editor.createdTables(0)[0].identity, identity);
    const after = editor.save();
    const data = { before: Buffer.from(before).toString("base64"), after: Buffer.from(after).toString("base64"), part: "Contents/section0.xml", index: 1, start: 0, end: 0, text: "앞😀<&", zero_width_table_id: String(table.instance_id) };
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-plain-splice-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
    for (const fields of [{ zero_width_table_id: null }, { zero_width_table_id: true }, { zero_width_table_id: "9" }, { start: 0, end: 3 }]) {
      const result = spawnSync("python3", ["-O", "tools/hwpx-plain-splice-oracle.py"], { input: JSON.stringify({ ...data, ...fields }), encoding: "utf8", timeout: 30000 });
      assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
      assert.match(result.stderr, /ValueError: (Oracle supports plain text leaves only|Invalid generated table identity|Missing or duplicate generated table|Splice crosses generated table)/);
    }
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.splice(0, 2, 0, 3, ""), /ProtectedCreatedTableAnchor/);
    assert.deepEqual(Buffer.from(editor.save()), Buffer.from(before));
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), Buffer.from(after));
  } finally { editor.close(); }
});
