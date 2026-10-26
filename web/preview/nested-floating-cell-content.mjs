import { nestedParagraphReference } from "./nested-paragraph-reference.mjs";
import { positionNestedFloatingTable } from "./nested-floating-table-position.mjs";
import { projectNestedFloatingTable } from "./nested-floating-table-projection.mjs";
import { validateNestedFloatingCellOwners } from "./nested-floating-cell-owners.mjs";

// Compose owned current cell rows and measured children at a real page origin.
export function projectNestedFloatingCellContent(
  parent,
  flow,
  entries,
  page,
  { insets, maxRows = 20000 } = {},
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (
    !Array.isArray(entries) ||
    entries.length > 10000 ||
    !Array.isArray(flow?.rows) ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    !insets ||
    ![insets.left, insets.right, insets.top, insets.bottom].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    return unavailable("InvalidNestedFloatingCellContent");
  const ownership = validateNestedFloatingCellOwners(parent, entries);
  if (ownership.state !== "verified") return ownership;
  const rows = [],
    boxes = [],
    flowPictures = [],
    placements = [];
  const origin = { x: parent?.x + insets.left, y: parent?.y + insets.top };
  for (const entry of entries) {
    const table = entry?.table,
      paragraph = entry?.paragraph;
    const reference = nestedParagraphReference(paragraph, flow, origin);
    if (reference.state !== "referenced") return reference;
    const column = {
      x: origin.x,
      y: origin.y,
      width: parent.width - insets.left - insets.right,
      height: parent.height - insets.top - insets.bottom,
    };
    const position = positionNestedFloatingTable(
      table,
      parent,
      reference.rectangle,
      { ...page?.referenceBoxes, column },
      { measured: entry.measured },
    );
    if (position.state !== "positioned") return position;
    if (rows.length >= maxRows) return unavailable("TablePageProjectionLimit");
    const projected = projectNestedFloatingTable(table, entry.measured, position, page, {
      maxRows: maxRows - rows.length,
    });
    if (projected.state !== "placed") return projected;
    rows.push(
      ...projected.rows.map((row) => ({
        ...row,
        tablePaintLayer: position.paintLayer,
        positionOwnerTableNode: parent.tableNode,
      })),
    );
    boxes.push(
      ...projected.boxes.map((box) => ({
        ...box,
        tablePaintLayer: position.paintLayer,
        positionOwnerTableNode: parent.tableNode,
      })),
    );
    flowPictures.push(
      ...(projected.flowPictures ?? []).map((picture) => ({
        ...picture,
        positionOwnerTableNode: parent.tableNode,
      })),
    );
    placements.push({ ...position, paragraph: paragraph.paragraph });
  }
  return {
    state: "placed",
    rows,
    boxes,
    placements,
    ...(flowPictures.length ? { flowPictures } : {}),
  };
}
