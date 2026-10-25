import { sourceTableColumns } from "./table-source-columns.mjs";
import { sourceTableRowHorizontals } from "./source-table-row-horizontals.mjs";

// Move the selected cell's right boundary and translate all boundaries to its right.
// This is distinct from editing one cell's raw width or redistributing a fixed total.
export function tableColumnWidthPlan(table, request) {
  const fail = error => ({ state: "unavailable", error });
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const resizeHeight = request?.height !== undefined || request?.expectedHeight !== undefined;
  if (!request || ![request.section, request.tableNode, request.listNode, request.width, request.expectedWidth].every(uint)
    || request.width === 0 || table?.section !== request.section || table?.tableNode !== request.tableNode)
    return fail("InvalidTableColumnWidthRequest");
  if (resizeHeight && (![request.height, request.expectedHeight].every(uint))) return fail("InvalidTableColumnWidthRequest");
  const local = sourceTableRowHorizontals(table);
  if (local.state !== "resolved") return local;
  const common = sourceTableColumns(table);
  if (common.state !== "resolved") return common;
  const selected = table.cells.find(cell => cell.listNode === request.listNode);
  if (!selected) return fail("InvalidCellDisplayOwner");
  if (selected.width !== request.expectedWidth) return fail("StaleTableColumnWidth");
  if (resizeHeight && selected.height !== request.expectedHeight) return fail("StaleTableCellHeight");
  const boundary = selected.column + selected.columnSpan, delta = request.width - selected.width;
  if (common.columns[boundary - 1] + delta <= 0) return fail("InvalidTableColumnWidthRequest");
  const cells = [];
  for (const cell of table.cells) {
    if (cell.column >= boundary || cell.column + cell.columnSpan < boundary) continue;
    const width = cell.width + delta;
    if (!uint(width) || width === 0 || !uint(cell.height)) return fail("InvalidTableColumnWidthRequest");
    const height = resizeHeight && cell.listNode === selected.listNode ? request.height : cell.height;
    if (delta !== 0 || height !== cell.height) cells.push({ section: table.section, listNode: cell.listNode, width, height });
  }
  if (cells.length > 4096) return fail("LimitExceeded");
  if (!Number.isSafeInteger(common.width + delta) || common.width + delta > 0xffffffff)
    return fail("InvalidTableColumnWidthRequest");
  return { state: "planned", cells, boundary, delta };
}
