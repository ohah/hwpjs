import { LINE_HEIGHT } from "./layout.mjs";
export const TEXT_LEFT = 20;
export const TEXT_TOP = 8;
export const sameParagraph = (a, b) => a && b && a.section === b.section && a.paragraph === b.paragraph;

/** Coordinates are CSS pixels in the scroll document, not device pixels. */
export function hitText(layout, x, y, target = null) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  let index = Math.floor(y / LINE_HEIGHT), row = layout.rows[index];
  if (target) {
    const candidates = layout.rows.flatMap((r, i) => r.editable && sameParagraph(r, target) ? [i] : []);
    if (!candidates.length) return null;
    index = candidates.reduce((a, b) => Math.abs(b - index) < Math.abs(a - index) ? b : a, candidates[0]); row = layout.rows[index];
  }
  if (!row?.editable || (!target && x < TEXT_LEFT)) return null;
  const boundary = row.boundaries.reduce((a, b) => Math.abs(b.x - (x - TEXT_LEFT)) < Math.abs(a.x - (x - TEXT_LEFT)) ? b : a);
  return { section: row.section, paragraph: row.paragraph, unit: boundary.unit, affinity: boundary.unit === row.endUnit ? "backward" : "forward" };
}

export function caretGeometry(layout, point) {
  if (!point) return null;
  const candidates = layout.rows.flatMap((row, index) => row.editable && sameParagraph(row, point) && row.startUnit <= point.unit && point.unit <= row.endUnit ? [{ row, index }] : []);
  const item = point.affinity === "backward" ? candidates[0] : candidates.at(-1);
  if (!item) return null;
  const boundary = item.row.boundaries.find(b => b.unit === point.unit);
  return boundary ? { x: TEXT_LEFT + boundary.x, y: item.index * LINE_HEIGHT + TEXT_TOP, row: item.index } : null;
}

export function selectionRects(layout, anchor, focus) {
  if (!sameParagraph(anchor, focus)) return [];
  const start = Math.min(anchor.unit, focus.unit), end = Math.max(anchor.unit, focus.unit);
  return layout.rows.flatMap((row, index) => {
    if (!row.editable || !sameParagraph(row, anchor) || start === end || end <= row.startUnit || start >= row.endUnit) return [];
    const left = row.boundaries.find(b => b.unit >= Math.max(start, row.startUnit));
    const right = row.boundaries.find(b => b.unit >= Math.min(end, row.endUnit));
    return left && right ? [{ x: TEXT_LEFT + left.x, y: index * LINE_HEIGHT + TEXT_TOP, width: right.x - left.x, height: 20 }] : [];
  });
}
