import test from "node:test";
import assert from "node:assert/strict";
import { tableCellReferenceBox } from "../../web/preview/table-cell-reference-box.mjs";

test("cell reference uses explicit inner margins and selected cell column without outer-column fallback", () => {
  const box = { x: 100, y: 200, width: 100, height: 50 }, insets = { left: 2, right: 3, top: 4, bottom: 5 };
  const flow = { columns: [{ x: 0, y: 0, width: 30, height: 41 }, { x: 40, y: 0, width: 55, height: 41 }] };
  const before = structuredClone({ box, insets, flow });
  assert.deepEqual(tableCellReferenceBox(box, insets, {}), { x: 102, y: 204, width: 95, height: 41 });
  assert.deepEqual(tableCellReferenceBox(box, insets, flow, 1), { x: 142, y: 204, width: 55, height: 41 });
  for (const ordinal of [undefined, null, -1, 0.5, 2, "1"]) assert.equal(tableCellReferenceBox(box, insets, flow, ordinal), null);
  assert.equal(tableCellReferenceBox(box, insets, {}, 0), null);
  assert.equal(tableCellReferenceBox(box, { ...insets, left: 100 }, flow, 0), null);
  assert.equal(tableCellReferenceBox(box, insets, { columns: [{ ...flow.columns[0], width: 200 }] }, 0), null);
  assert.deepEqual({ box, insets, flow }, before);
});
