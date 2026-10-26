import { tableCellReferenceBox } from "./table-cell-reference-box.mjs";
import { textBoundaryExtent } from "./text-line-width.mjs";

/** Caption identity survives parent-cell translation; it is not a child cell. */
export function projectNestedInlineCaption(
  table,
  projection,
  parent,
  insets,
  fragment,
  maxRows = 20000,
) {
  const fail = (error) => ({ state: "unavailable", error });
  const source = table?.sourceCaption;
  if (
    !source ||
    projection?.state !== "placed" ||
    !Array.isArray(projection.rows) ||
    !Array.isArray(projection.tableCaptionBounds) ||
    table.section !== parent?.section ||
    table.parentTableNode !== parent?.tableNode ||
    table.parentListNode !== parent?.listNode ||
    !Number.isSafeInteger(fragment?.pageOrdinal) ||
    fragment.pageOrdinal < 0 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return fail("InvalidNestedCaptionOwner");
  if (
    ![
      table.section,
      table.tableNode,
      parent.tableNode,
      parent.listNode,
      source.caption_node,
      source.list_node,
    ].every((v) => Number.isSafeInteger(v) && v >= 0) ||
    projection.rows.some((row) => !row) ||
    projection.tableCaptionBounds.some((bound) => !bound)
  )
    return fail("InvalidNestedCaptionOwner");
  const inner = tableCellReferenceBox(parent, insets, {}, undefined);
  if (!inner) return fail("InvalidNestedCaptionBounds");
  const matches = projection.tableCaptionBounds.filter(
    (bound) =>
      bound.section === table.section &&
      bound.tableNode === table.tableNode &&
      bound.captionNode === source.caption_node &&
      bound.listNode === source.list_node,
  );
  if (matches.length !== 1) return fail("MissingNestedCaptionPlacement");
  const shift = (box) => box && { ...box, x: inner.x + box.x, y: inner.y + box.y };
  const valid = (box) =>
    box &&
    [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
      Number.isFinite,
    ) &&
    box.width > 0 &&
    box.height > 0;
  const rectangle = shift(matches[0].rectangle),
    bounds = shift(matches[0].bounds);
  if (
    !valid(rectangle) ||
    !valid(bounds) ||
    bounds.x < inner.x - 1e-8 ||
    bounds.y < inner.y - 1e-8 ||
    bounds.x + bounds.width > inner.x + inner.width + 1e-8 ||
    bounds.y + bounds.height > inner.y + inner.height + 1e-8
  )
    return fail("NestedCaptionParentOverflow");
  const selected = projection.rows.filter(
    (row) =>
      row.section === table.section &&
      row.tableNode === table.tableNode &&
      row.captionNode === source.caption_node &&
      row.listNode === source.list_node,
  );
  if (!selected.length || selected.length > maxRows) return fail("NestedCaptionProjectionLimit");
  const rows = [];
  for (const row of selected) {
    if (
      row.transform !== undefined ||
      ![row.x, row.y, row.height, row.width ?? 0].every(Number.isFinite) ||
      row.height <= 0
    )
      return fail("InvalidNestedCaptionRow");
    const current = {
      ...row,
      x: inner.x + row.x,
      y: inner.y + row.y,
      pageOrdinal: fragment.pageOrdinal,
      columnOrdinal: fragment.columnOrdinal,
      positionOwnerTableNode: parent.tableNode,
      referenceBoxes: { ...fragment.referenceBoxes, column: rectangle },
    };
    if (
      row.kind === "text" &&
      (!Array.isArray(row.boundaries) ||
        !row.boundaries.length ||
        row.boundaries.some((boundary) => !Number.isFinite(boundary?.x)))
    )
      return fail("InvalidNestedCaptionRow");
    const extent = row.kind === "text" ? textBoundaryExtent(row.boundaries) : { left: 0, right: 0 };
    if (!extent) return fail("InvalidNestedCaptionRow");
    const left = current.x + (current.paragraphX ?? 0) + extent.left;
    const right = current.x + (current.paragraphX ?? 0) + extent.right;
    if (
      ![current.x, current.y, current.y + current.height, left, right].every(Number.isFinite) ||
      left < rectangle.x - 1e-8 ||
      right > rectangle.x + rectangle.width + 1e-8 ||
      current.y < rectangle.y - 1e-8 ||
      current.y + current.height > rectangle.y + rectangle.height + 1e-8
    )
      return fail("InvalidNestedCaptionRow");
    rows.push(current);
  }
  return {
    state: "placed",
    rows,
    tableCaptionBounds: [
      {
        ...matches[0],
        rectangle,
        bounds,
        pageOrdinal: fragment.pageOrdinal,
        columnOrdinal: fragment.columnOrdinal,
        positionOwnerTableNode: parent.tableNode,
      },
    ],
  };
}
