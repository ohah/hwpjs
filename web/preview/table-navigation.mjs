import { caretGeometry, selectableText } from "./text-geometry.mjs";

// Navigation changes only the interaction target, never the native table.
export function adjacentCell(content, layout, point, backward = false) {
  const current = content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph);
  if (!current?.tableCell) return null;
  const table = content.tables?.find(t => t.section === point.section && t.tableNode === current.tableCell.tableNode);
  if (!table || table.partial) return null;
  const cells = [...table.cells].sort((a, b) => a.row - b.row || a.column - b.column);
  const index = cells.findIndex(cell => cell.listNode === current.tableCell.listNode);
  if (index < 0) return null;
  const step = backward ? -1 : 1;
  for (let next = index + step; next >= 0 && next < cells.length; next += step) {
    const paragraphs = backward ? [...cells[next].paragraphs].reverse() : cells[next].paragraphs;
    for (const ordinal of paragraphs) {
      const p = content.paragraphs.find(p => p.section === point.section && p.paragraph === ordinal);
      if (!p || p.clipped || !selectableText(p)) continue;
      const target = { section: p.section, paragraph: p.paragraph, unit: 0, affinity: "forward" };
      if (caretGeometry(layout, target)) return target;
    }
  }
  return null;
}
