import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { verifySplit } from "./style-preservation/structure-record-oracle.mjs";
import { verifyRaw } from "./style-preservation/text-record-oracle.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);

test("older WASM without optional split exports still opens edits and saves without partial mutations", async () => {
  const input = fixture("charshape");
  for (const names of [["hwp5_edit_split_range"], ["hwp5_edit_split_range", "hwp5_edit_split"]]) {
    const older = Buffer.from(wasm);
    for (const name of names) {
      const at = older.indexOf(Buffer.from(name));
      assert(at >= 0);
      older[at] = "x".charCodeAt(0); // Equal-length export rename leaves code/types untouched.
    }
    const module = await WebAssembly.compile(older);
    for (const name of names) assert.equal(WebAssembly.Module.exports(module).some(e => e.name === name), false);
    const editor = await createExperimentalHwp5Editor(module, input);
    try {
      const before = editor.text(0, 1);
      editor.enableHistory();
      assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1, endUnit: 3 }), { message: "Hwp5StructureAbiUnavailable" });
      assert.equal(editor.text(0, 1), before);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.undo(), false);
      if (names.includes("hwp5_edit_split"))
        assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1 }), { message: "Hwp5StructureAbiUnavailable" });
      else {
        editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1 });
        assert.equal(editor.undo(), true);
      }
      editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "기존" });
      assert.ok(editor.text(0, 1).startsWith("기존"));
      assert.ok(editor.save({ allowStaleLayout: true }).bytes.length);
    } finally { editor.close(); }
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1, endUnit: 3 }), { message: "EditorClosed" });
  }
});

test("selected text replacement split is one history transaction with independent complete records", async () => {
  for (const [name, paragraph] of [["charshape", 1], ["software", 2]]) {
    const input = fixture(name), editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      const before = editor.text(0, paragraph);
      const endUnit = Math.min(3, before.length - 1);
      editor.enableHistory();
      editor.splitParagraph({ section: 0, paragraph, atUnit: 1, endUnit });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(input, saved, 0, paragraph, 1, endUnit);
      assert.equal(editor.text(0, paragraph), before.slice(0, 1) + "\r");
      assert.equal(editor.text(0, paragraph + 1), before.slice(endUnit));
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.undo(), false, "deletion and split must be one native history entry");
      assert.throws(() => editor.splitParagraph({ section: 0, paragraph, atUnit: 3, endUnit: 1 }), { message: "InvalidTextPosition" });
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    } finally { editor.close(); }
  }
});

test("public HWP5 split saves, reopens and restores native history on real root and table paragraphs", async () => {
  for (const [name, paragraph, atUnit] of [["charshape", 1, 1], ["software", 2, 1], ["table", 1, 0]]) {
    const input = fixture(name), editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      const before = editor.text(0, paragraph), count = editor.paragraphCount(0);
      editor.enableHistory();
      editor.splitParagraph({ section: 0, paragraph, atUnit });
      assert.equal(editor.paragraphCount(0), count + 1);
      assert.equal(editor.text(0, paragraph), before === "" ? "" : before.slice(0, atUnit) + "\r");
      assert.equal(editor.text(0, paragraph + 1), before.slice(atUnit) || "\r");
      assert.throws(() => editor.save(), { message: "LayoutReflowRequired" });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(input, saved, 0, paragraph, atUnit);
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try {
        assert.equal(reopened.paragraphCount(0), count + 1);
        for (let p = 0; p < count + 1; p++) assert.deepEqual(reopened.copyText(0, p), editor.copyText(0, p));
      } finally { reopened.close(); }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      editor.splice({ section: 0, paragraph: paragraph + 1, startUnit: 0, endUnit: 0, text: "후속😀" });
      assert.ok(editor.text(0, paragraph + 1).startsWith("후속😀"));
      const typed = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(saved, typed, 0, paragraph + 1, 0, 0, "후속😀");
      editor.splitParagraph({ section: 0, paragraph: paragraph + 1, atUnit: 2 });
      assert.equal(editor.paragraphCount(0), count + 2);
      const splitAgain = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(typed, splitAgain, 0, paragraph + 1, 2);
      editor.splitParagraph({ section: 0, paragraph: paragraph + 2, atUnit: 0, endUnit: 2 });
      const selectedAgain = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(splitAgain, selectedAgain, 0, paragraph + 2, 0, 2);
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, splitAgain);
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, typed);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, splitAgain);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, selectedAgain);
    } finally { editor.close(); }
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph, atUnit }), { message: "EditorClosed" });
  }
});

test("public split rejects invalid integers and surrogate cuts without changing model or redo", async () => {
  const editor = await createExperimentalHwp5Editor(wasm, fixture("charshape"));
  try {
    editor.enableHistory();
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "😀" });
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    const count = editor.paragraphCount(0);
    for (const field of ["section", "paragraph", "atUnit"])
      for (const value of [-1, 0.5, NaN, "0", null, 0x100000000])
        assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 0, [field]: value }), { message: `Invalid ${field}` });
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1 }));
    assert.equal(editor.paragraphCount(0), count);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.splitParagraph({ section: 0xffffffff, paragraph: 1, atUnit: 0 }));
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
  } finally { editor.close(); }
});

test("independent whole-record split oracle covers beginning middle end and rejects ignored edits", async () => {
  for (const [name, paragraph] of [["charshape", 1], ["software", 2], ["table", 1]]) {
    const input = fixture(name);
    const probe = await createExperimentalHwp5Editor(wasm, input);
    let end;
    try { end = Math.max(0, probe.text(0, paragraph).length - 1); }
    finally { probe.close(); }
    for (const atUnit of new Set([0, Math.floor(end / 2), end])) {
      const editor = await createExperimentalHwp5Editor(wasm, input);
      try {
        editor.splitParagraph({ section: 0, paragraph, atUnit });
        verifySplit(input, editor.save({ allowStaleLayout: true }).bytes, 0, paragraph, atUnit);
        assert.throws(() => verifySplit(input, input, 0, paragraph, atUnit), assert.AssertionError);
      } finally { editor.close(); }
    }
  }
});
