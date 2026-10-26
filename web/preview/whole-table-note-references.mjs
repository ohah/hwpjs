import {
  hasCellFootnoteReferences,
  isFootnoteColumnReservation,
} from "./footnote-column-reservation.mjs";
import { sourceTableLineReferences } from "./source-table-line-references.mjs";

// Only the exact whole-table anchor row owns its cell references.
export function wholeTableNoteReferences(entries, rows, columnBottom) {
  if (!isFootnoteColumnReservation(columnBottom)) return { state: "bound", rows };
  try {
    return {
      state: "bound",
      rows: rows.map((row) => {
        if (row.mandatoryCellFragment !== undefined && Array.isArray(row.cellReferenceRows))
          return row;
        const indices = new Set((row.inlineTableAnchors ?? []).map((item) => item.tableIndex));
        if (row.tableIndex !== undefined) indices.add(row.tableIndex);
        const sources = new Map(),
          anchors = [];
        for (const index of indices) {
          const entry = entries[index];
          if (
            !entry ||
            !Array.isArray(entry.table?.cells) ||
            !hasCellFootnoteReferences(
              columnBottom,
              entry.table.section,
              new Set(entry.table.cells.flatMap((c) => c.paragraphs)),
            )
          )
            continue;
          if (entry.splitMode !== "whole") throw new Error("MissingCellFootnoteBandReservation");
          sources.set(entry.table.tableNode, { table: entry.table, measured: entry.measured });
          anchors.push({ tableNode: entry.table.tableNode });
        }
        return anchors.length
          ? { ...row, sourceTableReferenceRows: sourceTableLineReferences(anchors, sources) }
          : row;
      }),
    };
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
}
