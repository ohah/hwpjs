import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { attachDrawingTextBindings } from "../../web/preview/drawing-text-content.mjs";
import { decodeDrawingTextSnapshots } from "../../js/hwpx-drawing-text-snapshots.mjs";

test("drawing snapshot batch is fresh and refused batch keeps individual errors", () => {
  let calls = 0,
    anchor = 0;
  const source = () => ({ drawing_node: 7, paragraph: 1, anchor_unit: anchor });
  const editor = {
    drawingTextBindings: () => [
      { paragraph: 2, drawingNode: 7, textNode: 8, listNode: 9, kind: "text" },
    ],
    drawingTextSnapshots: () => [source()],
    drawingTextSnapshot: () => {
      calls++;
      return source();
    },
  };
  const content = {
    paragraphs: [
      { section: 0, paragraph: 0 },
      { section: 0, paragraph: 1 },
    ],
  };
  attachDrawingTextBindings(editor, content);
  assert.equal(calls, 0);
  assert.equal(content.drawings.length, 1);
  anchor = 3;
  attachDrawingTextBindings(editor, content);
  assert.equal(content.drawings[0].anchorUnit, 3);
  editor.drawingTextSnapshots = () => {
    throw new Error("BatchRefused");
  };
  editor.drawingTextSnapshot = () => {
    calls++;
    throw new Error("MissingDrawingText");
  };
  attachDrawingTextBindings(editor, content);
  assert.equal(calls, 1);
  assert.deepEqual(content.drawingTextSnapshotErrors, [
    { section: 0, drawingNode: 7, error: "MissingDrawingText" },
  ]);
});

test("actual grouped and caption drawing batches equal singles with history", async () => {
  const module = await WebAssembly.compile(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  for (const name of ["shapecontainer-2", "textbox", "multicolumns-layout"]) {
    const editor = await createHwpxEditor(module);
    try {
      const bytes = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`);
      editor.open(bytes);
      const check = () => {
        const nodes = [
          ...new Set(editor.drawingTextBindings(0).map((row) => row.drawingNode)),
        ].sort((a, b) => a - b);
        const rows = editor.drawingTextSnapshots(0);
        assert.deepEqual(
          rows,
          nodes.map((node) => editor.drawingTextSnapshot(0, node)),
        );
        assert(rows.length > 0);
        const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
        assert.deepEqual(decodeDrawingTextSnapshots(encode(rows)), rows);
        assert.throws(() => decodeDrawingTextSnapshots(encode([rows[0], rows[0]])));
        return rows;
      };
      const before = check();
      assert.deepEqual(Buffer.from(editor.save()), bytes);
      editor.enableHistory();
      editor.spliceAnchored(0, before[0].paragraph, 0, 0, "앞😀");
      const after = check();
      assert.equal(after[0].anchor_unit, before[0].anchor_unit + 3);
      assert(editor.undo());
      assert.deepEqual(check(), before);
      assert.throws(() => editor.drawingTextSnapshots(999), /InvalidSectionIndex/);
      assert(editor.redo());
      assert.deepEqual(check(), after);
    } finally {
      editor.close();
    }
  }
});
