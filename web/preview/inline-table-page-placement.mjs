import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import { tableInsets } from "./table-insets.mjs";
import { isSingleInlineTableHost } from "./single-inline-table-host.mjs";

// Position each selected page fragment using the same original inline host.
export function placeInlineTablePages(table, paragraph, layout, outerInsets) {
  const unavailable = error => ({ state: "unavailable", error });
  const margins = tableInsets(outerInsets);
  if (!margins || (paragraph?.text !== "\ufffc" && !isSingleInlineTableHost(paragraph, table)) || layout?.state !== "placed") return unavailable("UnsupportedInlineTableHost");
  const boxes = layout.boxes.filter(box => box.tableNode === table.tableNode && box.section === table.section);
  if (!boxes.length) return unavailable("UnsupportedSplitInlineTable");
  const instance = item => `${item.pageOrdinal}:${item.columnOrdinal ?? 0}`;
  const instances = new Set(boxes.map(instance));
  if (instances.size > 1) {
    if (table.pagination?.page_break !== "cell" || boxes.some(box => !Number.isSafeInteger(box.pageOrdinal) || box.pageOrdinal < 0
      || box.columnOrdinal !== undefined && (!Number.isSafeInteger(box.columnOrdinal) || box.columnOrdinal < 0))) return unavailable("UnsupportedSplitInlineTable");
    const owns = item => item.section === table.section && (item.tableNode === table.tableNode || item.positionOwnerTableNode === table.tableNode);
    if (layout.boxes.some(box => owns(box) && !instances.has(instance(box)))
      || layout.rows.some(row => owns(row) && !instances.has(instance(row)))
      || layout.flowPictures?.some(p => p.section === table.section && p.cell?.tableNode === table.tableNode && !instances.has(instance(p)))) return unavailable("UnsupportedSplitInlineTable");
    const projectedBoxes = new Map(), projectedRows = new Map(), projectedPictures = new Map();
    for (const key of instances) {
      const boxes = layout.boxes.filter(box => !owns(box) || instance(box) === key);
      const rows = layout.rows.filter(row => !owns(row) || instance(row) === key);
      const pictures = layout.flowPictures?.filter(p => p.section !== table.section || p.cell?.tableNode !== table.tableNode || instance(p) === key);
      const part = placeInlineTablePages(table, paragraph, { ...layout,
        boxes, rows, flowPictures: pictures,
      }, outerInsets);
      if (part.state !== "placed") return part;
      boxes.forEach((box, i) => { if (owns(box)) projectedBoxes.set(box, part.boxes[i]); });
      rows.forEach((row, i) => { if (owns(row)) projectedRows.set(row, part.rows[i]); });
      pictures?.forEach((picture, i) => { if (picture.section === table.section && picture.cell?.tableNode === table.tableNode) projectedPictures.set(picture, part.flowPictures[i]); });
    }
    return { ...layout,
      boxes: layout.boxes.map(box => projectedBoxes.get(box) ?? box),
      rows: layout.rows.map(row => projectedRows.get(row) ?? row),
      ...(layout.flowPictures ? { flowPictures: layout.flowPictures.map(p => projectedPictures.get(p) ?? p) } : {}),
    };
  }
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
    if (!paper || ![paper.x, paper.width, paper.x + paper.width, start, end].every(Number.isFinite) || paper.width <= 0 || start < paper.x || end > paper.x + paper.width + 1e-8) return {
      ...unavailable("InlineTablePageWidthOverflow"), pageOrdinal: boxes[0].pageOrdinal,
      columnOrdinal: boxes[0].columnOrdinal, footprint: { start, end, width: end - start },
      column: { ...column }, paper: paper ? { ...paper } : undefined };
  }
  const shift = column.x + line.x + margins.left - left;
  const ownsPosition = item => item.section === table.section && (item.tableNode === table.tableNode || item.positionOwnerTableNode === table.tableNode);
  const projected = layout.boxes.map(box => ownsPosition(box) ? { ...box, x: box.x + shift } : box);
  const rows = layout.rows.map(row => ownsPosition(row) ? { ...row, x: row.x + shift } : row);
  const flowPictures = layout.flowPictures?.map(picture => picture.cell?.tableNode === table.tableNode && picture.section === table.section
    ? { ...picture, rectangle: { ...picture.rectangle, x: picture.rectangle.x + shift } } : picture);
  if (flowPictures?.some(picture => !picture.rectangle || !Number.isFinite(picture.rectangle.x) || !Number.isFinite(picture.rectangle.x + picture.rectangle.width))) return unavailable("InlineTablePageWidthOverflow");
  if (projected.some(box => !Number.isFinite(box.x) || !Number.isFinite(box.x + box.width)) || rows.some(row => !Number.isFinite(row.x))) return unavailable("InlineTablePageWidthOverflow");
  return { ...layout, boxes: projected, rows, ...(flowPictures ? { flowPictures } : {}) };
}
