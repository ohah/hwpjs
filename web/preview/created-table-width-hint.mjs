import { sourceTableCellInsets } from './table-source-insets.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

// UI suggestion only: never changes a submitted width or grants edit permission.
export function createdTableWidthHint(content, point) {
  const paragraphs = content.paragraphs?.filter(
    (p) => p.section === point?.section && p.paragraph === point?.paragraph,
  );
  if (paragraphs?.length !== 1 || paragraphs[0].clipped) return null;
  const owner = paragraphs[0].tableCell;
  if (!owner) return null;
  const tables = content.tables?.filter(
    (t) => t.section === point.section && t.tableNode === owner.tableNode,
  );
  if (tables?.length !== 1 || tables[0].partial) return null;
  const cells = tables[0].cells?.filter((c) => c.listNode === owner.listNode);
  if (cells?.length !== 1) return null;
  const cell = cells[0],
    insets = sourceTableCellInsets(tables[0], cell);
  if (!Number.isSafeInteger(cell.width) || cell.width < 1 || cell.width > 0xffffffff || !insets)
    return null;
  // The shared insets originate in integer HWPUNIT values. Recover that integer
  // before subtraction rather than flooring a floating-point pixel round trip.
  const paddingUnits = Math.round((insets.left + insets.right) / hwpUnitPixels(1));
  const width = cell.width - paddingUnits;
  return width >= 1 && width <= 0xffffffff ? width : null;
}
