import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`);

test("public HWPX history preserves redo on refusal and no-op, resets only on successful open", async () => {
  const editor = await createHwpxEditor(wasm), input = fixture("shapeline");
  try {
    assert.throws(() => editor.undo(), { message: "EditorNotOpen" });
    editor.open(input);
    assert.throws(() => editor.redo(), { message: "HistoryNotEnabled" });
    for (const maxEntries of [-1, 1.5, NaN, 0x100000000])
      assert.throws(() => editor.enableHistory({ maxEntries }), { message: "InvalidInteger" });
    for (const options of [{ maxEntries: 0 }, { maxCheckpointBytes: 0 }, { maxEntries: 0xffffffff }])
      assert.throws(() => editor.enableHistory(options), { message: "LimitExceeded" });
    editor.enableHistory();
    assert.equal(editor.undo(), false);
    editor.spliceAnchored(0, 1, 0, 0, "검증😀");
    const edited = editor.save();
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.throws(() => editor.spliceAnchored(0, 1, 0, 1, ""), { message: "ProtectedInlineControl" });
    editor.spliceAnchored(0, 1, 0, 0, "");
    assert.throws(() => editor.enableHistory(), { message: "HistoryAlreadyEnabled" });
    assert.throws(() => editor.open(new Uint8Array([1, 2, 3])));
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save(), edited);
    assert.equal(editor.anchorText(0, 1), "검증😀\ufffc\ufffc");
    assert.equal(editor.undo(), true);
    editor.spliceAnchored(0, 1, 0, 0, "분기");
    assert.equal(editor.redo(), false);
    editor.open(input);
    assert.throws(() => editor.undo(), { message: "HistoryNotEnabled" });
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); }
  assert.throws(() => editor.undo(), { message: "EditorClosed" });
  assert.throws(() => editor.redo(), { message: "EditorClosed" });
  assert.throws(() => editor.enableHistory(), { message: "EditorClosed" });
});

test("public HWPX bounded history evicts oldest edits and refuses undersized checkpoints atomically", async () => {
  const editor = await createHwpxEditor(wasm), input = fixture("shapeline");
  try {
    editor.open(input); editor.enableHistory({ maxCheckpointBytes: 1 });
    assert.throws(() => editor.spliceAnchored(0, 1, 0, 0, "x"), { message: "LimitExceeded" });
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.undo(), false); assert.equal(editor.redo(), false);
    editor.open(input); editor.enableHistory({ maxEntries: 2 });
    for (const text of ["A", "B", "C"]) editor.spliceAnchored(0, 1, 0, 0, text);
    assert.equal(editor.undo(), true); assert.equal(editor.undo(), true);
    assert.equal(editor.undo(), false);
    assert.equal(editor.anchorText(0, 1), "A\ufffc\ufffc");
    assert.equal(editor.redo(), true); assert.equal(editor.redo(), true);
    assert.equal(editor.redo(), false);
    assert.equal(editor.anchorText(0, 1), "CBA\ufffc\ufffc");
  } finally { editor.close(); }
});

test("public HWPX field history restores dirty attributes and original ZIP exactly", async () => {
  const editor = await createHwpxEditor(wasm), input = fixture("hyperlink");
  try {
    editor.open(input); editor.enableHistory();
    const target = editor.fieldLabels(0, 1)[0];
    assert(target);
    editor.spliceFieldLabel(0, 1, target.beginElement, target.start, 0, "복원😀<&");
    const edited = editor.save();
    assert.notDeepEqual(Buffer.from(edited), input);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.deepEqual(editor.fieldLabels(0, 1)[0], target);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save(), edited);
    assert.equal(editor.fieldLabels(0, 1)[0].end, target.end + 6);
  } finally { editor.close(); }
});
