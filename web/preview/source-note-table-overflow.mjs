import { tableBorderPaintIndex, tableBorderPlanForBox } from './table-border-plan.mjs';
import { rowLeft, rowVisualHeight } from './row-geometry.mjs';
import { textBoundaryExtent } from './text-line-width.mjs';
const key = (value) => `${value.section}:${value.tableNode}`;
export function sourceNoteOverflowTables(content, source, width) {
  const index = tableBorderPaintIndex(content),
    allowed = new Set();
  for (const entries of source.hosts.values())
    for (const entry of entries) {
      if (entry.width <= width + 1e-8) continue;
      const table = source.tables.get(entry.tableNode)?.table;
      if (
        !table ||
        table.cells.some(
          (cell) =>
            tableBorderPlanForBox(index, {
              section: table.section,
              tableNode: table.tableNode,
              listNode: cell.listNode,
            }).state !== 'none',
        )
      )
        return { state: 'unavailable', error: 'UnprovenSourceNoteOverflowStyle' };
      allowed.add(key(table));
    }
  return { state: 'selected', tables: allowed };
}
// 승인한 것은 빈 외곽뿐입니다. 실제 측정된 내용은 단 안에 있어야 합니다.
export function sourceNoteOverflowBounds(layout, tables, columnFor) {
  const boxes = new Set();
  const fail = () => ({ state: 'unavailable', error: 'SourceNoteTableInkOverflow' });
  for (const box of layout.boxes ?? [])
    if (tables.has(key(box))) {
      const column = columnFor(box.pageOrdinal);
      if (
        !column ||
        ![
          box.x,
          box.y,
          box.width,
          box.height,
          column.x,
          column.y,
          column.width,
          column.height,
        ].every(Number.isFinite) ||
        box.width <= 0 ||
        box.height <= 0 ||
        column.width <= 0 ||
        column.height <= 0 ||
        !Number.isFinite(box.x + box.width) ||
        !Number.isFinite(box.y + box.height) ||
        box.y < column.y - 1e-8 ||
        box.y + box.height > column.y + column.height + 1e-8
      )
        return fail();
      boxes.add(box);
    }
  for (const row of layout.rows)
    if (tables.has(key(row)) && row.kind === 'text') {
      const column = columnFor(row.pageOrdinal),
        points = row.boundaries;
      if (
        !column ||
        row.transform !== undefined ||
        !Array.isArray(points) ||
        !points.length ||
        points.some((p) => !Number.isFinite(p.x))
      )
        return fail();
      const extent = textBoundaryExtent(points);
      if (!extent) return fail();
      const left = rowLeft(row) + extent.left,
        right = rowLeft(row) + extent.right;
      const bottom = row.y + rowVisualHeight(row);
      if (
        ![left, right, row.y, bottom].every(Number.isFinite) ||
        left < column.x - 1e-8 ||
        right > column.x + column.width + 1e-8 ||
        row.y < column.y - 1e-8 ||
        bottom > column.y + column.height + 1e-8
      )
        return fail();
    }
  for (const picture of layout.flowPictures ?? [])
    if (tables.has(key({ section: picture.section, tableNode: picture.cell?.tableNode }))) {
      const column = columnFor(picture.pageOrdinal),
        box = picture.rectangle;
      if (
        !column ||
        !box ||
        ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
          Number.isFinite,
        ) ||
        box.width <= 0 ||
        box.height <= 0 ||
        box.x < column.x - 1e-8 ||
        box.x + box.width > column.x + column.width + 1e-8 ||
        box.y < column.y - 1e-8 ||
        box.y + box.height > column.y + column.height + 1e-8
      )
        return fail();
    }
  return { state: 'contained', nonPaintingBoxes: boxes };
}
