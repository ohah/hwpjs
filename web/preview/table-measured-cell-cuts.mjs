import { tableCellInsets } from "./table-insets.mjs";
import { planCellPageCuts } from "./table-cell-page-cuts.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { projectNestedTableCellContent } from "./nested-table-cell-projection.mjs";

// Convert owned cell measurements to local line bands; no placement policy.
export function planMeasuredCellCuts(table, measured, capacity, { origin, padding, maxRows = 20000, maxPages = 2000, firstCapacity = capacity } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (padding === "source") {
    padding = resolveTablePadding(table, padding);
    if (!padding) return unavailable("MissingTableSourceInsets");
  }
  if (!Array.isArray(table?.cells) || measured?.state !== "measured" || !Array.isArray(measured.grid?.cells) || !(measured.flows instanceof Map) || !origin || ![origin.x, origin.y].every(Number.isFinite) || measured.grid.cells.length !== table.cells.length || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidMeasuredCellCuts");
  const bands = [], seen = new Set();
  let rows = 0;
  for (const [index, cell] of table.cells.entries()) {
    const box = measured.grid.cells[index], flow = measured.flows.get(cell?.listNode), insets = cell && tableCellInsets(padding, cell);
    if (!cell || !Array.isArray(cell.paragraphs) || seen.has(cell.listNode) || !box || box.listNode !== cell.listNode || !flow || flow.limited || !Array.isArray(flow.rows) || !insets || ![box.y, box.height].every(Number.isFinite) || box.height <= 0 || box.y < origin.y || box.y + box.height > origin.y + measured.grid.height + 1e-8) return unavailable("InvalidMeasuredCellCuts");
    seen.add(cell.listNode);
    const members = new Set(cell.paragraphs);
    if (flow.flowPictures !== undefined && !Array.isArray(flow.flowPictures)) return unavailable("InvalidMeasuredCellCuts");
    for (const picture of flow.flowPictures ?? []) {
      const rectangle = picture?.rectangle;
      if (!picture || picture.section !== table.section || !members.has(picture.paragraph) || picture.cell?.tableNode !== table.tableNode || picture.cell.listNode !== cell.listNode
        || !rectangle || ![rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.x + rectangle.width, rectangle.y + rectangle.height].every(Number.isFinite)
        || rectangle.y < 0 || rectangle.width <= 0 || rectangle.height <= 0
        || rectangle.y + rectangle.height > box.height - insets.top - insets.bottom + 1e-8) return unavailable("InvalidMeasuredCellCuts");
      const start = box.y - origin.y + insets.top + rectangle.y;
      bands.push({ start, end: start + rectangle.height });
    }
    if (flow.boxes?.length) {
      const nested = projectNestedTableCellContent(flow, { ...box, section: table.section, tableNode: table.tableNode, listNode: cell.listNode },
        insets, { pageOrdinal: 0 }, maxRows - rows);
      if (nested.state !== "placed") return nested;
      for (const nestedBox of nested.boxes) {
        const start = nestedBox.y - origin.y;
        bands.push({ start, end: start + nestedBox.height });
      }
      for (const row of nested.rows) {
        if (++rows > maxRows) return unavailable("TableCellMeasurementLimit");
        if (!["text", "gap"].includes(row.kind)) return unavailable("InvalidMeasuredCellCuts");
        if (row.kind === "text") {
          const start = row.y - origin.y;
          bands.push({ start, end: start + row.height });
        }
      }
      continue;
    }
    for (const row of flow.rows) {
      if (++rows > maxRows) return unavailable("TableCellMeasurementLimit");
      if (!row || !["text", "gap"].includes(row.kind) || row.section !== table.section || !members.has(row.paragraph) || ![row.y, row.height].every(Number.isFinite) || row.y < 0 || row.height <= 0 || row.y + row.height > box.height - insets.top - insets.bottom + 1e-8) return unavailable("InvalidMeasuredCellCuts");
      if (row.kind !== "text") continue;
      const start = box.y - origin.y + insets.top + row.y;
      bands.push({ start, end: start + row.height });
    }
  }
  return planCellPageCuts(measured.grid.height, bands, capacity, { maxPages, firstCapacity });
}
