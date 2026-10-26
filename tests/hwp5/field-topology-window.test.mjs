import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { readHwp5WindowFields } from "../../web/preview/hwp5-field-window-topology.mjs";
import { hwp5FieldWindowDependencies } from "../../web/preview/hwp5-field-window-dependencies.mjs";
import {
  projectHwp5DependencyWindow,
  projectHwp5FieldOwnedWindow,
} from "../../web/preview/hwp5-window-projection.mjs";
import { linkHwp5UnresolvedFieldOwners } from "../../web/preview/hwp5-unresolved-field-dependencies.mjs";

test("unresolved owner closure groups repeated markers once per native scope", () => {
  const { projection, editor } = fixture(),
    flows = editor.paragraphFlow(0);
  const markers = [marker(), { ...marker(), position: { paragraph: 2, unit: 8 } }];
  let resolved = 0,
    linked = 0;
  linkHwp5UnresolvedFieldOwners(
    projection.sections[0],
    flows,
    markers,
    (section, paragraph) => {
      assert.equal(section, 0);
      resolved++;
      return paragraph;
    },
    () => {
      linked++;
    },
  );
  assert.equal(resolved, 4);
  assert.equal(linked, 4);
});

const refusal = () => {
  throw new Error("UnsupportedCrossParagraphField");
};
const marker = () => ({
  kind: "unclosed_start",
  position: { paragraph: 0, unit: 8 },
  marker_id: 0x25636c6b,
  ordinal: 0,
  list_node: 11,
});
const flow = (paragraph, list_node) => ({
  paragraph,
  host: list_node === null ? "body" : "table_cell",
  parent_node: list_node === null ? null : 10,
  list_node,
});
function fixture() {
  const projection = {
    version: [5, 0, 0, 0],
    sections: [
      {
        index: 0,
        paragraphs: [0, 1, 2].map(() => ({
          text: "선택",
          textPresent: true,
          declaredUnits: 10,
          parentNodeIndex: null,
          tokens: [],
        })),
      },
    ],
  };
  const editor = {
    fieldSpans: refusal,
    supportsFieldTopology: () => true,
    fieldTopology: () => ({ spans: [], unresolved: [marker()] }),
    paragraphFlow: () => [flow(0, 11), flow(1, null), flow(2, 11)],
  };
  return { projection, editor };
}
test("unresolved field display retains its entire owner and closes permission without guessing an end", () => {
  const { editor, projection } = fixture();
  const content = projectHwp5DependencyWindow(
    editor,
    projection,
    { offset: 2, count: 1 },
    hwp5FieldWindowDependencies,
  );
  assert.deepEqual(
    content.paragraphs.map((row) => row.paragraph),
    [0, 2],
  );
  assert.equal(content.window.contextCount, 1);
  assert.equal(content.readOnly, true);
  assert(
    content.paragraphs.every(
      (row) => !row.editable && row.fieldTopologyError === "UnresolvedFieldMarkers",
    ),
  );
  assert.equal(content.paragraphs[0].selectable, false);
  assert.equal(content.paragraphs[1].selectable, true);
  assert.deepEqual(content.fieldTopologyDiagnostics, [{ section: 0, unresolved: [marker()] }]);
  assert.throws(
    () =>
      projectHwp5DependencyWindow(
        editor,
        projection,
        { offset: 2, count: 1, maxParagraphs: 1 },
        hwp5FieldWindowDependencies,
      ),
    /ParagraphWindowBudgetExceeded/,
  );
});
test("diagnostic display refuses missing ABI unknown failures empty fallback and forged owner or units", () => {
  const { editor, projection } = fixture();
  assert.throws(
    () => readHwp5WindowFields({ ...editor, supportsFieldTopology: () => false }, 0),
    /UnsupportedCrossParagraphField/,
  );
  assert.throws(
    () =>
      readHwp5WindowFields(
        {
          ...editor,
          fieldSpans: () => {
            throw new Error("OutOfMemory");
          },
        },
        0,
      ),
    /OutOfMemory/,
  );
  assert.throws(
    () =>
      readHwp5WindowFields({ ...editor, fieldTopology: () => ({ spans: [], unresolved: [] }) }, 0),
    /UnsupportedCrossParagraphField/,
  );
  for (const mutate of [
    (row) => {
      row.list_node = 12;
    },
    (row) => {
      row.position.unit = 11;
    },
    (row) => {
      row.position.paragraph = 3;
    },
  ]) {
    const row = marker();
    mutate(row);
    assert.throws(
      () =>
        hwp5FieldWindowDependencies(
          { ...editor, fieldTopology: () => ({ spans: [], unresolved: [row] }) },
          projection,
        ),
      /WindowDependencyBindingMismatch/,
    );
  }
});
test("actual unclosed regulatory field window is readable while strict edits remain refused", async () => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit topology candidate required");
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM),
    path = "reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp",
    input = readFileSync(path);
  const editor = await createExperimentalHwp5Editor(wasm, input),
    reader = await createHwp5Reader(wasm);
  try {
    editor.enableHistory();
    const content = projectHwp5FieldOwnedWindow(editor, reader.readText(input), {
      offset: 52,
      count: 1,
    });
    assert.equal(content.readOnly, true);
    assert.equal(content.fieldTopologyDiagnostics[0].unresolved.length, 1);
    assert(content.paragraphs.some((row) => row.paragraph === 52));
    assert(content.paragraphs.every((row) => row.editable === false));
    assert.throws(() => editor.validateTextSourcePolicy(0), /UnsupportedCrossParagraphField/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false);
    assert.equal(editor.redo(), false);
  } finally {
    reader.close();
    editor.close();
  }
  assert.deepEqual(readFileSync(path), input);
});
