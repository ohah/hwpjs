import { layoutContent } from "./layout.mjs";
import { tableGrid, hwpUnitsToPixels } from "./table-grid.mjs";

// Local display flow; identity addresses never become source node indices.
export function layoutCreatedTable(table, measure, { x = 20, y = 0, maxRows = 20000 } = {}) {
  if (typeof table?.identity !== "string" || !Number.isInteger(table.section) || table.section < 0) throw new Error("InvalidCreatedTableLayout");
  if (!Number.isInteger(maxRows) || maxRows < 1) throw new Error("InvalidCreatedTableLayout");
  const cells = table.cells.map(cell => ({ ...cell, rowSpan: 1, columnSpan: 1 }));
  const columnWidths = cells.slice(0, table.columns).map(cell => hwpUnitsToPixels(cell.width));
  tableGrid({ ...table, cells }, { x, y, columnWidths, minColumn: 1, minRow: 1 });
  const paragraphs = cells.map(cell => ({ section: table.section, createdCell: { identity: table.identity, row: cell.row, column: cell.column }, text: cell.text, editable: true, selectable: true, label: "", characterRanges: [{ start: 0, end: cell.text.length, charShapeId: table.resources.character }] }));
  const flows = [];
  let count = 0;
  for (const [index, paragraph] of paragraphs.entries()) {
    if (count === maxRows) throw new Error("CreatedTableLayoutRowBudgetExceeded");
    const flow = layoutContent({ paragraphs: [paragraph], limited: false }, Math.max(1, columnWidths[cells[index].column] - 12), (text, _p, unit, kind) => measure(text, paragraph, unit, kind), maxRows - count, { compactLines: true });
    const textRows = flow.rows.filter(row => row.kind === "text");
    if (flow.limited || count + textRows.length > maxRows) throw new Error("CreatedTableLayoutRowBudgetExceeded");
    count += textRows.length;
    flows.push({ ...flow, rows: textRows });
  }
  const grid = tableGrid({ ...table, cells }, { x, y, columnWidths, minColumn: 1, minRow: 1, contentSize: cell => ({ width: 0, height: flows[cell.row * table.columns + cell.column].height + 12 }) });
  const boxes = grid.cells.map(({ listNode: _unused, ...box }, index) => ({ ...box, section: table.section, createdCell: paragraphs[index].createdCell }));
  const rows = flows.flatMap((flow, index) => flow.rows.map(row => ({ ...row, section: table.section, createdCell: paragraphs[index].createdCell, x: boxes[index].x + 6, y: boxes[index].y + 6 + row.y, width: Math.max(1, boxes[index].width - 12), pageClip: { x: boxes[index].x, y: boxes[index].y, width: boxes[index].width, height: boxes[index].height } })));
  return { rows, boxes, paragraphs, width: grid.width, height: grid.height, limited: false, spatialRows: true, mode: "created-table-local-flow" };
}
