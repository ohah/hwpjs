import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import { tableInsets } from "./table-insets.mjs";

// A table-only inline paragraph is one indivisible measured line.
export function placeInlineTablePages(table, paragraph, layout, outerInsets) {
  const unavailable = error => ({ state: "unavailable", error });
  const margins = tableInsets(outerInsets);
  if (!margins || paragraph?.text !== "\ufffc" || layout?.state !== "placed") return unavailable("UnsupportedInlineTableHost");
  const boxes = layout.boxes.filter(box => box.tableNode === table.tableNode && box.section === table.section);
  if (!boxes.length || new Set(boxes.map(box => box.pageOrdinal)).size !== 1) return unavailable("UnsupportedSplitInlineTable");
  let left = Infinity, right = -Infinity;
  for (const box of boxes) { left = Math.min(left, box.x); right = Math.max(right, box.x + box.width); }
  const column = boxes[0].referenceBoxes?.column;
  if (!column) return unavailable("UnsupportedInlineTableHost");
  const width = right - left;
  const line = paragraphLineGeometry(paragraph.paragraphShape, column.width, width + margins.left + margins.right, true);
  if (![width, line.x, line.width].every(Number.isFinite)) return unavailable("InlineTablePageWidthOverflow");
  if (width + margins.left + margins.right > line.width + 1e-8) {
    const paper = boxes[0].referenceBoxes?.paper;
    const start = column.x + line.x;
    const end = start + width + margins.left + margins.right;
    if (!paper || ![paper.x, paper.width, paper.x + paper.width, start, end].every(Number.isFinite) || paper.width <= 0 || start < paper.x || end > paper.x + paper.width + 1e-8) return unavailable("InlineTablePageWidthOverflow");
  }
  const shift = column.x + line.x + margins.left - left;
  const projected = layout.boxes.map(box => box.tableNode === table.tableNode && box.section === table.section ? { ...box, x: box.x + shift } : box);
  const rows = layout.rows.map(row => row.tableNode === table.tableNode && row.section === table.section ? { ...row, x: row.x + shift } : row);
  const flowPictures = layout.flowPictures?.map(picture => picture.cell?.tableNode === table.tableNode && picture.section === table.section
    ? { ...picture, rectangle: { ...picture.rectangle, x: picture.rectangle.x + shift } } : picture);
  if (flowPictures?.some(picture => !picture.rectangle || !Number.isFinite(picture.rectangle.x) || !Number.isFinite(picture.rectangle.x + picture.rectangle.width))) return unavailable("InlineTablePageWidthOverflow");
  if (projected.some(box => !Number.isFinite(box.x) || !Number.isFinite(box.x + box.width)) || rows.some(row => !Number.isFinite(row.x))) return unavailable("InlineTablePageWidthOverflow");
  return { ...layout, boxes: projected, rows, ...(flowPictures ? { flowPictures } : {}) };
}
