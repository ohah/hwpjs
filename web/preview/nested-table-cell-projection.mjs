import { pageVisibleRectangle } from "./page-visible-rectangle.mjs";

// 이미 측정한 중첩 셀의 좌표와 소유권을 같은 물리 페이지로 투영합니다.
export function projectNestedTableCellContent(flow, parent, insets, fragment, maxRows) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(flow?.rows) || !Array.isArray(flow.boxes) || !flow.boxes.length
    || !parent || !insets || !fragment || !Number.isSafeInteger(fragment.pageOrdinal) || fragment.pageOrdinal < 0
    || ![parent.x, parent.y, parent.width, parent.height].every(Number.isFinite)
    || ![insets.left, insets.right, insets.top, insets.bottom].every(value => Number.isFinite(value) && value >= 0)
    || !Number.isSafeInteger(maxRows) || maxRows < 0) return unavailable("InvalidNestedCellProjection");
  if (flow.rows.length > maxRows) return unavailable("TablePageProjectionLimit");
  const width = parent.width - insets.left - insets.right;
  const height = parent.height - insets.top - insets.bottom;
  if (flow.clipOverflow !== undefined && typeof flow.clipOverflow !== "boolean") return unavailable("InvalidNestedCellProjection");
  if (!Number.isSafeInteger(parent.depth ?? 0) || (parent.depth ?? 0) < 0) return unavailable("InvalidNestedCellProjection");
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) return unavailable("InvalidNestedCellProjection");
  const owners = new Map(), boxes = [];
  for (const box of flow.boxes) {
    const key = `${box?.tableNode}:${box?.listNode}`;
    if (!box || box.section !== parent.section || !Number.isSafeInteger(box.tableNode) || !Number.isSafeInteger(box.listNode)
      || box.tableNode === parent.tableNode || owners.has(key) || !Number.isSafeInteger(box.depth ?? 0) || (box.depth ?? 0) < 0
      || !Number.isSafeInteger((parent.depth ?? 0) + (box.depth ?? 0) + 1)
      || ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
      || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0
      || !flow.clipOverflow && box.x + box.width > width + 1e-8 || box.y + box.height > height + 1e-8) return unavailable("InvalidNestedCellProjection");
    owners.set(key, box);
    boxes.push({ ...box, depth: (parent.depth ?? 0) + (box.depth ?? 0) + 1, x: parent.x + insets.left + box.x, y: parent.y + insets.top + box.y,
      pageOrdinal: fragment.pageOrdinal, referenceBoxes: fragment.referenceBoxes });
  }
  const clip = { x: parent.x + insets.left, y: parent.y + insets.top, width, height };
  const projectClip = source => {
    if (source === undefined) return clip;
    const result = pageVisibleRectangle({ ...source, x: parent.x + insets.left + source.x, y: parent.y + insets.top + source.y }, clip);
    if (result.state === "invalid_page_clip") return null;
    return result.rectangle ?? { ...clip, width: 0, height: 0 };
  };
  for (const box of boxes) if (flow.clipOverflow === true || box.pageClip !== undefined) {
    box.pageClip = projectClip(box.pageClip);
    if (!box.pageClip) return unavailable("InvalidNestedCellProjection");
  }
  const rows = [];
  for (const row of flow.rows) {
    if (!row || row.section !== parent.section || ![row.x ?? 0, row.y, row.height, row.y + row.height].every(Number.isFinite)
      || row.y < 0 || row.height <= 0 || row.y + row.height > height + 1e-8) return unavailable("InvalidNestedCellProjection");
    const tableNode = row.tableNode ?? parent.tableNode, listNode = row.listNode ?? parent.listNode;
    if (tableNode === parent.tableNode ? listNode !== parent.listNode : !owners.has(`${tableNode}:${listNode}`)) return unavailable("InvalidNestedCellOwner");
    const owner = tableNode === parent.tableNode ? { x: 0, y: 0, width, height } : owners.get(`${tableNode}:${listNode}`);
    const rowWidth = row.width ?? 0, x = row.x ?? 0;
    if (!Number.isFinite(rowWidth) || rowWidth < 0 || !Number.isFinite(x + rowWidth)
      || x < owner.x || row.y < owner.y || x + rowWidth > owner.x + owner.width + 1e-8
      || row.y + row.height > owner.y + owner.height + 1e-8) return unavailable("NestedCellRowOverflow");
    const projected = { ...row, tableNode, listNode, x: parent.x + insets.left + (row.x ?? 0), y: parent.y + insets.top + row.y,
      pageOrdinal: fragment.pageOrdinal, columnOrdinal: fragment.columnOrdinal, referenceBoxes: fragment.referenceBoxes };
    if (flow.clipOverflow === true || row.pageClip !== undefined) {
      projected.pageClip = projectClip(row.pageClip);
      if (!projected.pageClip) return unavailable("InvalidNestedCellProjection");
    }
    if (![projected.x, projected.y, projected.y + projected.height].every(Number.isFinite)) return unavailable("InvalidNestedCellProjection");
    rows.push(projected);
  }
  if (boxes.some(box => ![box.x, box.y, box.x + box.width, box.y + box.height].every(Number.isFinite))) return unavailable("InvalidNestedCellProjection");
  return { state: "placed", rows, boxes };
}
