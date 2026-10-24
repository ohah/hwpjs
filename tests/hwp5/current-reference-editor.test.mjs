import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { decodeHwp5CurrentReferences } from "../../js/hwp5-current-references.mjs";
import { verifyRaw } from "./style-preservation/text-record-oracle.mjs";

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");

test("current source references edit actual CFB and reject stale, foreign and closed handles", async () => {
  const editor = await createExperimentalHwp5Editor(wasm, input);
  const other = await createExperimentalHwp5Editor(wasm, input);
  try {
    assert.equal(editor.supportsCurrentReferences(), true);
    editor.enableHistory();
    const window = editor.currentReferences(0, { count: 1024 });
    assert.equal(window.references.length, window.total);
    for (let i = 0; i < window.total; i++)
      assert.equal(editor.currentText(window.references[i]), editor.text(0, i));
    assert.deepEqual(editor.currentReferences(0, { first: window.total }).references, []);
    assert.throws(() => editor.currentReferences(0, { first: window.total + 1 }));
    assert.throws(() => editor.currentReferences(0, { count: 1025 }));
    const reference = window.references[1];
    assert.throws(() => other.currentText(reference), /InvalidCurrentReferenceScope/);
    const before = editor.currentText(reference);
    assert.throws(() => editor.spliceCurrent({ reference, startUnit: 0, endUnit: 0, text: "\ud800" }), /InvalidUnicodeEncoding/);
    assert.equal(editor.currentText(reference), before);
    editor.spliceCurrent({ reference, startUnit: 0, endUnit: 0, text: "입력😀" });
    verifyRaw(input, editor.save({ allowStaleLayout: true }).bytes, 0, 1, 0, 0, "입력😀");
    assert.throws(() => editor.currentText(reference), /StaleCurrentReference/);
    const edited = editor.currentReferences(0).references[1];
    assert.equal(editor.currentText(edited), "입력😀" + before);
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.currentText(edited), /StaleCurrentReference/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    const restored = editor.currentReferences(0).references[1];
    editor.spliceCurrent({ reference: restored, startUnit: 0, endUnit: 0, text: "" });
    assert.equal(editor.currentText(restored), before);
    assert.equal(editor.redo(), true);
    assert.throws(() => editor.currentText(restored), /StaleCurrentReference/);
    const fresh = editor.currentReferences(0).references[1];
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "A" });
    assert.throws(() => editor.currentText(fresh), /StaleCurrentReference/);
  } finally { editor.close(); other.close(); }
  assert.throws(() => editor.currentReferences(0), /EditorClosed/);
  assert.throws(() => editor.currentText({}), /EditorClosed/);
});

test("current reference decoder preserves u64 strings and rejects malformed windows", () => {
  const ref = { epoch: "18446744073709551615", kind: "cell", section: 0, id: "18446744073709551615", row: 0, column: 0 };
  const wire = references => new TextEncoder().encode(JSON.stringify({ version: 1, total: references.length, first: 0, references }));
  assert.deepEqual(decodeHwp5CurrentReferences(wire([ref])).references, [ref]);
  for (const change of [{ epoch: "0" }, { id: "01" }, { id: "18446744073709551616" }, { kind: "generated" }, { section: -1 }, { row: 0.5 }, { extra: true }])
    assert.throws(() => decodeHwp5CurrentReferences(wire([{ ...ref, ...change }])));
  assert.throws(() => decodeHwp5CurrentReferences(wire([ref, { ...ref, epoch: "1" }])));
  assert.throws(() => decodeHwp5CurrentReferences(new Uint8Array([255])));
});
