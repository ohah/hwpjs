import { createDrawingObservationQuery } from './drawing-observation.mjs';
import { currentHwp5ChartTarget, sameHwp5ChartOwner } from './hwp5-chart-resources.mjs';
const same = (a, b) =>
  !!a &&
  !!b &&
  a.kind === b.kind &&
  a.section === b.section &&
  (a.kind === 'chart'
    ? a.wrapper === b.wrapper
    : a.kind === 'hwp5-chart'
      ? a.controlNode === b.controlNode
      : a.kind === 'drawing' && a.drawingNode === b.drawingNode);
const rectangle = (r) =>
  r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
/** Decoration only. Inputs are successful paints from this frame, never preview geometry or edit authority. */
export function objectSelectionRectangle(target, content, charts, drawings) {
  if (!target || !['chart', 'hwp5-chart', 'drawing'].includes(target.kind)) return null;
  let owner;
  if (target.kind === 'drawing') {
    const observed = createDrawingObservationQuery(content).get(target.section, target.drawingNode);
    if (!observed?.activationSafe) return null;
    owner = observed.row;
  } else if (target.kind === 'hwp5-chart') {
    owner = currentHwp5ChartTarget(content, target);
    if (!owner) return null;
  } else {
    const owners = (content.chartTargets ?? []).filter(
      (row) => row.section === target.section && row.wrapper === target.wrapper,
    );
    if (owners.length !== 1) return null;
    owner = owners[0];
  }
  if (owner.error || owner.sourceError || owner.error_name) return null;
  const candidates =
    target.kind === 'hwp5-chart'
      ? (charts ?? []).filter(
          (i) =>
            !i.provisional &&
            i.target?.kind === 'hwp5-chart' &&
            i.target.section === target.section &&
            i.target.controlNode === target.controlNode &&
            sameHwp5ChartOwner(i.target.owner, owner.owner),
        )
      : target.kind === 'chart'
        ? (charts ?? []).filter(
            (i) =>
              !i.provisional &&
              i.target?.section === target.section &&
              i.target?.wrapper === target.wrapper,
          )
        : (drawings ?? []).filter((i) => i.source === owner.source).map((i) => i.rectangle);
  const unique = new Map();
  for (const r of candidates)
    if (rectangle(r)) unique.set(JSON.stringify([r.x, r.y, r.width, r.height]), r);
  return unique.size === 1 ? unique.values().next().value : null;
}
export function sameObjectSelection(a, b) {
  return same(a, b);
}
export function paintObjectSelection(ctx, rectangle, scrollTop) {
  if (!rectangle || !Number.isFinite(scrollTop)) return false;
  ctx.save();
  try {
    ctx.strokeStyle = '#145b96';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(rectangle.x, rectangle.y - scrollTop, rectangle.width, rectangle.height);
  } finally {
    ctx.restore();
  }
  return true;
}
