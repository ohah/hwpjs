import { rowAtPoint, rowLocalPoint, rowLeft, rowTop, rowHeight, rowTextHeight, rowTextTop } from "./row-geometry.mjs";
import { rowPageClipContains } from "./row-page-clip.mjs";
import { affinePoint, affineBox, inverseAffine } from "./affine-point-geometry.mjs";
import { tableBoundaryCaret } from "./table-boundary-geometry.mjs";
export { TEXT_TOP } from "./row-geometry.mjs";
export { TEXT_LEFT } from "./row-geometry.mjs";
export const sameParagraph = (a, b) => a && b && a.section === b.section && a.paragraph === b.paragraph;
export const selectableText = row => Boolean(row?.editable || row?.selectable);
export const paragraphTarget = point => ({ section: point.section, paragraph: point.paragraph, ...(point.pageArea ? { pageArea: point.pageArea, pageOrdinal: point.pageOrdinal } : {}) });
const sameInstance = (row, point) => !point?.pageArea || row.pageArea === point.pageArea && row.pageOrdinal === point.pageOrdinal;

/** Shared selection/instance policy for glyph backgrounds. */
export function selectionIntersectsText(row, start, end, anchor, focus, ranges = null) {
  if (!selectableText(row) || !sameInstance(row, anchor) || row.transform !== undefined && !inverseAffine(row.transform)) return false;
  if (ranges) return ranges.some(range => sameParagraph(row, range) && range.startUnit < end && range.endUnit > start);
  return Boolean(sameParagraph(row, anchor) && sameParagraph(anchor, focus) && Math.min(anchor.unit, focus.unit) < end && Math.max(anchor.unit, focus.unit) > start);
}

/** Coordinates are CSS pixels in the scroll document, not device pixels. */
export function hitText(layout, x, y, target = null) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  let index = rowAtPoint(layout, x, y), row = layout.rows[index];
  if (target) {
    const candidates = layout.rows.flatMap((r, i) => selectableText(r) && sameParagraph(r, target) && sameInstance(r, target) && rowPageClipContains(r, x, y) && rowLocalPoint(r, x, y) ? [i] : []);
    if (!candidates.length) return null;
    const distance = i => {
      const localY = rowLocalPoint(layout.rows[i], x, y)[1];
      return Math.max(rowTop(layout.rows[i], i) - localY, localY - (rowTop(layout.rows[i], i) + rowHeight(layout.rows[i])), 0);
    };
    const horizontalDistance = i => {
      const localX = rowLocalPoint(layout.rows[i], x, y)[0];
      return Math.max(rowLeft(layout.rows[i]) - localX, localX - (rowLeft(layout.rows[i]) + layout.rows[i].width), 0);
    };
    index = candidates.reduce((a, b) => distance(b) < distance(a) || distance(b) === distance(a) && horizontalDistance(b) < horizontalDistance(a) ? b : a, candidates[0]); row = layout.rows[index];
  }
  if (!selectableText(row) || (!target && !layout.spatialRows && x < rowLeft(row))) return null;
  const local = rowLocalPoint(row, x, y);
  if (!local) return null;
  const boundary = row.boundaries.reduce((a, b) => Math.abs(b.x - (local[0] - rowLeft(row))) < Math.abs(a.x - (local[0] - rowLeft(row))) ? b : a);
  return { section: row.section, paragraph: row.paragraph, unit: boundary.unit, affinity: row.startUnit !== row.endUnit && boundary.unit === row.endUnit ? "backward" : "forward", ...(row.pageArea ? { pageArea: row.pageArea, pageOrdinal: row.pageOrdinal } : {}) };
}

export function caretGeometry(layout, point) {
  if (!point) return null;
  if (point.tableNode !== undefined) return tableBoundaryCaret(layout, point);
  const candidates = layout.rows.flatMap((row, index) => selectableText(row) && sameParagraph(row, point) && sameInstance(row, point) && row.startUnit <= point.unit && point.unit <= row.endUnit ? [{ row, index }] : []);
  const item = point.affinity === "backward" ? candidates[0] : candidates.at(-1);
  if (!item) return tableBoundaryCaret(layout, point);
  const boundary = item.row.boundaries.find(b => b.unit === point.unit);
  if (!boundary) return null;
  const local = { x: rowLeft(item.row) + boundary.x, y: rowTop(item.row, item.index) + rowTextTop(item.row), row: item.index, height: rowTextHeight(item.row),
    ...(item.row.pageClip === undefined ? {} : { pageClip: item.row.pageClip }) };
  if (item.row.transform === undefined) return local;
  if (!inverseAffine(item.row.transform)) return null;
  const screen = affinePoint(item.row.transform, [local.x, local.y]);
  const screenBounds = affineBox(item.row.transform, { ...local, width: 2 });
  if (!screen || !screenBounds) return null;
  return { ...local, x: screen[0], y: screen[1], screenBounds, paintGeometry: { ...local, transform: item.row.transform } };
}

export function selectionRects(layout, anchor, focus, ranges = null) {
  if (ranges) return ranges.flatMap(range => selectionRects(layout, { ...anchor, section: range.section, paragraph: range.paragraph, unit: range.startUnit }, { ...focus, section: range.section, paragraph: range.paragraph, unit: range.endUnit }));
  if (!sameParagraph(anchor, focus)) return [];
  const start = Math.min(anchor.unit, focus.unit), end = Math.max(anchor.unit, focus.unit);
  return layout.rows.flatMap((row, index) => {
    if (!selectionIntersectsText(row, row.startUnit, row.endUnit, anchor, focus)) return [];
    const left = row.boundaries.find(b => b.unit >= Math.max(start, row.startUnit));
    const right = row.boundaries.find(b => b.unit >= Math.min(end, row.endUnit));
    return left && right ? [{ x: rowLeft(row) + left.x, y: rowTop(row, index) + rowTextTop(row), width: right.x - left.x, height: rowTextHeight(row),
      ...(row.pageClip === undefined ? {} : { pageClip: row.pageClip }), ...(row.transform === undefined ? {} : { transform: row.transform }) }] : [];
  });
}
