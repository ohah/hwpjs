import { sameCreatedCell } from "./created-cell-address.mjs";
export function projectCreatedCellDraft(content, draft) {
  if (!draft?.createdCell) return content;
  return {
    ...content,
    createdTables: content.createdTables?.map((table) =>
      table.section === draft.section && table.identity === draft.createdCell.identity
        ? {
            ...table,
            cells: table.cells.map((cell) =>
              sameCreatedCell(
                {
                  section: table.section,
                  createdCell: { identity: table.identity, row: cell.row, column: cell.column },
                },
                draft,
              )
                ? { ...cell, text: draft.text }
                : cell,
            ),
          }
        : table,
    ),
  };
}
