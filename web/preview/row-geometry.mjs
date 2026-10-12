/** Shared CSS-pixel row geometry, with compatibility for numeric-only layouts. */
import { affinePoint, inverseAffine } from "./affine-point-geometry.mjs";
import { rowPageClipContains } from "./row-page-clip.mjs";
import { sameCreatedCell } from "./created-cell-address.mjs";
import { topTablePaintRowIndex } from "./table-text-paint-order.mjs";

export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_TEXT_HEIGHT = 20;
export const TEXT_TOP = 8;
export const TEXT_LEFT = 20;
export const rowTop = (row, index) => row.y ?? index * DEFAULT_ROW_HEIGHT;
export const rowHeight = row => row.height ?? DEFAULT_ROW_HEIGHT;
export const rowTextHeight = row => row.textHeight ?? DEFAULT_TEXT_HEIGHT;
export const rowTextTop = row => row.textTop ?? TEXT_TOP;
export const rowLeft = row => (row.x ?? TEXT_LEFT) + (row.paragraphX ?? 0);

// 변환 행은 조판 좌표를 유지하고 화면 입력만 같은 행렬의 역으로 돌립니다.
export function rowLocalPoint(row, x, y) {
  if (![x, y].every(Number.isFinite)) return null;
  if (row.transform === undefined) return [x, y];
  const inverse = inverseAffine(row.transform);
  return inverse ? affinePoint(inverse, [x, y]) : null;
}

// Table cells can share a vertical interval; their horizontal bounds decide
// ownership. Flat layouts retain the existing logarithmic vertical lookup.
export function rowAtPoint(layout, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
  if (!layout.spatialRows) {
    const index = rowAtY(layout, y);
    return index >= 0 && rowPageClipContains(layout.rows[index], x, y) ? index : -1;
  }
  const contains = (row, index) => {
    if (!rowPageClipContains(row, x, y)) return false;
    const point = rowLocalPoint(row, x, y);
    return point && row.kind === "text" && point[0] >= rowLeft(row) && point[0] < rowLeft(row) + row.width &&
      point[1] >= rowTop(row, index) && point[1] < rowTop(row, index) + rowHeight(row);
  };
  // 글자가 있는 영역을 먼저 찾고 빈 줄 끝 영역은 마지막에 선택합니다.
  const ink = topTablePaintRowIndex(layout.rows, (row, index) => {
    if (!contains(row, index)) return false;
    const point = rowLocalPoint(row, x, y), boundaries = row.boundaries;
    if (!Array.isArray(boundaries) || !boundaries.length) return false;
    const start = boundaries[0]?.x, end = boundaries.at(-1)?.x;
    return Number.isFinite(start) && Number.isFinite(end) && end > start
      && point[0] >= rowLeft(row) + start && point[0] < rowLeft(row) + end
      && point[1] >= rowTop(row, index) + rowTextTop(row)
      && point[1] < rowTop(row, index) + rowTextTop(row) + rowTextHeight(row);
  });
  if (ink >= 0) return ink;
  // Equal layers retain array order; floating layers match the paint order.
  const direct = topTablePaintRowIndex(layout.rows, contains);
  if (direct >= 0) return direct;
  const cell = layout.boxes?.filter(box => rowPageClipContains(box, x, y) && x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height)
    .reduce((best, box) => !best || (box.depth ?? 0) > (best.depth ?? 0) ? box : best, null);
  if (!cell) return -1;
  let closest = -1, distance = Infinity;
  for (const [index, row] of layout.rows.entries()) {
    if (!rowPageClipContains(row, x, y)) continue;
    if ((cell.createdCell || row.createdCell) && !sameCreatedCell(row, cell)) continue;
    if (row.kind !== "text" || !(row.editable || row.selectable) || row.section !== cell.section || row.tableNode !== cell.tableNode || row.listNode !== cell.listNode) continue;
    const delta = Math.max(rowTop(row, index) - y, y - (rowTop(row, index) + rowHeight(row)), 0);
    if (delta < distance) { distance = delta; closest = index; }
  }
  return closest;
}

export function rowAtY(layout, y) {
  if (!Number.isFinite(y)) return -1;
  let low = 0, high = layout.rows.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (rowTop(layout.rows[middle], middle) <= y) low = middle + 1;
    else high = middle;
  }
  const index = low - 1;
  return index >= 0 && y < rowTop(layout.rows[index], index) + rowHeight(layout.rows[index]) ? index : -1;
}
