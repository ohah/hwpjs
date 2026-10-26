import { measureNestedTable } from "./nested-table-measurement.mjs";
import { singleCellPictureColumn } from "./single-cell-picture-column.mjs";

/** Measure original table grids only; physical repeated placement is a later step. */
export function measurePageAreaTables(area, measure, maxRows = 20000) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !area ||
    !Array.isArray(area.tables) ||
    !Array.isArray(area.paragraphs) ||
    !Array.isArray(area.paragraphFlows) ||
    typeof measure !== "function" ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return fail("InvalidPageAreaTableMeasurement");
  const entries = [];
  let rowCount = 0;
  for (const table of area.tables.filter((table) => table.parentTableNode == null)) {
    if (rowCount >= maxRows) return fail("PageAreaTableMeasurementLimit");
    const measured = measureNestedTable(area, table, measure, {
      maxRows: maxRows - rowCount,
      overflow: "visible",
      pictureReferences: singleCellPictureColumn,
    });
    if (measured.state !== "measured") return measured;
    rowCount += measured.rowCount;
    entries.push({ table, measured });
  }
  return { state: "tables-measured", entries, rowCount };
}
