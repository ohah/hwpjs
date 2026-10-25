import { createdTableIdentity } from "../../js/created-table-identity.mjs";
import { layoutCreatedTable } from "./created-table-layout.mjs";
import { planTablePages } from "./table-page-plan.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";

// Explicit whole/row-band planning; no fabricated source table/list node IDs.
export function layoutCreatedTablePages(table, setting, hostFlow, measure, { splitMode, maxRows = 20000, ...pageOptions } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  try { createdTableIdentity(table?.identity); } catch { return unavailable("InvalidCreatedTablePageLayout"); }
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || table.section !== setting?.section_ordinal
      || !Number.isSafeInteger(table.rows) || table.rows < 1 || !Number.isSafeInteger(table.columns) || table.columns < 1
      || !Array.isArray(table.cells) || table.cells.length !== table.rows * table.columns
      || table.cells.some((cell, index) => !cell || cell.row !== Math.floor(index / table.columns) || cell.column !== index % table.columns)) return unavailable("InvalidCreatedTablePageLayout");
  const reference = pageReferenceBoxes(setting, { x: pageOptions.x ?? 20, y: pageOptions.y ?? 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  let measured;
  try { measured = layoutCreatedTable(table, measure, { x: 0, y: 0, maxRows }); }
  catch (error) {
    if (["InvalidTableGrid", "InvalidCreatedTableLayout", "CreatedTableLayoutRowBudgetExceeded"].includes(error.message)) return unavailable(error.message);
    throw error;
  }
  if (measured.width > reference.boxes.page.width) return unavailable("CreatedTablePageWidthOverflow");
  const geometry = { ...table, cells: table.cells.map(cell => ({ ...cell, rowSpan: 1, columnSpan: 1 })) };
  const rowHeights = Array.from({ length: table.rows }, (_, row) => measured.boxes[row * table.columns].height);
  const plan = planTablePages(geometry, rowHeights, setting, hostFlow, { ...pageOptions, splitMode, maxRows });
  if (plan.state !== "planned") return plan;
  const cellRows = Array.from({ length: table.cells.length }, () => []);
  for (const row of measured.rows) cellRows[row.createdCell.row * table.columns + row.createdCell.column].push(row);
  const rows = [...plan.bodyRows], boxes = [], emitted = new Set();
  for (const fragment of plan.fragments) for (const index of fragment.cells) {
    if (measured.width > fragment.referenceBoxes.column.width) return unavailable("CreatedTablePageWidthOverflow");
    if (emitted.has(index)) return unavailable("DuplicateCreatedTablePageCell");
    emitted.add(index);
    const sourceBox = measured.boxes[index];
    const placement = { pageOrdinal: fragment.pageOrdinal, columnOrdinal: fragment.columnOrdinal, referenceBoxes: fragment.referenceBoxes };
    const dx = fragment.x, dy = fragment.y - fragment.offset;
    const box = { ...sourceBox, x: sourceBox.x + dx, y: sourceBox.y + dy, ...placement };
    if (![box.x, box.y, box.x + box.width, box.y + box.height].every(Number.isFinite)) return unavailable("InvalidCreatedTablePageProjection");
    boxes.push(box);
    for (const row of cellRows[index]) {
      if (rows.length >= maxRows) return unavailable("CreatedTablePageProjectionLimit");
      rows.push({ ...row, x: row.x + dx, y: row.y + dy, ...placement,
        pageClip: { ...row.pageClip, x: row.pageClip.x + dx, y: row.pageClip.y + dy } });
    }
  }
  if (emitted.size !== table.cells.length) return unavailable("IncompleteCreatedTablePageCells");
  rows.sort((a, b) => a.pageOrdinal - b.pageOrdinal || (a.columnOrdinal ?? 0) - (b.columnOrdinal ?? 0) || a.y - b.y || a.x - b.x);
  return { state: "placed", rows, boxes, pages: plan.pages, height: plan.height, spatialRows: true, limited: false,
    createdCellParagraphs: measured.paragraphs, pageLayoutMode: "measured-created-table-row-bands" };
}
