import { hwpUnitPixels } from "./hwp-units.mjs";
import { tableInsets } from "./table-insets.mjs";

/** Explicit source selection; absent flags/fields are not inferred. */
export function sourceTableCellInsets(table, cell) {
  const flag = cell?.sourceMargin?.has_margin;
  const values =
    flag === true
      ? cell.sourceMargin.margin
      : flag === false
        ? table?.sourceGeometry?.in_margin
        : null;
  if (
    !Array.isArray(values) ||
    values.length !== 4 ||
    !values.every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff)
  )
    return null;
  const [left, right, top, bottom] = values.map(hwpUnitPixels);
  return tableInsets({ left, right, top, bottom });
}

/** Resolve the explicit source mode once for measurement and projection. */
export function resolveTablePadding(table, padding) {
  if (padding !== "source") return padding;
  if (!Array.isArray(table?.cells) || table.cells.some((cell) => !cell)) return null;
  const values = new Map();
  for (const cell of table.cells) {
    if (values.has(cell.listNode)) return null;
    const insets = sourceTableCellInsets(table, cell);
    if (!insets) return null;
    values.set(cell.listNode, insets);
  }
  return values;
}
