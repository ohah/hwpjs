import { placeFloatingTable } from "./table-placement.mjs";
import { tableInsets } from "./table-insets.mjs";
import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// Horizontal source anchors over already paginated, single-column fragments.
export function placeTablePagesHorizontally(table, layout, outerInsets, paragraph) {
  const unavailable = error => ({ state: "unavailable", error });
  const margins = tableInsets(outerInsets), relative = table?.sourceGeometry?.horizontal_relative;
  if (!margins || ![0, 1, 2, 3].includes(relative) || layout?.state !== "placed" || (relative === 3 && !paragraph)) return unavailable("UnsupportedTablePageAnchor");
  const shifts = new Map(), boundaries = new Map();
  for (const box of layout.boxes) {
    if (box.tableNode !== table.tableNode) continue;
    const reference = box.referenceBoxes, key = box.pageOrdinal;
    if (shifts.has(key)) continue;
    const name = ["paper", "page", "column", "paragraph"][relative];
    let horizontal = reference?.[name];
    if (relative === 3 && reference?.column) {
      const line = paragraphLineGeometry({ ...paragraph.paragraphShape, alignment: 0 }, reference.column.width, 0, true);
      horizontal = { ...reference.column, x: reference.column.x + line.x, width: line.width };
    }
    if (!horizontal || horizontal.width <= margins.left + margins.right) return unavailable("TablePageWidthOverflow");
    const boxes = { ...reference, paragraph: reference.column,
      [name]: relative === 3 ? horizontal : { ...horizontal, x: horizontal.x + margins.left, width: horizontal.width - margins.left - margins.right } };
    const placement = placeFloatingTable(table, boxes);
    if (placement.state !== "placed") return unavailable("UnsupportedTablePageAnchor");
    const shift = placement.rectangle.x - (reference.column.x + margins.left);
    if (!Number.isFinite(shift)) return unavailable("UnsupportedTablePageAnchor");
    shifts.set(key, shift);
    const geometry = table.sourceGeometry.geometry;
    const own = layout.boxes.filter(item => item.tableNode === table.tableNode && item.pageOrdinal === key);
    const measuredWidth = own.reduce((end, item) => Math.max(end, item.x + item.width), -Infinity) - own.reduce((start, item) => Math.min(start, item.x), Infinity);
    const outerOnlyOverflow = relative === 2 && table.sourceGeometry.horizontal_alignment === 0 && geometry.horizontal_offset === 0
      && hwpUnitPixels(geometry.width) <= reference.column.width + 1e-8 && measuredWidth <= reference.column.width + 1e-8
      && measuredWidth + margins.left + margins.right > reference.column.width;
    boundaries.set(key, table.sourceGeometry.vertical_relative === 1 || outerOnlyOverflow ? reference.paper ?? reference.column : reference.column);
  }
  const boxes = layout.boxes.map(box => box.tableNode === table.tableNode ? { ...box, x: box.x + shifts.get(box.pageOrdinal), ...(boundaries.get(box.pageOrdinal) !== box.referenceBoxes.column ? { horizontalOverflowBoundary: "paper" } : {}) } : box);
  if (boxes.filter(box => box.tableNode === table.tableNode).some(box => {
    const boundary = boundaries.get(box.pageOrdinal);
    if (relative === 3) {
      const paper = box.referenceBoxes.paper ?? boundary;
      return ![box.x, box.x + box.width, paper?.x, paper?.width, paper?.x + paper?.width].every(Number.isFinite)
        || paper.width <= 0 || box.x < boundary.x || box.x + box.width > boundary.x + boundary.width + 1e-8
        || box.x - margins.left < paper.x || box.x + box.width + margins.right > paper.x + paper.width + 1e-8;
    }
    const leftBoundary = table.sourceGeometry.vertical_relative === 1 ? boundary : box.referenceBoxes.column;
    return !Number.isFinite(box.x) || !Number.isFinite(box.x + box.width + margins.right) || box.x - margins.left < leftBoundary.x || box.x + box.width + margins.right > boundary.x + boundary.width;
  })) return unavailable("TablePageWidthOverflow");
  const rows = layout.rows.map(row => row.tableNode === table.tableNode ? { ...row, x: row.x + shifts.get(row.pageOrdinal) } : row);
  const flowPictures = layout.flowPictures?.map(picture => picture.cell?.tableNode === table.tableNode && picture.section === table.section
    ? { ...picture, rectangle: { ...picture.rectangle, x: picture.rectangle.x + shifts.get(picture.pageOrdinal) } } : picture);
  if (flowPictures?.some(picture => !picture.rectangle || !Number.isFinite(picture.rectangle.x) || !Number.isFinite(picture.rectangle.x + picture.rectangle.width))) return unavailable("UnsupportedTablePageAnchor");
  if (rows.some(row => !Number.isFinite(row.x) || (row.width !== undefined && !Number.isFinite(row.x + row.width)))) return unavailable("UnsupportedTablePageAnchor");
  return { ...layout, boxes, rows, ...(flowPictures ? { flowPictures } : {}) };
}
