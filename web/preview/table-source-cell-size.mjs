import { hwpUnitPixels } from "./hwp-units.mjs";

// Stored HWP5 negative heights do not impose a positive track minimum. Keep
// the unsigned wire value on the cell; content and sibling cells still size it.
export function tableSourceCellMinimumHeight(table, cell) {
  if (cell.height === null) return 0;
  const hwp5 =
    Number.isSafeInteger(table.tableNode) &&
    table.tableNode >= 0 &&
    Number.isSafeInteger(cell.listNode) &&
    cell.listNode >= 0 &&
    table.layoutSource?.table_record_node === table.tableNode &&
    cell.layoutSource?.table_record_node === table.tableNode &&
    cell.layoutSource?.list_node === cell.listNode;
  return hwp5 && cell.height >= 0x80000000 ? 0 : hwpUnitPixels(cell.height);
}
