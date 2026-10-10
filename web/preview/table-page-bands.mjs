import { tableRowBands } from "./table-row-bands.mjs";
import { tableInsets } from "./table-insets.mjs";

// Shared explicit band selection and outer-space reservation.
export function prepareTablePageBands(table, rowHeights, splitMode, outerInsets = 0) {
  if (!["whole", "row-bands"].includes(splitMode)) return { state: "unavailable", error: "MissingTableSplitMode" };
  const margins = tableInsets(outerInsets);
  if (!margins) return { state: "unavailable", error: "InvalidTableOuterInsets" };
  let bands;
  try { bands = tableRowBands(table, rowHeights); }
  catch (error) {
    if (!(error instanceof RangeError) || error.message !== "InvalidTableRowBands") throw error;
    return { state: "unavailable", error: error.message };
  }
  const selected = splitMode === "whole" ? [{ startRow: 0, endRow: table.rows, offset: 0, height: bands.reduce((sum, band) => sum + band.height, 0), cells: table.cells.map((_, index) => index) }] : bands;
  const rows = selected.map((band, bandOrdinal) => ({ kind: "gap", section: table.section, paragraph: table.hostParagraph,
    height: band.height + (bandOrdinal === 0 ? margins.top : 0) + (bandOrdinal === selected.length - 1 ? margins.bottom : 0), bandOrdinal }));
  if (table.sourceGeometry?.geometry?.treat_as_character === false && table.sourceGeometry.geometry.vertical_offset !== 0) {
    if (splitMode !== "whole") return { state: "unavailable", error: "UnsupportedSplitTableVerticalFlow" };
    rows[0].tableVerticalSource = table.sourceGeometry;
  }
  return { state: "prepared", selected, margins, rows };
}

export function tablePageBandFragment(prepared, row) {
  return { ...prepared.selected[row.bandOrdinal], x: row.x + prepared.margins.left, y: row.y + (row.verticalReservationGap ?? 0) + (row.bandOrdinal === 0 ? prepared.margins.top : 0), pageOrdinal: row.pageOrdinal, columnOrdinal: row.columnOrdinal, referenceBoxes: row.referenceBoxes };
}
