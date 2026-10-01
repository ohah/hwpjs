import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createMemory } from "../../js/wasm-memory.mjs";
import { inspect, verifyRaw } from "./style-preservation/text-record-oracle.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
const insert = { section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "이력😀" };

test("independent CFB and record oracle validates history branching and every restored stream", async () => {
  for (const [name, paragraph] of [["charshape", 1], ["software", 2], ["table", 1]]) {
    const input = fixture(name), original = inspect(input);
    const editor = await createExperimentalHwp5Editor(wasm, input);
    const equalStreams = (bytes, expected) => {
      const actual = inspect(bytes);
      assert.deepEqual([...actual.streams.keys()].sort(), [...expected.streams.keys()].sort());
      for (const [path, content] of expected.streams)
        assert.deepEqual(actual.streams.get(path), content, `${name}: ${path}`);
    };
    try {
      editor.enableHistory();
      editor.splice({ ...insert, paragraph });
      const first = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(input, first, 0, paragraph, 0, 0, insert.text);
      const firstOracle = inspect(first);
      editor.splice({ ...insert, paragraph, text: "次😀" });
      const second = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(first, second, 0, paragraph, 0, 0, "次😀");
      const secondOracle = inspect(second);
      assert.equal(editor.undo(), true);
      equalStreams(editor.save({ allowStaleLayout: true }).bytes, firstOracle);
      assert.equal(editor.undo(), true);
      equalStreams(editor.save().bytes, original);
      assert.equal(editor.redo(), true);
      equalStreams(editor.save({ allowStaleLayout: true }).bytes, firstOracle);
      assert.equal(editor.redo(), true);
      equalStreams(editor.save({ allowStaleLayout: true }).bytes, secondOracle);
      assert.equal(editor.undo(), true);
      editor.splice({ ...insert, paragraph, text: "분기" });
      const branch = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(first, branch, 0, paragraph, 0, 0, "분기");
      assert.equal(editor.redo(), false);
      assert.equal(editor.undo(), true);
      equalStreams(editor.save({ allowStaleLayout: true }).bytes, firstOracle);
    } finally { editor.close(); }
  }
});

test("public HWP5 history preserves redo on no-op, refusal and failed save, restores strict layout state", async () => {
  const input = fixture("charshape"), editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    assert.throws(() => editor.undo(), { message: "HistoryNotEnabled" });
    for (const maxEntries of [-1, 1.5, NaN, "2", null, 0x100000000])
      assert.throws(() => editor.enableHistory({ maxEntries }), { message: "Invalid maxEntries" });
    for (const options of [{ maxEntries: 0 }, { maxCheckpointBytes: 0 }, { maxEntries: 0xffffffff }])
      assert.throws(() => editor.enableHistory(options), { message: "LimitExceeded" });
    editor.enableHistory(); assert.equal(editor.undo(), false);
    editor.splice(insert);
    const edited = editor.save({ allowStaleLayout: true });
    assert.equal(edited.layoutRequiresReflow, true);
    assert.throws(() => editor.save(), { message: "LayoutReflowRequired" });
    assert.equal(editor.undo(), true);
    const restored = editor.save();
    assert.equal(restored.layoutRequiresReflow, false);
    assert.deepEqual(Buffer.from(restored.bytes), input);
    editor.splice({ ...insert, text: "" });
    assert.throws(() => editor.splice({ ...insert, text: "\ud800" }), { message: "InvalidUnicodeEncoding" });
    assert.throws(() => editor.enableHistory(), { message: "HistoryAlreadyEnabled" });
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }), edited);
    assert.equal(editor.undo(), true);
    editor.splice({ ...insert, text: "분기" });
    assert.equal(editor.redo(), false);
  } finally { editor.close(); }
  for (const method of ["undo", "redo", "enableHistory"])
    assert.throws(() => editor[method](), { message: "EditorClosed" });
});

test("public HWP5 history checkpoint limit refusal is atomic and entry limit evicts oldest", async () => {
  const input = fixture("charshape");
  const limited = await createExperimentalHwp5Editor(wasm, input);
  try {
    limited.enableHistory({ maxCheckpointBytes: 1 });
    assert.throws(() => limited.splice(insert), { message: "LimitExceeded" });
    assert.deepEqual(Buffer.from(limited.save().bytes), input);
    assert.equal(limited.undo(), false); assert.equal(limited.redo(), false);
  } finally { limited.close(); }
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    const before = editor.text(0, 1);
    editor.enableHistory({ maxEntries: 2 });
    for (const text of ["A", "B", "C"]) editor.splice({ ...insert, text });
    assert.equal(editor.undo(), true); assert.equal(editor.undo(), true);
    assert.equal(editor.undo(), false); assert.equal(editor.text(0, 1), "A" + before);
    assert.equal(editor.redo(), true); assert.equal(editor.redo(), true);
    assert.equal(editor.redo(), false); assert.equal(editor.text(0, 1), "CBA" + before);
  } finally { editor.close(); }
});

test("public HWP5 history restores actual dependent formulas, crossing fields, formats and empty nested text", async () => {
  for (const [name, command] of [
    ["chart", { section: 0, paragraph: 19, startUnit: 1, endUnit: 2, text: "2" }],
    ["issue144-fields-crossing-lineseg-boundary", { section: 0, paragraph: 2, startUnit: 0, endUnit: 4, text: "필드😀" }],
    ["table", insert],
    ["software", { ...insert, paragraph: 2 }],
    ["charshape", { section: 0, paragraph: 1, startUnit: 0, endUnit: 1, charShapeId: 0 }],
  ]) {
    const input = fixture(name), editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      editor.enableHistory();
      if ("charShapeId" in command) editor.setCharacterFormat(command);
      else editor.splice(command);
      const edited = editor.save({ allowStaleLayout: true });
      assert.notDeepEqual(Buffer.from(edited.bytes), input, name);
      assert.equal(editor.undo(), true, name);
      assert.deepEqual(Buffer.from(editor.save().bytes), input, name);
      assert.equal(editor.redo(), true, name);
      assert.deepEqual(editor.save({ allowStaleLayout: true }), edited, name);
    } finally { editor.close(); }
  }
});

test("raw HWP5 history ABI preserves failed reopen and clears history on successful reopen and close", async () => {
  const { exports: native } = await WebAssembly.instantiate(await WebAssembly.compile(wasm), {});
  const memory = createMemory(native), input = fixture("charshape");
  const open = bytes => memory.withBytes(bytes, (ptr, len) => native.hwp5_edit_open(ptr, len));
  const save = stale => {
    try {
      assert.equal(native.hwp5_edit_save(stale), 1, memory.error().message);
      return memory.copy(native.hwp5_edit_output_ptr(), native.hwp5_edit_output_len());
    } finally { native.hwp5_edit_output_free(); }
  };
  try {
    assert.equal(native.hwp5_edit_undo(), 2); assert.equal(memory.error().message, "EditorNotOpen");
    assert.equal(open(input), 1);
    assert.equal(native.hwp5_edit_history_enable(16, 8 * 1024 * 1024), 1);
    memory.withBytes(new TextEncoder().encode("재열기😀"), (ptr, len) => {
      assert.equal(native.hwp5_edit_splice(0, 1, 0, 0, ptr, len, 0), 1);
    });
    const edited = save(1);
    assert.equal(native.hwp5_edit_undo(), 1); assert.deepEqual(Buffer.from(save(0)), input);
    assert.equal(open(new Uint8Array([1, 2, 3])), 0);
    assert.equal(native.hwp5_edit_redo(), 1); assert.deepEqual(save(1), edited);
    assert.equal(open(input), 1);
    assert.equal(native.hwp5_edit_undo(), 2); assert.equal(memory.error().message, "HistoryNotEnabled");
    assert.deepEqual(Buffer.from(save(0)), input);
  } finally { native.hwp5_edit_close(); }
  assert.equal(native.hwp5_edit_redo(), 2); assert.equal(memory.error().message, "EditorNotOpen");
});
