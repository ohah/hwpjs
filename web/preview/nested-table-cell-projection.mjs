import { pageVisibleRectangle } from "./page-visible-rectangle.mjs";
import { projectNestedInlineCaption } from "./nested-inline-caption-projection.mjs";
import { tableCellRowExtent, isZeroAdvanceCellAnchor } from "./table-cell-band.mjs";
import { projectNestedCellPictures } from "./nested-cell-picture-projection.mjs";

// 이미 측정한 중첩 셀의 좌표와 소유권을 같은 물리 페이지로 투영합니다.
export function projectNestedTableCellContent(flow, parent, insets, fragment, maxRows) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (
    !Array.isArray(flow?.rows) ||
    !Array.isArray(flow.boxes) ||
    !flow.boxes.length ||
    !parent ||
    !insets ||
    !fragment ||
    !Number.isSafeInteger(fragment.pageOrdinal) ||
    fragment.pageOrdinal < 0 ||
    ![parent.x, parent.y, parent.width, parent.height].every(Number.isFinite) ||
    ![insets.left, insets.right, insets.top, insets.bottom].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 0
  )
    return unavailable("InvalidNestedCellProjection");
  if (flow.rows.length > maxRows) return unavailable("TablePageProjectionLimit");
  const width = parent.width - insets.left - insets.right;
  const height = parent.height - insets.top - insets.bottom;
  if (flow.clipOverflow !== undefined && typeof flow.clipOverflow !== "boolean")
    return unavailable("InvalidNestedCellProjection");
  if (
    (flow.visibleHorizontalOverflow !== undefined &&
      typeof flow.visibleHorizontalOverflow !== "boolean") ||
    (flow.visibleHorizontalOverflow && flow.clipOverflow)
  )
    return unavailable("InvalidNestedCellProjection");
  if (!Number.isSafeInteger(parent.depth ?? 0) || (parent.depth ?? 0) < 0)
    return unavailable("InvalidNestedCellProjection");
  if (![width, height].every((value) => Number.isFinite(value) && value > 0))
    return unavailable("InvalidNestedCellProjection");
  const owners = new Map(),
    boxes = [];
  for (const box of flow.boxes) {
    const key = `${box?.tableNode}:${box?.listNode}`;
    if (
      !box ||
      box.section !== parent.section ||
      !Number.isSafeInteger(box.tableNode) ||
      !Number.isSafeInteger(box.listNode) ||
      box.tableNode === parent.tableNode ||
      owners.has(key) ||
      !Number.isSafeInteger(box.depth ?? 0) ||
      (box.depth ?? 0) < 0 ||
      !Number.isSafeInteger((parent.depth ?? 0) + (box.depth ?? 0) + 1) ||
      ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
        Number.isFinite,
      ) ||
      box.x < 0 ||
      box.y < 0 ||
      box.width <= 0 ||
      box.height <= 0 ||
      (!flow.clipOverflow && !flow.visibleHorizontalOverflow && box.x + box.width > width + 1e-8) ||
      box.y + box.height > height + 1e-8
    )
      return unavailable("InvalidNestedCellProjection");
    owners.set(key, box);
    boxes.push({
      ...box,
      positionOwnerTableNode: parent.tableNode,
      depth: (parent.depth ?? 0) + (box.depth ?? 0) + 1,
      x: parent.x + insets.left + box.x,
      y: parent.y + insets.top + box.y,
      pageOrdinal: fragment.pageOrdinal,
      referenceBoxes: fragment.referenceBoxes,
    });
  }
  const clip = { x: parent.x + insets.left, y: parent.y + insets.top, width, height };
  const projectClip = (source) => {
    if (source === undefined) return clip;
    const result = pageVisibleRectangle(
      { ...source, x: parent.x + insets.left + source.x, y: parent.y + insets.top + source.y },
      clip,
    );
    if (result.state === "invalid_page_clip") return null;
    return result.rectangle ?? { ...clip, width: 0, height: 0 };
  };
  for (const box of boxes)
    if (flow.clipOverflow === true || box.pageClip !== undefined) {
      box.pageClip = projectClip(box.pageClip);
      if (!box.pageClip) return unavailable("InvalidNestedCellProjection");
    }
  const rows = [],
    tableCaptionBounds = [],
    captionOwners = new Set();
  if (flow.inlineCaptions !== undefined && !Array.isArray(flow.inlineCaptions))
    return unavailable("InvalidNestedCaptionOwner");
  for (const descriptor of flow.inlineCaptions ?? []) {
    const caption = projectNestedInlineCaption(
      descriptor?.table,
      descriptor?.projection,
      parent,
      insets,
      fragment,
      maxRows - rows.length,
    );
    if (caption.state !== "placed") return caption;
    const identity = `${descriptor.table.tableNode}:${descriptor.table.sourceCaption.caption_node}:${descriptor.table.sourceCaption.list_node}`;
    if (captionOwners.has(identity)) return unavailable("InvalidNestedCaptionOwner");
    captionOwners.add(identity);
    rows.push(...caption.rows);
    tableCaptionBounds.push(...caption.tableCaptionBounds);
  }
  for (const row of flow.rows) {
    const extent = tableCellRowExtent(row);
    if (row?.captionNode !== undefined) {
      if (!captionOwners.has(`${row.tableNode}:${row.captionNode}:${row.listNode}`))
        return unavailable("MissingNestedCaptionPlacement");
      continue;
    }
    if (
      !row ||
      row.section !== parent.section ||
      ![row.x ?? 0, row.y, row.height, extent, row.y + extent].every(Number.isFinite) ||
      row.y < 0 ||
      row.height < 0 ||
      (extent === 0 && !isZeroAdvanceCellAnchor(row)) ||
      row.y + extent > height + 1e-8
    )
      return unavailable("InvalidNestedCellProjection");
    const tableNode = row.tableNode ?? parent.tableNode,
      listNode = row.listNode ?? parent.listNode;
    if (
      tableNode === parent.tableNode
        ? listNode !== parent.listNode
        : !owners.has(`${tableNode}:${listNode}`)
    )
      return unavailable("InvalidNestedCellOwner");
    const owner =
      tableNode === parent.tableNode
        ? { x: 0, y: 0, width, height }
        : owners.get(`${tableNode}:${listNode}`);
    const rowWidth = row.width ?? 0,
      x = row.x ?? 0;
    if (
      !Number.isFinite(rowWidth) ||
      rowWidth < 0 ||
      !Number.isFinite(x + rowWidth) ||
      x < owner.x ||
      row.y < owner.y ||
      x + rowWidth > owner.x + owner.width + 1e-8 ||
      row.y + extent > owner.y + owner.height + 1e-8
    )
      return unavailable("NestedCellRowOverflow");
    const projected = {
      ...row,
      tableNode,
      listNode,
      positionOwnerTableNode: parent.tableNode,
      x: parent.x + insets.left + (row.x ?? 0),
      y: parent.y + insets.top + row.y,
      pageOrdinal: fragment.pageOrdinal,
      columnOrdinal: fragment.columnOrdinal,
      referenceBoxes: fragment.referenceBoxes,
    };
    if (flow.clipOverflow === true || row.pageClip !== undefined) {
      projected.pageClip = projectClip(row.pageClip);
      if (!projected.pageClip) return unavailable("InvalidNestedCellProjection");
    }
    if (![projected.x, projected.y, projected.y + projected.height].every(Number.isFinite))
      return unavailable("InvalidNestedCellProjection");
    rows.push(projected);
  }
  if (
    boxes.some(
      (box) => ![box.x, box.y, box.x + box.width, box.y + box.height].every(Number.isFinite),
    )
  )
    return unavailable("InvalidNestedCellProjection");
  const pictures = projectNestedCellPictures(
    flow,
    parent,
    insets,
    fragment,
    owners,
    rows,
    projectClip,
  );
  if (pictures.state !== "placed") return pictures;
  return {
    state: "placed",
    rows,
    boxes,
    ...(pictures.pictures.length ? { flowPictures: pictures.pictures } : {}),
    ...(tableCaptionBounds.length ? { tableCaptionBounds } : {}),
  };
}
