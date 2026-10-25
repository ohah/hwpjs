import { isFootnoteColumnReservation } from "./footnote-column-reservation.mjs";
import { pageSequenceReference } from "./page-sequence-reference.mjs";
import { tableCellBand } from "./table-cell-band.mjs";
import { tableCellInsets } from "./table-insets.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";

export function createCellFootnoteFragmentCapacity(table, measured, setting, columnBottom, {
  origin, padding, prefixRows, firstPage, x = 20, y = 20, gap = 20,
}) {
  const fail = error => ({ state: "unavailable", error });
  if (!isFootnoteColumnReservation(columnBottom) || !Array.isArray(prefixRows) || !Array.isArray(table?.cells)
    || ![table.section, table.tableNode, table.hostParagraph].every(n => Number.isSafeInteger(n) && n >= 0)
    || !origin || ![origin.x, origin.y].every(Number.isFinite) || !Number.isSafeInteger(firstPage) || firstPage < 0
    || measured?.state !== "measured" || !(measured.flows instanceof Map) || !Number.isFinite(measured.grid?.height) || measured.grid.height <= 0
    || !Array.isArray(measured.grid.cells) || measured.grid.cells.length !== table.cells.length) return fail("InvalidCellFootnoteSources");
  const resolved = padding === "source" ? resolveTablePadding(table, padding) : padding;
  if (resolved == null) return fail("InvalidCellFootnoteSources");
  const bands = [];
  const lists = new Set();
  for (const [index, cell] of table.cells.entries()) {
    if (!cell || !Array.isArray(cell.paragraphs) || lists.has(cell.listNode)) return fail("InvalidCellFootnoteSources");
    lists.add(cell.listNode);
    const box = measured.grid?.cells?.[index], flow = measured.flows.get(cell.listNode), inset = tableCellInsets(resolved, cell);
    if (!box || box.listNode !== cell.listNode || !flow || !Array.isArray(flow.rows) || !inset
      || flow.boxes?.length || flow.floatingTables?.length) return fail("UnsupportedCellFootnoteReferenceFlow");
    for (const row of flow.rows) {
      if (row.createdHost !== undefined) return fail("UnsupportedCellFootnoteReferenceFlow");
      if (row.kind !== "text") continue;
      const band = tableCellBand(box.y - origin.y + inset.top, row);
      if (row.section !== table.section || !cell.paragraphs.includes(row.paragraph)
        || ![band.start, band.end].every(Number.isFinite) || band.start < 0 || band.end <= band.start || band.end > measured.grid.height
        || !Number.isSafeInteger(row.startUnit) || row.startUnit < 0 || !Number.isSafeInteger(row.endUnit) || row.endUnit < row.startUnit) return fail("InvalidCellFootnoteSources");
      bands.push({ ...band, row: { kind: "text", section: row.section, paragraph: row.paragraph, startUnit: row.startUnit, endUnit: row.endUnit } });
    }
  }
  const referencesFor = (start, end) => bands.filter(b => b.start >= start && b.end <= end).map(b => b.row);
  const fragmentCapacity = ({ start, end, pageIndex, available }) => {
    const pageOrdinal = firstPage + pageIndex, reference = pageSequenceReference(setting, pageOrdinal, { x, y, gap });
    if (reference.state !== "placed") return NaN;
    const context = { column: reference.boxes.page, pageOrdinal, columnOrdinal: 0, placedRows: prefixRows };
    const empty = { kind: "gap", section: table.section, paragraph: table.hostParagraph };
    const baseline = columnBottom(empty, context);
    const bottom = columnBottom({ ...empty, cellFragment: pageIndex, cellTableNode: table.tableNode, cellReferenceRows: referencesFor(start, end) }, context);
    return Number.isFinite(baseline) && Number.isFinite(bottom) ? Math.max(0, available - Math.max(0, baseline - bottom)) : NaN;
  };
  return { state: "ready", fragmentCapacity, referencesFor };
}
