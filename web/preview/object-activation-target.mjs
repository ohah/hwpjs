import { createDrawingObservationQuery } from './drawing-observation.mjs';
import { currentHwp5ChartTarget, sameHwp5ChartOwner } from './hwp5-chart-resources.mjs';
import { rowAtPoint } from './row-geometry.mjs';
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
const contains = (r, x, y) =>
  r &&
  [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
  r.width > 0 &&
  r.height > 0 &&
  x >= r.x &&
  y >= r.y &&
  x < r.x + r.width &&
  y < r.y + r.height;

/** Actual painted object frames only; this query grants no mutation authority. */
export function objectActivationTarget(
  { content, layout, charts, picture, outlines, borderTolerance = 5, behindTextOnly = false },
  x,
  y,
) {
  if (![x, y].every(Number.isFinite)) return null;
  const explicitBehind = behindTextOnly === true;
  if (explicitBehind && content?.format !== 'hwpx') return null;
  const hits = new Map();
  const add = (target) => {
    if (!uint(target.section)) return;
    const node =
      target.kind === 'chart'
        ? target.wrapper
        : target.kind === 'hwp5-chart'
          ? target.controlNode
          : target.kind === 'picture'
            ? target.pictureNode
            : target.drawingNode;
    if (uint(node)) hits.set(`${target.kind}:${target.section}:${node}`, Object.freeze(target));
  };
  if (explicitBehind && picture?.picture) return null;
  if (picture?.picture)
    add({
      kind: 'picture',
      section: picture.picture.section,
      pictureNode: picture.picture.pictureNode,
    });
  // Match direct input's existing picture selection, including pictures inside text boxes.
  if (hits.size === 1) return hits.values().next().value;
  for (const item of charts ?? []) {
    if (!contains(item, x, y)) continue;
    if (item.target?.kind === 'hwp5-chart') {
      const row = currentHwp5ChartTarget(content, item.target);
      if (!item.provisional && row && sameHwp5ChartOwner(row.owner, item.target.owner))
        add({ kind: 'hwp5-chart', section: row.section, controlNode: row.controlNode });
    } else add({ kind: 'chart', section: item.target.section, wrapper: item.target.wrapper });
  }
  if (hits.size) return !explicitBehind && hits.size === 1 ? hits.values().next().value : null;
  const query = createDrawingObservationQuery(content);
  const behindOwners = new Set(
    (layout.placedDrawings ?? [])
      .filter((p) => p.behindTextbox === true)
      .map((p) => `${p.section}:${p.drawingNode}`),
  );
  let hitRow,
    hitRowReady = false,
    foregroundBorder = false;
  const border = (rectangle) =>
    contains(rectangle, x, y) &&
    Number.isFinite(borderTolerance) &&
    borderTolerance > 0 &&
    Math.min(
      x - rectangle.x,
      y - rectangle.y,
      rectangle.x + rectangle.width - x,
      rectangle.y + rectangle.height - y,
    ) <= borderTolerance;
  const drawing = (item, rectangle) => {
    const observed = query.get(item.section, item.drawingNode);
    const owner = observed?.row;
    if (
      !owner ||
      owner.hostParagraph !== item.hostParagraph ||
      owner.anchorUnit !== item.anchorUnit ||
      !observed.activationSafe ||
      !border(rectangle)
    )
      return;
    if (explicitBehind && !behindOwners.has(`${item.section}:${item.drawingNode}`)) {
      foregroundBorder = true;
      return;
    }
    if (!explicitBehind && behindOwners.has(`${item.section}:${item.drawingNode}`)) {
      if (!hitRowReady) {
        hitRow = layout.rows[rowAtPoint(layout, x, y)];
        hitRowReady = true;
      }
      if (
        hitRow &&
        hitRow.drawingPaintLayer !== 'behind' &&
        (hitRow.section !== item.section || hitRow.drawingNode !== item.drawingNode)
      )
        return;
    }
    add({ kind: 'drawing', section: owner.section, drawingNode: owner.drawingNode });
  };
  for (const item of layout.placedDrawings ?? []) drawing(item, item.rectangle);
  for (const item of [...(outlines?.front ?? []), ...(outlines?.behind ?? [])])
    drawing(item.drawing, item.origin);
  // An overlapping different object is ambiguous; do not open a different owner's dialog.
  return !foregroundBorder && hits.size === 1 ? hits.values().next().value : null;
}
