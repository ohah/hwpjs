import { selectRepeatedTableHeader } from "./table-repeated-header.mjs";

// Transient body-only coordinates; source table/cell identities and editable flows stay unchanged.
export function repeatedCellTableBody(table, measured) {
  if (
    measured?.state !== "measured" ||
    !(measured.flows instanceof Map) ||
    !Array.isArray(measured.grid?.cells)
  )
    return { state: "unavailable", error: "InvalidRepeatedTableHeader" };
  const header = selectRepeatedTableHeader(table, measured?.grid?.rows);
  if (header.state === "unavailable") return header;
  if (header.state !== "selected" || header.endRow === table.rows) return { state: "none" };
  const indices = table.cells.flatMap((cell, index) => (cell.row >= header.endRow ? [index] : []));
  const cells = indices.map((index) => ({
    ...table.cells[index],
    row: table.cells[index].row - header.endRow,
  }));
  const flows = new Map(cells.map((cell) => [cell.listNode, measured.flows.get(cell.listNode)]));
  for (const index of header.cells)
    if (measured.flows.get(table.cells[index].listNode)?.cellPageBreaks?.length)
      return { state: "unavailable", error: "UnsupportedRepeatedHeaderBreak" };
  const height = measured.grid.height - header.height;
  if (!Number.isFinite(height) || height <= 0)
    return { state: "unavailable", error: "InvalidRepeatedTableHeader" };
  return {
    state: "prepared",
    header,
    table: {
      ...table,
      rows: table.rows - header.endRow,
      cells,
      pagination: { ...table.pagination, repeat_header: false },
    },
    measured: {
      ...measured,
      flows,
      grid: {
        ...measured.grid,
        height,
        rows: measured.grid.rows.slice(header.endRow),
        cells: indices.map((index) => ({
          ...measured.grid.cells[index],
          y: measured.grid.cells[index].y - header.height,
        })),
      },
    },
  };
}
