import test from "node:test";
import assert from "node:assert/strict";
import { layoutCreatedTable } from "../../web/preview/created-table-layout.mjs";
const table = { section: 0, identity: "9007199254740993", rows: 1, columns: 2, resources: { character: 7 }, cells: [
  { row: 0, column: 0, width: 7200, height: 1000, text: "가😀" },
  { row: 0, column: 1, width: 7200, height: 1000, text: "" },
] };
const measure = text => ({ width: [...text].length * 8, height: 16 });
test("created table local flow uses shared units and explicit identity cell ownership", () => {
  const before = structuredClone(table);
  const result = layoutCreatedTable(table, measure, { x: 30, y: 40 });
  assert.equal(result.width, 192);
  assert.equal(result.boxes.length, 2);
  assert.equal(result.boxes[1].x, 126);
  assert.equal(result.boxes[1].createdCell.column, 1);
  assert.equal(result.rows[0].createdCell.identity, table.identity);
  assert.deepEqual(result.rows[0].boundaries.map(b => b.unit), [0, 1, 3]);
  assert.equal(result.rows[0].tableNode, undefined);
  assert.equal(result.paragraphs[0].paragraph, undefined);
  assert.equal(result.paragraphs[0].characterRanges[0].charShapeId, 7);
  assert.deepEqual(table, before);
});
test("created table local flow refuses row truncation", () => {
  assert.throws(() => layoutCreatedTable(table, measure, { maxRows: 1 }), /CreatedTableLayoutRowBudgetExceeded/);
  assert.throws(() => layoutCreatedTable({ ...table, identity: 1 }, measure), /InvalidCreatedTableLayout/);
});
