import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { hwp5FieldWindowDependencies } from "../../web/preview/hwp5-field-window-dependencies.mjs";
import { planParagraphDependencies } from "../../web/preview/paragraph-dependency-plan.mjs";
import { projectHwp5FieldOwnedWindow } from "../../web/preview/hwp5-window-projection.mjs";

test("actual cross-paragraph hyperlink window retains both field endpoints", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync(
    "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp",
  );
  const editor = await createExperimentalHwp5Editor(wasm, input),
    reader = await createHwp5Reader(wasm);
  try {
    const projection = reader.readText(input),
      found = hwp5FieldWindowDependencies(editor, projection);
    assert.deepEqual(
      planParagraphDependencies({ ...found, offset: 2, count: 1, maxParagraphs: 10 }).ordinals,
      [1, 2],
    );
    const content = projectHwp5FieldOwnedWindow(editor, projection, { offset: 2, count: 1 });
    assert.equal(content.window.contextCount, 2);
    assert.deepEqual(
      content.paragraphs.map((row) => row.paragraph),
      [0, 1, 2],
    );
    assert.equal(content.paragraphs.find((row) => row.paragraph === 1).editable, false);
    assert.equal(content.paragraphs.find((row) => row.paragraph === 1).selectable, false);
    assert.throws(
      () =>
        projectHwp5FieldOwnedWindow(editor, projection, { offset: 2, count: 1, maxParagraphs: 1 }),
      /ParagraphWindowBudgetExceeded/,
    );
    assert.throws(
      () =>
        projectHwp5FieldOwnedWindow(
          {
            ...editor,
            fieldSpans: () => {
              throw new Error("Hwp5FieldSpansAbiUnavailable");
            },
          },
          projection,
          { offset: 2, count: 1 },
        ),
      /Hwp5FieldSpansAbiUnavailable/,
    );
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
    reader.close();
  }
});

test("field windows exclude interleaved foreign lists and reject mismatched endpoints", () => {
  const projection = { sections: [{ index: 0, paragraphs: [{}, {}, {}] }] };
  const flows = [
    { paragraph: 0, host: "body", parent_node: null, list_node: null },
    { paragraph: 1, host: "table_cell", parent_node: 10, list_node: 11 },
    { paragraph: 2, host: "body", parent_node: null, list_node: null },
  ];
  const span = {
    source_node: 7,
    field_id: 0x25686c6b,
    ordinal: 0,
    begin: { paragraph: 0, unit: 8 },
    end: { paragraph: 2, unit: 0 },
  };
  const editor = { paragraphFlow: () => flows, fieldSpans: () => [span] };
  const found = hwp5FieldWindowDependencies(editor, projection);
  assert.deepEqual(
    found.dependencies,
    new Map([
      [2, [0]],
      [0, [2]],
    ]),
  );
  span.end.paragraph = 1;
  assert.throws(
    () => hwp5FieldWindowDependencies(editor, projection),
    /WindowDependencyBindingMismatch/,
  );
  span.end.paragraph = 3;
  assert.throws(
    () => hwp5FieldWindowDependencies(editor, projection),
    /WindowDependencyBindingMismatch/,
  );
});

test("reference regulatory fields retain each observed cross-paragraph list", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("reference/rhwp/samples/issue1891/76076_regulatory_analysis.hwpx");
  const editor = await createExperimentalHwp5Editor(wasm, input),
    reader = await createHwp5Reader(wasm);
  try {
    const spans = editor.fieldSpans(0),
      flows = editor.paragraphFlow(0);
    assert.equal(spans.length, 125);
    const cross = spans.filter((row) => row.begin.paragraph !== row.end.paragraph);
    assert(cross.length > 0);
    const found = hwp5FieldWindowDependencies(editor, reader.readText(input));
    for (const row of cross) {
      const first = found.ordinals.get(`0:${row.begin.paragraph}`),
        last = found.ordinals.get(`0:${row.end.paragraph}`);
      assert(found.dependencies.get(first)?.includes(last));
      assert(found.dependencies.get(last)?.includes(first));
      const owner = flows[row.begin.paragraph];
      for (const required of found.dependencies.get(first)) {
        const current = flows[required];
        assert.equal(current.host, owner.host);
        assert.equal(current.parent_node, owner.parent_node);
        assert.equal(current.list_node, owner.list_node);
      }
    }
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
    reader.close();
  }
});
