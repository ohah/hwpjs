import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records, verifyRaw } from "./style-preservation/text-record-oracle.mjs";
import {
  chartNumericTargets,
  verifyChartFormulas,
} from "./style-preservation/formula-record-oracle.mjs";

test("object metadata ordinary paragraph edits match complete independent Section records", async () => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const path = "reference/rhwp/samples/143E433F503322BD33.hwp";
  const input = readFileSync(path),
    before = inspect(input);
  const numeric = new Set(chartNumericTargets(before.sections[0].bytes));
  const editor = await createExperimentalHwp5Editor(
    readFileSync(process.env.HWPJS_TEST_WASM),
    input,
  );
  let accepted = 0,
    refusedNumeric = 0;
  try {
    editor.enableHistory();
    assert.equal(editor.paragraphCount(0), 50);
    for (let paragraph = 0; paragraph < 50; paragraph++) {
      const command = { section: 0, paragraph, startUnit: 0, endUnit: 0, text: "검증😀<&" };
      if (numeric.has(paragraph)) {
        assert.throws(() => editor.splice(command), { message: "InvalidFormulaNumber" });
        assert.deepEqual(Buffer.from(editor.save().bytes), input);
        refusedNumeric++;
        continue;
      }
      editor.splice(command);
      const saved = editor.save({ allowStaleLayout: true });
      verifyRaw(input, saved.bytes, 0, paragraph, 0, 0, command.text);
      assert.deepEqual(inspect(saved.bytes).metadata, before.metadata);
      const reopened = await createExperimentalHwp5Editor(
        readFileSync(process.env.HWPJS_TEST_WASM),
        saved.bytes,
      );
      try {
        assert.equal(reopened.text(0, paragraph), editor.text(0, paragraph));
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }), saved);
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      accepted++;
    }
    assert.equal(accepted, 38);
    assert.equal(refusedNumeric, 12);
  } finally {
    editor.close();
  }
  assert.deepEqual(readFileSync(path), input);
});

test("object metadata retention permits all twelve numeric dependencies without accepting text or losing history", async () => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  const path = "reference/rhwp/samples/143E433F503322BD33.hwp";
  const input = readFileSync(path),
    original = inspect(input);
  const originalRecords = records(original.sections[0].bytes);
  const targets = chartNumericTargets(original.sections[0].bytes);
  assert.deepEqual(targets, [18, 19, 20, 23, 24, 25, 28, 29, 30, 33, 34, 35]);
  const formulas = originalRecords.filter(
    (r) => r.tag === 71 && r.payload.length >= 4 && r.payload.readUInt32LE(0) === 0x25666d75,
  ).length;
  assert(formulas > 0);
  const retainedMetadata = originalRecords.filter((r) => r.tag === 87).map((r) => r.raw);
  assert.equal(retainedMetadata.length, 3);
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    for (const [index, paragraph] of targets.entries()) {
      const prior = editor.save({ allowStaleLayout: true });
      const source = editor.text(0, paragraph);
      assert(source.endsWith("\r"));
      assert.throws(
        () => editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: "검증😀" }),
        { message: "InvalidFormulaNumber" },
      );
      assert.deepEqual(editor.save({ allowStaleLayout: true }), prior);
      const value = String(500 + index);
      editor.splice({
        section: 0,
        paragraph,
        startUnit: 0,
        endUnit: source.length - 1,
        text: value,
      });
      assert.equal(editor.text(0, paragraph), value + "\r");
      const saved = editor.save({ allowStaleLayout: true }),
        after = inspect(saved.bytes);
      assert.equal(verifyChartFormulas(after.sections[0].bytes, formulas), formulas);
      assert.deepEqual(after.metadata, original.metadata);
      assert.deepEqual([...after.streams.keys()].sort(), [...original.streams.keys()].sort());
      for (const [name, bytes] of original.streams)
        if (name !== original.sections[0].path) assert.deepEqual(after.streams.get(name), bytes);
      assert.deepEqual(
        records(after.sections[0].bytes)
          .filter((r) => r.tag === 87)
          .map((r) => r.raw),
        retainedMetadata,
      );
      const reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
      try {
        assert.equal(reopened.text(0, paragraph), value + "\r");
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }), prior);
      assert.throws(
        () =>
          editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: "잘못된입력" }),
        { message: "InvalidFormulaNumber" },
      );
      assert.deepEqual(editor.save({ allowStaleLayout: true }), prior);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }), saved);
    }
  } finally {
    editor.close();
  }
  assert.deepEqual(readFileSync(path), input);
});
