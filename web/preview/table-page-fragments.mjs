import { tableCellInsets } from "./table-insets.mjs";
import { projectNestedTableCellContent } from "./nested-table-cell-projection.mjs";
import { projectNestedFloatingCellContent } from "./nested-floating-cell-content.mjs";
/** Project already measured cell rows into an explicit table page plan. */
export function projectTablePageFragments(table, grid, cellFlows, plan, { origin, padding, maxRows = 20000 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (plan?.state !== "planned" || !Array.isArray(plan.fragments) || !Array.isArray(table?.cells) || table.cells.some(cell => !cell || !tableCellInsets(padding, cell)) || !Array.isArray(grid?.cells) || !(cellFlows instanceof Map) || !origin || ![origin.x, origin.y].every(Number.isFinite) || !Number.isSafeInteger(maxRows) || maxRows < 1 || grid.cells.length !== table.cells.length) return unavailable("InvalidTablePageProjection");
  if (plan.bodyRows !== undefined && !Array.isArray(plan.bodyRows)) return unavailable("InvalidTablePageProjection");
  const bodyRows = plan.bodyRows ?? [];
  if (bodyRows.some(row => !row || ![row.x, row.y, row.height].every(Number.isFinite) || row.height <= 0 || !Number.isSafeInteger(row.pageOrdinal) || row.pageOrdinal < 0)) return unavailable("InvalidTablePageProjection");
  if (bodyRows.length > maxRows) return unavailable("TablePageProjectionLimit");
  const rows = [...bodyRows], boxes = [], flowPictures = [], emitted = new Set();
  for (const fragment of plan.fragments) {
    if (!fragment || !Array.isArray(fragment.cells) || ![fragment.x, fragment.y, fragment.offset].every(Number.isFinite) || !Number.isSafeInteger(fragment.startRow) || !Number.isSafeInteger(fragment.endRow) || fragment.startRow < 0 || fragment.endRow <= fragment.startRow || !Number.isSafeInteger(fragment.pageOrdinal) || fragment.pageOrdinal < 0) return unavailable("InvalidTablePageProjection");
    for (const index of fragment.cells) {
      if (!Number.isInteger(index) || index < 0 || index >= table.cells.length || emitted.has(index)) return unavailable("InvalidTablePageProjection");
      emitted.add(index);
      const cell = table.cells[index], sourceBox = grid.cells[index], flow = cellFlows.get(cell?.listNode);
      const insets = tableCellInsets(padding, cell);
      if (!cell || !sourceBox || !flow || !Array.isArray(flow.rows) || flow.limited || cell.row < fragment.startRow || cell.row + cell.rowSpan > fragment.endRow || sourceBox.listNode !== cell.listNode) return unavailable("IncompleteTablePageCell");
      const box = { ...sourceBox, x: fragment.x + sourceBox.x - origin.x, y: fragment.y + sourceBox.y - origin.y - fragment.offset,
        section: table.section, tableNode: table.tableNode, pageOrdinal: fragment.pageOrdinal, referenceBoxes: fragment.referenceBoxes };
      if (![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite) || box.width <= insets.left + insets.right || box.height < insets.top + insets.bottom) return unavailable("InvalidTablePageProjection");
      boxes.push(box);
      if (flow.floatingTables !== undefined) {
        const floating = projectNestedFloatingCellContent(box, flow, flow.floatingTables, { pageOrdinal: fragment.pageOrdinal, columnOrdinal: fragment.columnOrdinal, referenceBoxes: fragment.referenceBoxes }, { insets, maxRows: maxRows - rows.length });
        if (floating.state !== "placed") return floating;
        rows.push(...floating.rows); boxes.push(...floating.boxes);
        flowPictures.push(...(floating.flowPictures ?? []));
      }
      for (const picture of flow.flowPictures ?? []) {
        if (!picture || picture.cell?.tableNode !== table.tableNode || picture.cell?.listNode !== cell.listNode || picture.section !== table.section || !picture.rectangle) return unavailable("InvalidTablePagePicture");
        const rectangle = { ...picture.rectangle, x: box.x + insets.left + picture.rectangle.x, y: box.y + insets.top + picture.rectangle.y };
        if (![rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.x + rectangle.width, rectangle.y + rectangle.height].every(Number.isFinite) || rectangle.width <= 0 || rectangle.height <= 0) return unavailable("InvalidTablePagePicture");
        flowPictures.push({ ...picture, rectangle, pageOrdinal: fragment.pageOrdinal, referenceBoxes: fragment.referenceBoxes });
      }
      if (flow.boxes?.length) {
        const nested = projectNestedTableCellContent(flow, box, insets, fragment, maxRows - rows.length);
        if (nested.state !== "placed") return nested;
        rows.push(...nested.rows); boxes.push(...nested.boxes);
        continue;
      }
      for (const row of flow.rows) {
        if (rows.length >= maxRows) return unavailable("TablePageProjectionLimit");
        if (!row || ![row.y, row.height, row.x ?? 0, row.paragraphX ?? 0].every(Number.isFinite) || row.y < 0 || row.height <= 0 || row.y + row.height > box.height - insets.top - insets.bottom + 1e-8) return unavailable("TablePageCellOverflow");
        const projected = { ...row, ...(flow.columns ? { cellColumnOrdinal: row.columnOrdinal } : {}), x: box.x + insets.left + (row.x ?? 0), y: box.y + insets.top + row.y, section: table.section, tableNode: table.tableNode, listNode: cell.listNode, pageOrdinal: fragment.pageOrdinal, columnOrdinal: fragment.columnOrdinal, referenceBoxes: fragment.referenceBoxes };
        if (![projected.x, projected.y, projected.y + projected.height].every(Number.isFinite) || (row.width !== undefined && (!Number.isFinite(row.width) || row.width < 0 || !Number.isFinite(projected.x + row.width)))) return unavailable("InvalidTablePageProjection");
        rows.push(projected);
      }
    }
  }
  if (emitted.size !== table.cells.length) return unavailable("IncompleteTablePageCell");
  return { state: "placed", rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || (a.columnOrdinal ?? 0) - (b.columnOrdinal ?? 0) || a.y - b.y || a.x - b.x), boxes, ...(flowPictures.length ? { flowPictures } : {}), pages: plan.pages, height: plan.height, spatialRows: true, pageLayoutMode: "measured-body", limited: false };
}
