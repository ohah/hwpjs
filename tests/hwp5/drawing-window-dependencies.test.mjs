import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { hwp5DrawingWindowDependencies } from "../../web/preview/hwp5-drawing-window-dependencies.mjs";
import { projectHwp5OwnedWindow } from "../../web/preview/hwp5-window-projection.mjs";

test("actual rectangle and grouped drawing bodies retain hosts and unchanged saves", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  for (const name of ["textbox", "shaperect", "shapecontainer-2"]) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const reader = await createHwp5Reader(wasm), editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      const projection = reader.readText(input), found = hwp5DrawingWindowDependencies(editor, projection);
      assert(found.dependencies.size > 0, name);
      for (const section of projection.sections) {
        for (const flow of editor.paragraphFlow(section.index).filter(row => row.host === "drawing")) {
          const child = found.ordinals.get(`${section.index}:${flow.paragraph}`);
          assert(found.dependencies.get(child)?.length > 0, `${name}:${child}`);
          for (const parent of found.dependencies.get(child)) assert(found.dependencies.get(parent)?.includes(child));
          const content = projectHwp5OwnedWindow(editor, projection, { offset: child, count: 1 });
          assert.equal(content.paragraphs.filter(row => !row.windowContext).length, 1);
          assert(content.window.contextCount > 0);
          assert(content.paragraphs.filter(row => row.windowContext).every(row => row.editable === false && row.selectable === false));
        }
      }
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally { editor.close(); reader.close(); }
  }
});

function fixture() {
  const projection = { sections: [{ index: 0, paragraphs: ["host", "caption"] }] };
  const rows = {
    flows: [{ paragraph: 0, host: "body" }, { paragraph: 1, host: "drawing", parent_node: 10, list_node: 12 }],
    anchors: [{ control_node: 10, component_node: 11, paragraph: 0, source_unit: 0, current_unit: 0 }],
    lists: [{ kind: "caption", control_node: 10, owner_node: 10, list_node: 12, paragraph_count: 1,
      attributes: 0, extra_bytes: 0, unknown: null, extra_nonzero: false,
      margins: null, last_width: null, body_extra_bytes: null }],
  };
  const editor = { paragraphFlow: () => rows.flows, drawingAnchors: () => rows.anchors,
    drawingListSources: () => rows.lists, drawingComponentSources: () => { throw new Error("UnexpectedComponentQuery"); } };
  return { projection, rows, editor };
}

test("drawing caption window keeps mutual host ownership without changing sources", () => {
  const { projection, rows, editor } = fixture(), before = structuredClone(rows);
  const result = hwp5DrawingWindowDependencies(editor, projection);
  assert.equal(result.total, 2);
  assert.deepEqual(result.dependencies, new Map([[1, [0]], [0, [1]]]));
  assert.deepEqual(rows, before);
});

test("drawing window rejects missing roots, foreign lists and incomplete flow", () => {
  for (const mutate of [
    rows => { rows.anchors = []; },
    rows => { rows.flows[1].list_node = 13; },
    rows => { rows.flows.pop(); },
    rows => { rows.anchors[0].paragraph = 2; },
    rows => { rows.flows[1].paragraph = 0; },
    rows => { rows.flows[1].parent_node = "10"; },
    rows => { rows.flows[1].list_node = "12"; },
  ]) {
    const { projection, rows, editor } = fixture(); mutate(rows);
    assert.throws(() => hwp5DrawingWindowDependencies(editor, projection), /WindowDependencyBindingMismatch|MissingWindowDrawingBody/);
  }
});

test("declared empty drawing caption does not invent a paragraph", () => {
  const { projection, rows, editor } = fixture();
  rows.lists[0].paragraph_count = 0;
  rows.flows[1] = { paragraph: 1, host: "body" };
  assert.equal(hwp5DrawingWindowDependencies(editor, projection).dependencies.size, 0);
  rows.lists[0].paragraph_count = 1;
  assert.throws(() => hwp5DrawingWindowDependencies(editor, projection), /MissingWindowDrawingBody/);
});
