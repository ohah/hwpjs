import { tableRowBands } from "./table-row-bands.mjs";
import { tableInsets } from "./table-insets.mjs";
import {selectRepeatedTableHeader} from "./table-repeated-header.mjs";
import { paragraphCellOffset } from "./paragraph-cell-offset-policy.mjs";
import { inlineTablePageFitHeight } from "./inline-table-page-fit.mjs";

// Shared explicit band selection and outer-space reservation.
export function prepareTablePageBands(table, rowHeights, splitMode, outerInsets = 0) {
  if (!["whole", "row-bands"].includes(splitMode)) return { state: "unavailable", error: "MissingTableSplitMode" };
  const margins = tableInsets(outerInsets);
  if (!margins) return { state: "unavailable", error: "InvalidTableOuterInsets" };
  let bands;
  try { bands = tableRowBands(table, rowHeights); }
  catch (error) {
    if (!(error instanceof RangeError) || error.message !== "InvalidTableRowBands") throw error;
    return { state: "unavailable", error: error.message, section: table?.section, tableNode: table?.tableNode,
      rowHeightCount: Array.isArray(rowHeights) ? rowHeights.length : undefined,
      invalidRowHeightIndex: Array.isArray(rowHeights) ? rowHeights.findIndex(height => !Number.isFinite(height) || height <= 0) : undefined };
  }
  const header=selectRepeatedTableHeader(table,rowHeights);
  if(header.state==="unavailable")return header;
  let selected = splitMode === "whole" ? [{ startRow: 0, endRow: table.rows, offset: 0, height: bands.reduce((sum, band) => sum + band.height, 0), cells: table.cells.map((_, index) => index) }] : bands;
  const repeatedHeader=splitMode==="row-bands"&&header.state==="selected"?header:null;
  if(repeatedHeader)selected=[{startRow:0,endRow:header.endRow,offset:0,height:header.height,cells:header.cells},...bands.filter(band=>band.startRow>=header.endRow)];
  const rows = selected.map((band, bandOrdinal) => ({ kind: "gap", section: table.section, paragraph: table.hostParagraph,
    height: band.height + (bandOrdinal === 0 ? margins.top : 0) + (bandOrdinal === selected.length - 1 ? margins.bottom : 0), bandOrdinal }));
  const last = rows.at(-1);
  if (last) {
    const fit = inlineTablePageFitHeight(table, last.height, margins);
    if (fit < last.height) last.pageFitHeight = fit;
  }
  if (table.sourceGeometry?.geometry?.treat_as_character === false && (table.sourceGeometry.geometry.vertical_offset !== 0 || [0, 1].includes(table.sourceGeometry.vertical_relative))) {
    if (splitMode !== "whole" && paragraphCellOffset(table) === null) return { state: "unavailable", error: "UnsupportedSplitTableVerticalFlow" };
    if (splitMode === "whole") rows[0].tableVerticalSource = table.sourceGeometry;
  }
  return { state: "prepared", selected, margins, rows, ...(repeatedHeader?{repeatedHeader}:{}) };
}

export function tablePageBandFragment(prepared, row) {
  return { ...prepared.selected[row.bandOrdinal], x: row.x + (row.inlineTableAnchor?.x ?? 0) + prepared.margins.left,
    y: row.y + (row.inlineTableAnchor ? 0 : row.verticalReservationGap ?? 0) + (row.bandOrdinal === 0 ? prepared.margins.top : 0), pageOrdinal: row.pageOrdinal, columnOrdinal: row.columnOrdinal, referenceBoxes: row.referenceBoxes };
}
