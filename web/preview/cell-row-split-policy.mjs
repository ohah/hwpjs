import { tableRowBands } from "./table-row-bands.mjs";
import { tableCellRowExtent, isZeroAdvanceCellAnchor } from "./table-cell-band.mjs";

// Classify measured source row bands; do not select or move a page boundary.
export function cellRowSplitPolicy(table, measured, { top = 0 } = {}) {
  const fail = () => ({ state: "unavailable", error: "InvalidCellRowSplitPolicy" });
  if (
    measured?.state !== "measured" ||
    !(measured.flows instanceof Map) ||
    !Array.isArray(measured.grid?.rows) ||
    !Number.isFinite(top) ||
    top < 0
  )
    return fail();
  let sourceBands;
  try {
    sourceBands = tableRowBands(table, measured.grid.rows);
  } catch {
    return fail();
  }
  const multiline = [];
  for (const cell of table.cells) {
    const flow = measured.flows.get(cell.listNode);
    const count = cellFlowLineCount(flow, table.section);
    if (count === null) return fail();
    multiline.push(count > 1);
  }
  const ends = [0];
  for (const height of measured.grid.rows) ends.push(ends.at(-1) + height);
  return {
    state: "prepared",
    bands: sourceBands.map((band) => ({
      startRow: band.startRow,
      endRow: band.endRow,
      start: top + ends[band.startRow],
      end: top + ends[band.endRow],
      splittable: band.cells.some((index) => multiline[index]),
    })),
  };
}

// Count physical line origins, excluding nonpainting anchors and same-line fragments.
export function cellFlowLineCount(flow, section) {
  if (!Array.isArray(flow?.rows)) return null;
  const lines = new Set();
  for (const row of flow.rows) {
    if (
      !row ||
      !["text", "gap"].includes(row.kind) ||
      row.section !== section ||
      !Number.isFinite(row.y) ||
      row.y < 0
    )
      return null;
    const extent = tableCellRowExtent(row);
    if (!Number.isFinite(extent) || extent < 0) return null;
    if (row.kind === "text" && !isZeroAdvanceCellAnchor(row) && extent > 0) lines.add(row.y);
  }
  return lines.size;
}
