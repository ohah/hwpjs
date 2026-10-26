import { caretGeometry, selectableText } from "./text-geometry.mjs";

// Navigation changes only the interaction target, never the native table.
export function adjacentCell(content, layout, point, backward = false) {
  if (point.createdCell) {
    const table = content.createdTables?.find(
      (table) => table.section === point.section && table.identity === point.createdCell.identity,
    );
    if (!table) return null;
    const index = table.cells.findIndex(
      (cell) => cell.row === point.createdCell.row && cell.column === point.createdCell.column,
    );
    if (index < 0) return null;
    const cell = table.cells[index + (backward ? -1 : 1)];
    if (!cell) return null;
    const target = {
      section: point.section,
      createdCell: { identity: table.identity, row: cell.row, column: cell.column },
      unit: 0,
      affinity: "forward",
    };
    return caretGeometry(layout, target) ? target : null;
  }
  const current = content.paragraphs.find(
    (p) => p.section === point.section && p.paragraph === point.paragraph,
  );
  if (!current?.tableCell) return null;
  const table = content.tables?.find(
    (t) => t.section === point.section && t.tableNode === current.tableCell.tableNode,
  );
  if (!table || table.partial) return null;
  const cells = [...table.cells].sort((a, b) => a.row - b.row || a.column - b.column);
  const index = cells.findIndex((cell) => cell.listNode === current.tableCell.listNode);
  if (index < 0) return null;
  const step = backward ? -1 : 1;
  for (let next = index + step; next >= 0 && next < cells.length; next += step) {
    const paragraphs = backward ? [...cells[next].paragraphs].reverse() : cells[next].paragraphs;
    for (const ordinal of paragraphs) {
      const p = content.paragraphs.find(
        (p) => p.section === point.section && p.paragraph === ordinal,
      );
      if (!p || p.clipped || !selectableText(p)) continue;
      const target = { section: p.section, paragraph: p.paragraph, unit: 0, affinity: "forward" };
      if (caretGeometry(layout, target)) return target;
    }
  }
  return null;
}
