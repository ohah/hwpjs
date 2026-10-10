import { planMeasuredCellCuts } from "./table-measured-cell-cuts.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { tableCellInsets } from "./table-insets.mjs";
import { projectNestedTableCellContent } from "./nested-table-cell-projection.mjs";

// Project explicit cuts and page placements; source pagination stays upstream.
export function projectCellPageCuts(table, measured, plan, placements, { origin, padding, maxRows = 20000, maxInspections = 400000, maxFragments = 2000 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (plan?.state !== "planned" || !Array.isArray(plan.fragments) || !plan.fragments.length || !Array.isArray(placements) || placements.length !== plan.fragments.length || !Number.isSafeInteger(maxInspections) || maxInspections < 1 || !Number.isSafeInteger(maxFragments) || maxFragments < 1) return unavailable("InvalidCellPageProjection");
  if (plan.fragments.length > maxFragments) return unavailable("CellPageProjectionLimit");
  padding = resolveTablePadding(table, padding);
  const validation = planMeasuredCellCuts(table, measured, measured?.grid?.height, { origin, padding, maxRows });
  if (validation.state !== "planned") return validation;
  let end = 0;
  for (const fragment of plan.fragments) {
    if (!fragment || ![fragment.start, fragment.end, fragment.height].every(Number.isFinite) || fragment.start !== end || fragment.end <= fragment.start || fragment.height !== fragment.end - fragment.start) return unavailable("InvalidCellPageProjection");
    end = fragment.end;
  }
  if (end !== measured.grid.height) return unavailable("InvalidCellPageProjection");
  const rows = [], boxes = [], flowPictures = [];
  let inspections = 0, previousPage = -1;
  for (const [fragmentIndex, fragment] of plan.fragments.entries()) {
    const placement = placements[fragmentIndex];
    if (!placement || ![placement.x, placement.y].every(Number.isFinite) || !Number.isSafeInteger(placement.pageOrdinal) || placement.pageOrdinal <= previousPage) return unavailable("InvalidCellPageProjection");
    previousPage = placement.pageOrdinal;
    for (const [index, cell] of table.cells.entries()) {
      if (++inspections > maxInspections) return unavailable("CellPageProjectionLimit");
      const source = measured.grid.cells[index], flow = measured.flows.get(cell.listNode), insets = tableCellInsets(padding, cell);
      const top = source.y - origin.y, bottom = top + source.height;
      const start = Math.max(top, fragment.start), finish = Math.min(bottom, fragment.end);
      if (finish <= start) continue;
      const x = placement.x + source.x - origin.x, y = placement.y + start - fragment.start;
      if (![x, y, source.width, x + source.width, y + finish - start].every(Number.isFinite) || source.width <= 0) return unavailable("InvalidCellPageProjection");
      boxes.push({ ...source, x, y, height: finish - start, section: table.section, tableNode: table.tableNode, pageOrdinal: placement.pageOrdinal,
        continuesBefore: start > top, continuesAfter: finish < bottom, referenceBoxes: placement.referenceBoxes });
      for (const picture of flow.flowPictures ?? []) {
        if (++inspections > maxInspections) return unavailable("CellPageProjectionLimit");
        const pictureTop = top + insets.top + picture.rectangle.y, pictureBottom = pictureTop + picture.rectangle.height;
        if (pictureBottom <= fragment.start || pictureTop >= fragment.end) continue;
        if (pictureTop < fragment.start || pictureBottom > fragment.end) return unavailable("SplitTableCellPicture");
        const rectangle = { ...picture.rectangle, x: x + insets.left + picture.rectangle.x, y: placement.y + pictureTop - fragment.start };
        if (![rectangle.x, rectangle.y, rectangle.x + rectangle.width, rectangle.y + rectangle.height].every(Number.isFinite)) return unavailable("InvalidCellPageProjection");
        flowPictures.push({ ...picture, rectangle, pageOrdinal: placement.pageOrdinal, referenceBoxes: placement.referenceBoxes });
      }
      if (flow.boxes?.length) {
        const nested = projectNestedTableCellContent(flow, { ...source, section: table.section, tableNode: table.tableNode, listNode: cell.listNode },
          insets, { pageOrdinal: placement.pageOrdinal, columnOrdinal: placement.columnOrdinal, referenceBoxes: placement.referenceBoxes }, maxRows);
        if (nested.state !== "placed") return nested;
        const move = item => {
          const shifted = { ...item, x: placement.x + item.x - origin.x, y: placement.y + item.y - origin.y - fragment.start };
          if (item.pageClip) shifted.pageClip = { ...item.pageClip, x: placement.x + item.pageClip.x - origin.x, y: placement.y + item.pageClip.y - origin.y - fragment.start };
          return shifted;
        };
        for (const item of [...nested.boxes, ...nested.rows]) {
          if (++inspections > maxInspections) return unavailable("CellPageProjectionLimit");
          const itemTop = item.y - origin.y, itemBottom = itemTop + item.height;
          if (itemBottom <= fragment.start || itemTop >= fragment.end) continue;
          if (item.kind !== "gap" && (itemTop < fragment.start || itemBottom > fragment.end)) return unavailable("SplitNestedCellContent");
          const shifted = move(item);
          if (item.kind === "gap") {
            shifted.y = placement.y + Math.max(itemTop, fragment.start) - fragment.start;
            shifted.height = Math.min(itemBottom, fragment.end) - Math.max(itemTop, fragment.start);
          }
          if (![shifted.x, shifted.y, shifted.x + (shifted.width ?? 0), shifted.y + shifted.height].every(Number.isFinite)) return unavailable("InvalidCellPageProjection");
          if (Object.hasOwn(item, "kind")) {
            if (rows.length >= maxRows) return unavailable("CellPageProjectionLimit");
            rows.push(shifted);
          } else boxes.push(shifted);
        }
        continue;
      }
      for (const row of flow.rows) {
        if (++inspections > maxInspections) return unavailable("CellPageProjectionLimit");
        const rowTop = top + insets.top + row.y, rowBottom = rowTop + row.height;
        if (rowBottom <= fragment.start || rowTop >= fragment.end) continue;
        if (row.kind === "text" && (rowTop < fragment.start || rowBottom > fragment.end)) return unavailable("SplitTableTextRow");
        if (rows.length >= maxRows) return unavailable("CellPageProjectionLimit");
        const localX = row.x ?? 0;
        if (!Number.isFinite(localX)) return unavailable("InvalidCellPageProjection");
        if (row.width !== undefined && (!Number.isFinite(row.width) || row.width < 0)) return unavailable("InvalidCellPageProjection");
        const rowX = x + insets.left + localX, rowY = placement.y + Math.max(rowTop, fragment.start) - fragment.start;
        const rowHeight = Math.min(rowBottom, fragment.end) - Math.max(rowTop, fragment.start);
        if (![rowX, rowY, rowHeight, rowY + rowHeight, rowX + (row.width ?? 0)].every(Number.isFinite)) return unavailable("InvalidCellPageProjection");
        rows.push({ ...row, ...(flow.columns ? { cellColumnOrdinal: row.columnOrdinal } : {}), columnOrdinal: placement.columnOrdinal, x: rowX, y: rowY,
          height: rowHeight, tableNode: table.tableNode, listNode: cell.listNode,
          pageOrdinal: placement.pageOrdinal, referenceBoxes: placement.referenceBoxes });
      }
    }
  }
  return { state: "placed", rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x), boxes,
    ...(flowPictures.length ? { flowPictures } : {}), spatialRows: true, limited: false };
}
