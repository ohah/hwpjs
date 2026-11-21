import { inlineTableHostPoint } from './inline-table-host-run.mjs';
/** Shared CSS-pixel row geometry, with compatibility for numeric-only layouts. */
import { affinePoint, inverseAffine } from './affine-point-geometry.mjs';
import { rowPageClipContains } from './row-page-clip.mjs';
import { sameCreatedCell } from './created-cell-address.mjs';
import { topTablePaintRowIndex } from './table-text-paint-order.mjs';

export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_TEXT_HEIGHT = 20;
export const TEXT_TOP = 8;
export const TEXT_LEFT = 20;
export const rowTop = (row, index) => row.y ?? index * DEFAULT_ROW_HEIGHT;
export const rowHeight = (row) => row.height ?? DEFAULT_ROW_HEIGHT;
export const rowTextHeight = (row) => row.textHeight ?? DEFAULT_TEXT_HEIGHT;
export const rowTextTop = (row) => row.textTop ?? TEXT_TOP;
// Ink/input extent is independent of the distance to the following line.
export const rowVisualHeight = (row) =>
  row.kind === 'text'
    ? Math.max(rowHeight(row), rowTextTop(row) + rowTextHeight(row))
    : rowHeight(row);
export const rowLeft = (row) => (row.x ?? TEXT_LEFT) + (row.paragraphX ?? 0);

export function isZeroAdvanceTextAnchor(row) {
  return (
    row?.kind === 'text' &&
    row.text === '' &&
    !row.numberPrefix &&
    row.height === 0 &&
    Number.isSafeInteger(row.startUnit) &&
    row.startUnit >= 0 &&
    row.endUnit === row.startUnit &&
    (row.textHeight === undefined || (Number.isFinite(row.textHeight) && row.textHeight >= 0)) &&
    (row.textTop === undefined || (Number.isFinite(row.textTop) && row.textTop >= 0))
  );
}

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
  let tableHostPoints;
  const hostPoint = (row, localX) => {
    tableHostPoints ??= new Map();
    if (!tableHostPoints.has(row)) tableHostPoints.set(row, inlineTableHostPoint(row, localX));
    return tableHostPoints.get(row);
  };
  const contains = (row, index) => {
    if (row.sourceObjectAnchor === true) return false;
    if (!rowPageClipContains(row, x, y)) return false;
    const point = rowLocalPoint(row, x, y);
    return (
      point &&
      row.kind === 'text' &&
      point[0] >= rowLeft(row) &&
      point[0] < rowLeft(row) + row.width &&
      point[1] >= rowTop(row, index) &&
      point[1] < rowTop(row, index) + rowVisualHeight(row)
    );
  };
  // 글자가 있는 영역을 먼저 찾고 빈 줄 끝 영역은 마지막에 선택합니다.
  const ink = topTablePaintRowIndex(layout.rows, (row, index) => {
    if (!contains(row, index)) return false;
    const point = rowLocalPoint(row, x, y),
      boundaries = row.boundaries;
    if (!Array.isArray(boundaries) || !boundaries.length) return false;
    const start = boundaries[0]?.x,
      end = boundaries.at(-1)?.x;
    const localX = point[0] - rowLeft(row);
    const textY = rowTop(row, index) + rowTextTop(row);
    if (
      !(
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        localX >= start &&
        localX < end &&
        point[1] >= textY &&
        point[1] < textY + rowTextHeight(row)
      )
    )
      return false;
    if (!row.inlineTables?.length) return true;
    return hostPoint(row, localX).hasHostInk;
  });
  if (ink >= 0) return ink;
  // Equal layers retain array order; floating layers match the paint order.
  const direct = topTablePaintRowIndex(layout.rows, contains);
  if (direct >= 0) {
    const host = layout.rows[direct];
    if (host.inlineTables?.length) {
      const point = rowLocalPoint(host, x, y);
      const tables = hostPoint(host, point[0] - rowLeft(host)).tableNodes;
      const boxIndex = topTablePaintRowIndex(layout.boxes ?? [], (box) => {
        if (
          box.section !== host.section ||
          (host.pageOrdinal !== undefined && box.pageOrdinal !== host.pageOrdinal) ||
          !rowPageClipContains(box, x, y)
        )
          return false;
        const local = rowLocalPoint(box, x, y);
        return (
          local &&
          local[0] >= box.x &&
          local[0] < box.x + box.width &&
          local[1] >= box.y &&
          local[1] < box.y + box.height &&
          tables.has(box.tableNode) &&
          topTablePaintRowIndex([host, box], () => true) === 1
        );
      });
      if (boxIndex >= 0) {
        const selected = cellTextRowAtPoint(layout, layout.boxes[boxIndex], x, y);
        if (selected >= 0 && topTablePaintRowIndex([host, layout.rows[selected]], () => true) === 1)
          return selected;
      }
    }
    return direct;
  }
  const cell = layout.boxes
    ?.filter(
      (box) =>
        rowPageClipContains(box, x, y) &&
        x >= box.x &&
        x < box.x + box.width &&
        y >= box.y &&
        y < box.y + box.height,
    )
    .reduce((best, box) => (!best || (box.depth ?? 0) > (best.depth ?? 0) ? box : best), null);
  if (!cell) return -1;
  return cellTextRowAtPoint(layout, cell, x, y);
}

function cellTextRowAtPoint(layout, cell, x, y) {
  let closest = -1,
    distance = Infinity;
  for (const [index, row] of layout.rows.entries()) {
    if (!rowPageClipContains(row, x, y)) continue;
    if ((cell.createdCell || row.createdCell) && !sameCreatedCell(row, cell)) continue;
    if (
      row.kind !== 'text' ||
      !(row.editable || row.selectable) ||
      row.section !== cell.section ||
      row.tableNode !== cell.tableNode ||
      row.listNode !== cell.listNode
    )
      continue;
    if (
      row.pageOrdinal !== undefined &&
      cell.pageOrdinal !== undefined &&
      row.pageOrdinal !== cell.pageOrdinal
    )
      continue;
    const local = rowLocalPoint(row, x, y);
    if (!local) continue;
    const delta = Math.max(
      rowTop(row, index) - local[1],
      local[1] - (rowTop(row, index) + rowHeight(row)),
      0,
    );
    if (delta < distance) {
      distance = delta;
      closest = index;
    }
  }
  return closest;
}

export function rowAtY(layout, y) {
  if (!Number.isFinite(y)) return -1;
  let low = 0,
    high = layout.rows.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (rowTop(layout.rows[middle], middle) <= y) low = middle + 1;
    else high = middle;
  }
  const index = low - 1;
  return index >= 0 && y < rowTop(layout.rows[index], index) + rowVisualHeight(layout.rows[index])
    ? index
    : -1;
}
