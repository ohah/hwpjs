import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tableGrid } from "../../web/preview/table-grid.mjs";
import { measureTableCells } from "../../web/preview/table-cell-measurement.mjs";
import { measureNestedTable } from "../../web/preview/nested-table-measurement.mjs";
import { sourceTableColumns } from "../../web/preview/table-source-columns.mjs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";

test("explicit source row minimum removes UI growth but preserves default and measurements", () => {
  const table = { rows: 1, columns: 1, cells: [{ listNode: 3, row: 0, column: 0, rowSpan: 1, columnSpan: 1, width: 3000, height: 750 }] };
  const before = structuredClone(table);
  assert.equal(tableGrid(table).height, 28);
  assert.equal(tableGrid(table, { minRow: 0 }).height, 10);
  assert.equal(tableGrid(table, { minRow: 0, contentSize: () => ({ width: 0, height: 17 }) }).height, 17);
  for (const value of [-1, NaN, Infinity]) assert.throws(() => tableGrid(table, { minRow: value }), /InvalidTableGrid/);
  assert.equal(measureTableCells(table, [], () => 4, { minimumRowHeight: -1 }).error, "InvalidTableCellMeasurement");
  assert.deepEqual(table, before);
});

test("actual floating child row height is not expanded by a display-only minimum", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit field display candidate required");
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: readFileSync("reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx") });
  assert.equal(loaded.error, undefined);
  const table = loaded.content.tables.find(row => row.tableNode === 391), before = structuredClone(table);
  const source = sourceTableColumns(table);
  assert.equal(source.state, "resolved");
  const measure = text => ({ width: text.length * 4, height: 12 });
  const previous = measureTableCells(table, loaded.content.paragraphs, measure, { origin: { x: 0, y: 0 }, padding: "source", compactLines: true, columnWidths: source.columns.map(width => width / 75), paragraphFlows: loaded.content.paragraphFlows });
  const current = measureNestedTable(loaded.content, table, measure);
  assert.equal(previous.state, "measured"); assert.equal(current.state, "measured");
  assert(previous.grid.height > table.sourceGeometry.geometry.height / 75);
  assert(current.grid.height <= table.sourceGeometry.geometry.height / 75);
  assert(Math.abs(previous.grid.height - 392.6133333333333) < 1e-8);
  assert(Math.abs(current.grid.height - 310.2666666666667) < 1e-8);
  assert.deepEqual(table, before);
  t.diagnostic("Explicit width4/height12 metrics; not real browser or original font shaping evidence");
});
