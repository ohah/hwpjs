import { prepareTablePageBands } from "./table-page-bands.mjs";
import { projectTablePageFragments } from "./table-page-fragments.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";

// Project measured cells at an explicit current position without scaling them.
export function projectNestedFloatingTable(table, measured, position, page, { maxRows = 20000 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  const owner = position?.owner;
  if (position?.state !== "positioned" || owner?.section !== table?.section || owner?.tableNode !== table?.tableNode || owner?.parentTableNode !== table?.parentTableNode || owner?.parentListNode !== table?.parentListNode || owner?.paragraph !== table?.hostParagraph) return unavailable("InvalidNestedFloatingTableOwner");
  if (measured?.state !== "measured" || !Number.isSafeInteger(page?.pageOrdinal) || page.pageOrdinal < 0 || page.columnOrdinal !== undefined && (!Number.isSafeInteger(page.columnOrdinal) || page.columnOrdinal < 0) || !Number.isSafeInteger(maxRows) || maxRows < 1 || !["behind", "front"].includes(position.paintLayer)) return unavailable("InvalidNestedFloatingTableProjection");
  const rectangle = position.rectangle, paper = page.referenceBoxes?.paper;
  if (!rectangle || !paper || ![rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.x + rectangle.width, rectangle.y + rectangle.height, paper.x, paper.y, paper.width, paper.height, paper.x + paper.width, paper.y + paper.height].every(Number.isFinite) || rectangle.width <= 0 || rectangle.height <= 0 || paper.width <= 0 || paper.height <= 0 || rectangle.x < paper.x || rectangle.y < paper.y || rectangle.x + rectangle.width > paper.x + paper.width || rectangle.y + rectangle.height > paper.y + paper.height) return unavailable("NestedFloatingTablePaperOverflow");
  if (!Number.isFinite(measured.grid?.width) || !Number.isFinite(measured.grid?.height) || measured.grid.width <= 0 || measured.grid.height <= 0 || measured.grid.width > rectangle.width + 1e-8 || measured.grid.height > rectangle.height + 1e-8) return unavailable("NestedFloatingTableMeasuredOverflow");
  const bands = prepareTablePageBands(table, measured.grid.rows, "whole", 0);
  if (bands.state !== "prepared") return bands;
  const padding = resolveTablePadding(table, "source");
  if (!padding) return unavailable("MissingTableSourceInsets");
  const fragment = { ...bands.selected[0], x: rectangle.x, y: rectangle.y, pageOrdinal: page.pageOrdinal, columnOrdinal: page.columnOrdinal ?? 0, referenceBoxes: page.referenceBoxes };
  const projected = projectTablePageFragments(table, measured.grid, measured.flows, { state: "planned", fragments: [fragment] }, { origin: { x: 0, y: 0 }, padding, maxRows });
  if (projected.state !== "placed") return projected;
  return { ...projected, paintLayer: position.paintLayer, rectangle: { ...rectangle }, owner: { ...owner } };
}
