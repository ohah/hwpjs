import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { attachRectangleSources } from "../../web/preview/rectangle-content.mjs";
import { decodeRectangleRenderingSources } from "../../js/hwpx-rectangle-rendering-sources.mjs";

test("rectangle batch projection uses fresh rows and retains per-node refusal fallback", () => {
  let singles = 0;
  let anchor = 0;
  const row = () => ({
    rectangle_node: 7,
    owner: { paragraph: 1, anchor_unit: anchor, anchor_node: 7 },
    source: {},
  });
  const editor = {
    rectangleNodes: () => [7],
    rectangleRenderingSources: () => [row()],
    rectangleRenderingSource: () => {
      singles++;
      return row();
    },
  };
  const content = { paragraphs: [{ section: 0, paragraph: 0 }] };
  attachRectangleSources(editor, content);
  assert.equal(singles, 0);
  anchor = 3;
  attachRectangleSources(editor, content);
  assert.equal(content.rectangles[0].anchorUnit, 3);
  editor.rectangleRenderingSources = () => {
    throw new Error("BatchRefused");
  };
  editor.rectangleNodes = () => [7, 8];
  editor.rectangleRenderingSource = (_, node) => {
    singles++;
    if (node === 8) throw new Error("InvalidOwner");
    return row();
  };
  attachRectangleSources(editor, content);
  assert.equal(singles, 2);
  assert.equal(content.rectangles.length, 1);
  assert.deepEqual(content.rectangleSourceErrors, [
    { section: 0, drawingNode: 8, error: "InvalidOwner" },
  ]);
});

test("public rectangle inventory equals single queries across edits and history", async () => {
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  const original = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx");
  try {
    editor.open(original);
    const check = () => {
      const rows = editor.rectangleRenderingSources(0);
      assert.deepEqual(
        rows,
        editor.rectangleNodes(0).map((node) => editor.rectangleRenderingSource(0, node)),
      );
      const encoded = new TextEncoder().encode(JSON.stringify(rows));
      assert.deepEqual(decodeRectangleRenderingSources(encoded), rows);
      assert.throws(() =>
        decodeRectangleRenderingSources(
          new TextEncoder().encode(JSON.stringify([rows[0], rows[0]])),
        ),
      );
      return rows;
    };
    const before = check();
    assert.deepEqual(Buffer.from(editor.save()), original);
    editor.enableHistory();
    editor.spliceAnchored(0, 1, 0, 0, "앞😀");
    const after = check();
    assert(after.every((row) => row.owner.anchor_unit === 3));
    assert(editor.undo());
    assert.deepEqual(check(), before);
    assert.throws(() => editor.rectangleRenderingSources(999), /InvalidSectionIndex/);
    assert(editor.redo());
    assert.deepEqual(check(), after);
  } finally {
    editor.close();
  }
});
