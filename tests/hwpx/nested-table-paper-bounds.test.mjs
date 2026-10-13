import test from "node:test";
import assert from "node:assert/strict";
import { nestedTablePaperBounds } from "../../web/preview/nested-table-paper-bounds.mjs";

test("final nested bounds allow cell overflow but never paper overflow or absent references", () => {
  const box = { tableNode: 2, listNode: 12, depth: 1, x: 90, y: 20, width: 110, height: 20,
    referenceBoxes: { paper: { x: 10, y: 10, width: 190, height: 190 } } };
  const before = structuredClone(box);
  assert.equal(nestedTablePaperBounds([box]).state, "contained");
  for (const patch of [{ x: 9 }, { y: 9 }, { width: 111 }, { height: 181 }]) {
    const result = nestedTablePaperBounds([{ ...box, ...patch }]);
    assert.equal(result.error, "NestedTablePaperOverflow");
    assert.equal(result.tableNode, 2);
  }
  for (const patch of [{ referenceBoxes: {} }, { width: NaN }, { height: 0 }])
    assert.equal(nestedTablePaperBounds([{ ...box, ...patch }]).error, "InvalidNestedTablePaperBounds");
  assert.deepEqual(box, before);
});
