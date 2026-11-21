import { rowPageClipContains } from './row-page-clip.mjs';
import {
  rowAtPoint,
  rowLocalPoint,
  rowLeft,
  rowTop,
  rowTextTop,
  rowTextHeight,
} from './row-geometry.mjs';
import { boundaryGlyphWidth } from './text-line-width.mjs';

/** Real cell ink wins; a supplied frame also admits selectable cell interiors. */
export function cellTextAtBoundaryPoint(layout, x, y, frame = null) {
  if (layout.spatialRows !== true || !Array.isArray(layout.rows)) return false;
  const index = rowAtPoint(layout, x, y),
    row = layout.rows[index];
  if (
    row?.kind !== 'text' ||
    !(row.editable || row.selectable) ||
    !Number.isSafeInteger(row.tableNode) ||
    !Number.isSafeInteger(row.listNode) ||
    typeof row.text !== 'string' ||
    !Number.isSafeInteger(row.startUnit) ||
    !Array.isArray(row.boundaries)
  )
    return false;
  if (
    frame &&
    row.section === frame.section &&
    row.tableNode === frame.tableNode &&
    row.listNode >= 0 &&
    (row.pageOrdinal === undefined || row.pageOrdinal === frame.pageOrdinal) &&
    x > frame.rectangle.x &&
    x < frame.rectangle.x + frame.rectangle.width &&
    y > frame.rectangle.y &&
    y < frame.rectangle.y + frame.rectangle.height &&
    layout.boxes?.some((box) => {
      if (
        box.section !== row.section ||
        box.tableNode !== row.tableNode ||
        box.listNode !== row.listNode ||
        box.pageOrdinal !== frame.pageOrdinal ||
        !rowPageClipContains(box, x, y)
      )
        return false;
      const local = rowLocalPoint(box, x, y);
      return (
        local &&
        local[0] > box.x &&
        local[0] < box.x + box.width &&
        local[1] > box.y &&
        local[1] < box.y + box.height
      );
    })
  )
    return true;
  const point = rowLocalPoint(row, x, y),
    top = rowTop(row, index) + rowTextTop(row);
  if (!point || point[1] < top || point[1] >= top + rowTextHeight(row)) return false;
  const localX = point[0] - rowLeft(row);
  return row.boundaries.slice(1).some((end, index) => {
    const start = row.boundaries[index],
      width = boundaryGlyphWidth(start, end);
    const text = row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit);
    return (
      width !== null &&
      width > 0 &&
      text.length > 0 &&
      !text.includes('\ufffc') &&
      localX >= start.x &&
      localX < start.x + width
    );
  });
}
