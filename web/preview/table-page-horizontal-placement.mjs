import { translatePicturePlacement } from "./picture-placement-translation.mjs";
import { placeFloatingTable } from "./table-placement.mjs";
import { tableInsets } from "./table-insets.mjs";
import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import { tableHorizontalOverflowBoundary,tableHorizontalBoundsContain } from "./table-horizontal-overflow-boundary.mjs";

// Horizontal source anchors over already paginated, single-column fragments.
export function placeTablePagesHorizontally(table, layout, outerInsets, paragraph) {
  const unavailable = error => ({ state: "unavailable", error });
  const margins = tableInsets(outerInsets), relative = table?.sourceGeometry?.horizontal_relative;
  if (!margins || ![0, 1, 2, 3].includes(relative) || layout?.state !== "placed" || (relative === 3 && !paragraph)) return unavailable("UnsupportedTablePageAnchor");
  const shifts = new Map(), boundaries = new Map();
  for (const box of layout.boxes) {
    if (box.tableNode !== table.tableNode) continue;
    if (![box.x, box.width, box.x + box.width].every(Number.isFinite) || box.width <= 0) return unavailable("TablePageWidthOverflow");
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
    const own = layout.boxes.filter(item => item.tableNode === table.tableNode && item.pageOrdinal === key);
    const measuredWidth = own.reduce((end, item) => Math.max(end, item.x + item.width), -Infinity) - own.reduce((start, item) => Math.min(start, item.x), Infinity);
    // 문단은 위치 기준이지 종이 여백에 걸친 원본 표의 잘라내기 경계가 아닙니다.
    boundaries.set(key,tableHorizontalOverflowBoundary(table,reference,measuredWidth,margins));
  }
  const ownsPosition = item => item.tableNode === table.tableNode || item.positionOwnerTableNode === table.tableNode;
  const boxes = layout.boxes.map(box => ownsPosition(box) ? { ...box, x: box.x + shifts.get(box.pageOrdinal), ...(box.tableNode === table.tableNode && boundaries.get(box.pageOrdinal) !== box.referenceBoxes.column ? { horizontalOverflowBoundary: "paper" } : {}) } : box);
  if (boxes.filter(box => box.tableNode === table.tableNode).some(box => {
    const boundary = boundaries.get(box.pageOrdinal);
    return !tableHorizontalBoundsContain(table,box,box.referenceBoxes,margins,boundary);
  })) return unavailable("TablePageWidthOverflow");
  const rows = layout.rows.map(row => ownsPosition(row) ? { ...row, x: row.x + shifts.get(row.pageOrdinal) } : row);
  const repeated={};
  for(const key of ["repeatedTableHeaderRows","repeatedTableHeaderBoxes"])if(layout[key]){
    if(!Array.isArray(layout[key]))return unavailable("UnsupportedTablePageAnchor");
    repeated[key]=layout[key].map(item=>ownsPosition(item)?{...item,x:item.x+shifts.get(item.pageOrdinal)}:item);
    if(repeated[key].some(item=>!Number.isFinite(item.x)||!Number.isFinite(item.x+(item.width??0))))return unavailable("UnsupportedTablePageAnchor");
  }
  const flowPictures = layout.flowPictures?.map(picture => (picture.cell?.tableNode === table.tableNode || picture.positionOwnerTableNode === table.tableNode) && picture.section === table.section
    ? translatePicturePlacement(picture, shifts.get(picture.pageOrdinal), 0).picture : picture);
  if (flowPictures?.some(picture => !picture || !picture.rectangle || !Number.isFinite(picture.rectangle.x) || !Number.isFinite(picture.rectangle.x + picture.rectangle.width))) return unavailable("UnsupportedTablePageAnchor");
  if (rows.some(row => !Number.isFinite(row.x) || (row.width !== undefined && !Number.isFinite(row.x + row.width)))) return unavailable("UnsupportedTablePageAnchor");
  return { ...layout, boxes, rows, ...repeated, ...(flowPictures ? { flowPictures } : {}) };
}
