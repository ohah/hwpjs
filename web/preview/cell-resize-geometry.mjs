import { hwpUnitsToPixels } from "./table-grid.mjs";

// 선택한 셀의 오른쪽/아래 경계만 사용해 공유 경계의 소유권을 고정합니다.
export function cellResizeHandle(layout, selected, x, y, tolerance = 5) {
  if (!selected || ![x, y, tolerance].every(Number.isFinite) || tolerance < 0 || layout.limited)
    return null;
  const box = layout.boxes?.find(
    (box) => box.section === selected.section && box.listNode === selected.listNode,
  );
  if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) return null;
  const right = box.x + box.width,
    bottom = box.y + box.height;
  const horizontal =
    Math.abs(x - right) <= tolerance && y >= box.y - tolerance && y <= bottom + tolerance;
  const vertical =
    Math.abs(y - bottom) <= tolerance && x >= box.x - tolerance && x <= right + tolerance;
  if (!horizontal && !vertical) return null;
  return { ...selected, box: { ...box }, x, y, horizontal, vertical };
}

export function resizedCell(handle, x, y) {
  if (!handle || ![x, y].every(Number.isFinite)) throw new RangeError("InvalidCellResize");
  const scale = hwpUnitsToPixels(1);
  const size = (value, delta) =>
    Math.min(0xffffffff, Math.max(0, Math.round(value + delta / scale)));
  return {
    width: handle.horizontal ? size(handle.width, x - handle.x) : handle.width,
    height: handle.vertical ? size(handle.height, y - handle.y) : handle.height,
  };
}
