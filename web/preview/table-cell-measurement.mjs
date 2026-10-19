import { layoutContent } from "./layout.mjs";
import { tableGrid } from "./table-grid.mjs";
import { tableCellInsets } from "./table-insets.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { tableCellColumnContext } from "./table-cell-column-context.mjs";
import { measureTableCellColumns } from "./table-cell-column-measurement.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { alignTableCellFlow } from "./table-cell-vertical-alignment.mjs";

/** Measure flat cell paragraphs without inventing source padding or page policy. */
export function measureTableCells(table, paragraphs, measure, { origin, padding, maxRows = 20000, pictures = [], pictureReferences, paragraphFlows, measureCellFlow, compactLines = false, columnWidths, sourceRowHorizontals = false, minimumRowHeight = 28 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Number.isFinite(minimumRowHeight) || minimumRowHeight < 0) return unavailable("InvalidTableCellMeasurement");
  if (!Array.isArray(pictures)) return unavailable("InvalidTableCellPictures");
  if (measureCellFlow !== undefined && typeof measureCellFlow !== "function") return unavailable("InvalidTableCellMeasurement");
  if (padding === "source") {
    padding = resolveTablePadding(table, padding);
    if (!padding) return unavailable("MissingTableSourceInsets");
  }
  if (!Array.isArray(table?.cells) || table.cells.some(cell => !cell || !tableCellInsets(padding, cell)) || !Array.isArray(paragraphs) || typeof measure !== "function" || !origin || ![origin.x, origin.y].every(Number.isFinite) || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidTableCellMeasurement");
  const members = new Map();
  for (const paragraph of paragraphs) {
    const key = `${paragraph.section}:${paragraph.paragraph}`;
    if (members.has(key)) return unavailable("AmbiguousTableCellParagraph");
    members.set(key, paragraph);
  }
  const initial = tableGrid(table, { ...origin, columnWidths, sourceRowHorizontals, minRow: minimumRowHeight }), flows = new Map(), owned = new Set();
  let measuredRows = 0;
  for (const [index, cell] of table.cells.entries()) {
    const insets = tableCellInsets(padding, cell);
    if (!Array.isArray(cell.paragraphs) || flows.has(cell.listNode)) return unavailable("AmbiguousTableCellParagraph");
    const selected = [];
    for (const id of cell.paragraphs) {
      const key = `${table.section}:${id}`, paragraph = members.get(key);
      if (!paragraph || owned.has(key)) return unavailable("AmbiguousTableCellParagraph");
      if (paragraph.clipped || paragraph.tableCell?.tableNode !== table.tableNode || paragraph.tableCell?.listNode !== cell.listNode) return unavailable("UnsupportedTableCellContent");
      owned.add(key); selected.push(paragraph);
    }
    const width = initial.cells[index].width - insets.left - insets.right;
    if (width <= 0) return unavailable("InvalidTableCellMeasurement");
    if (measuredRows >= maxRows) return unavailable("TableCellMeasurementLimit");
    const selectedIds = new Set(selected.map(paragraph => paragraph.paragraph));
    const cellPictures = pictures.filter(picture => picture.section === table.section && selectedIds.has(picture.paragraph));
    const context = paragraphFlows === undefined ? null : tableCellColumnContext(table, cell, paragraphs, paragraphFlows);
    if (context && context.state !== "selected") return context;
    const multiple = context?.declaration?.count > 1;
    if (multiple && cellPictures.length) return unavailable("UnsupportedTableCellColumnPictures");
    const defaultFlow = () => multiple ? measureTableCellColumns(selected, context.declaration, width,
      Math.max(0, initial.cells[index].height - insets.top - insets.bottom), measure, maxRows - measuredRows) : layoutContent({ paragraphs: selected, pictures: cellPictures, limited: false,
      pictureFlowContext: { cell: { tableNode: table.tableNode, listNode: cell.listNode }, references: pictureReferences } },
      width, measure, maxRows - measuredRows, { documentBody: true, compactLines });
    const supplied = measureCellFlow?.({ table, cell, paragraphs: selected, width, height: Math.max(0, initial.cells[index].height - insets.top - insets.bottom),
      columnContext: context, pictures: cellPictures, measure, maxRows: maxRows - measuredRows });
    const flow = supplied ?? defaultFlow();
    if (flow.state === "unavailable") return flow;
    if (!Array.isArray(flow.rows) || !Number.isFinite(flow.height) || flow.height < 0) return unavailable("InvalidTableCellMeasurement");
    if (flow.limited || flow.rows.length > maxRows - measuredRows) return unavailable("TableCellMeasurementLimit");
    if (supplied != null) {
      const invalidIndex = flow.rows.findIndex(row => !row || ![row.y, row.height].every(Number.isFinite) || row.y < 0 || row.height <= 0 || row.y + row.height > flow.height + 1e-8);
      if (invalidIndex >= 0) return { ...unavailable("InvalidTableCellMeasurement"), tableNode: table.tableNode, listNode: cell.listNode,
        rowY: flow.rows[invalidIndex]?.y, rowHeight: flow.rows[invalidIndex]?.height, flowHeight: flow.height };
      const ownRows = flow.rows.filter(row => row.section === table.section && selectedIds.has(row.paragraph));
      if (pageParagraphCoverage(selected, ownRows).state !== "complete") return unavailable("IncompleteTableCellMeasurement");
    }
    measuredRows += flow.rows.length;
    flows.set(cell.listNode, flow);
  }
  const grid = tableGrid(table, { ...origin, columnWidths, sourceRowHorizontals, minRow: minimumRowHeight, contentSize: cell => {
    const insets = tableCellInsets(padding, cell);
    return { width: 0, height: flows.get(cell.listNode).height + insets.top + insets.bottom };
  } });
  try {
    for (const [index, cell] of table.cells.entries()) {
      const flow = flows.get(cell.listNode), insets = tableCellInsets(padding, cell);
      try {
        flows.set(cell.listNode, alignTableCellFlow(flow, grid.cells[index].height, insets, cell.sourceVerticalAlignment ?? 0));
      } catch (error) {
        return { ...unavailable(error.message), tableNode: table.tableNode, listNode: cell.listNode,
          flowHeight: flow.height, cellHeight: grid.cells[index].height, topInset: insets.top, bottomInset: insets.bottom,
          verticalAlignment: cell.sourceVerticalAlignment ?? 0 };
      }
    }
  } catch (error) { return unavailable(error.message); }
  return { state: "measured", grid, flows, rowCount: measuredRows };
}
