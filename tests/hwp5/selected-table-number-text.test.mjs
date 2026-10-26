import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, verifyRaw } from "./style-preservation/text-record-oracle.mjs";
import { independentFieldSpans } from "./field-span-oracle.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit selected-field candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
for (const [name, section] of [
  ["hwpspec.hwp", 2],
  ["hwpspec.hwp", 3],
  ["hwp-3.0-HWPML.hwp", 2],
])
  test(`${name} selected table-number section ${section}: exterior text preserves labels and result rejection preserves redo`, async () => {
    const path = `reference/rhwp/samples/${name}`,
      input = readFileSync(path);
    const editor = await createExperimentalHwp5Editor(wasm, input, {
      distribution: true,
      normalizeObservedCfb: true,
    });
    try {
      editor.validateTextSourcePolicy(section);
      editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
      const baseline = editor.save().bytes;
      const fields = independentFieldSpans(inspect(baseline).sections[section].bytes).filter(
        (row) => row.field_id === 0x25787266,
      );
      assert(fields.length > 0);
      const paragraph = 0,
        text = "표참조구역😀",
        oldText = editor.text(section, paragraph);
      editor.splice({ section, paragraph, startUnit: 0, endUnit: 0, text });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(baseline, saved, section, paragraph, 0, 0, text, { fieldIds: [0x25787266] });
      assert.equal(editor.text(section, paragraph), text + oldText);
      const reopened = await createExperimentalHwp5Editor(wasm, saved, { distribution: true });
      try {
        assert.equal(reopened.text(section, paragraph), editor.text(section, paragraph));
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save().bytes, baseline);
      // Every independently decoded label boundary must remain protected, not
      // just the first reference or a source-policy success sample.
      for (const span of fields)
        for (const position of [span.begin, span.end]) {
          assert.throws(
            () =>
              editor.splice({
                section,
                paragraph: position.paragraph,
                startUnit: position.unit,
                endUnit: position.unit,
                text: "거부",
              }),
            /ReadOnlyCrossReferenceResult/,
          );
          assert.deepEqual(editor.save().bytes, baseline);
        }
      const label = fields.find(
        (span) => span.begin.paragraph === span.end.paragraph && span.begin.unit < span.end.unit,
      );
      assert(label, "Fixture must include a nonempty derived result");
      assert.throws(
        () =>
          editor.splice({
            section,
            paragraph: label.begin.paragraph,
            startUnit: label.begin.unit,
            endUnit: label.end.unit,
            text: "",
          }),
        /ReadOnlyCrossReferenceResult/,
      );
      assert.deepEqual(editor.save().bytes, baseline);
      for (const command of [
        () => editor.splitParagraph({ section, paragraph: 0, atUnit: 0 }),
        () => editor.mergeParagraph({ section, paragraph: 0 }),
      ]) {
        assert.throws(command, /UnsupportedSectionControl/);
        assert.deepEqual(editor.save().bytes, baseline);
      }
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      assert.deepEqual(readFileSync(path), input);
    } finally {
      editor.close();
    }
  });

test("object-number retention does not grant actual page-reference kinds", async () => {
  for (const path of ["pic-in-head-01.hwp"]) {
    const input = readFileSync(`reference/rhwp/samples/${path}`);
    const editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      editor.enableHistory();
      assert.throws(() => editor.validateTextSourcePolicy(0), /UnsupportedSectionControl/);
      assert.throws(
        () => editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "거부" }),
        /UnsupportedSectionControl/,
      );
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.undo(), false);
      assert.equal(editor.redo(), false);
    } finally {
      editor.close();
    }
  }
});
