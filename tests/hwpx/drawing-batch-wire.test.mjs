import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { decodeDrawingTextSnapshots } from "../../js/hwpx-drawing-text-snapshots.mjs";
import { decodeRectangleRenderingSources } from "../../js/hwpx-rectangle-rendering-sources.mjs";

test("both drawing batch wires reject every truncation and malformed inventory", async () => {
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    editor.open(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx"));
    const drawingNodes = [...new Set(editor.drawingTextBindings(0).map(row => row.drawingNode))].sort((a, b) => a - b);
    const drawingRows = drawingNodes.map(node => editor.drawingTextSnapshot(0, node));
    const rectangleRows = editor.rectangleNodes(0).map(node => editor.rectangleRenderingSource(0, node));
    const encode = value => new TextEncoder().encode(JSON.stringify(value));
    for (const [decode, rows, key] of [
      [decodeDrawingTextSnapshots, drawingRows, "drawing_node"],
      [decodeRectangleRenderingSources, rectangleRows, "rectangle_node"],
    ]) {
      assert(rows.length >= 2);
      const bytes = encode(rows);
      assert.deepEqual(decode(bytes), rows);
      assert.deepEqual(decode(encode([])), []);
      for (let cut = 0; cut < bytes.length; cut++) assert.throws(() => decode(bytes.subarray(0, cut)), `accepted truncation ${key}:${cut}`);
      for (const value of [null, {}, true, 0, [null], [rows[0], rows[0]], [...rows].reverse(), [{ ...rows[0], [key]: -1 }], [{ ...rows[0], [key]: 1.5 }], Array(100001).fill(null)]) {
        assert.throws(() => decode(encode(value)));
      }
      for (const invalid of [undefined, null, "[]", [], bytes.buffer]) assert.throws(() => decode(invalid));
      assert.throws(() => decode(new Uint8Array([255])));
      const original = JSON.stringify(rows);
      decode(bytes)[0][key] = 999;
      assert.equal(JSON.stringify(rows), original);
      assert.deepEqual(decode(bytes), rows);
    }
  } finally { editor.close(); }
});
