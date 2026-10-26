import { curvedShapePaintPlan } from './curved-shape-paint-plan.mjs';
import { mapCurveCommands } from './curve-command-geometry.mjs';
export function curvePaintPlan(content, item) {
  return curvedShapePaintPlan(content, item, 'Curve');
}

export function paintCurve(ctx, item, scrollTop = 0) {
  const p = item?.paintPlan;
  if (
    item?.state !== 'placed' ||
    p?.state !== 'planned' ||
    !Number.isFinite(scrollTop) ||
    !['none', 'solid'].includes(p.fill?.state) ||
    (p.fill.state === 'solid' && !/^#[0-9a-f]{6}$/i.test(p.fill.color ?? '')) ||
    (p.strokeEnabled !== false &&
      (!Number.isFinite(p.lineWidth) ||
        p.lineWidth <= 0 ||
        !/^#[0-9a-f]{6}$/i.test(p.strokeColor ?? '') ||
        !Array.isArray(p.dash) ||
        !p.dash.every((value) => Number.isFinite(value) && value >= 0)))
  )
    return false;
  const commands = mapCurveCommands(item.commands, (point) => [point[0], point[1] - scrollTop]);
  if (!commands) return false;
  ctx.save();
  try {
    ctx.beginPath();
    for (const c of commands) {
      if (c.kind === 'closePath') ctx.closePath();
      else if (c.kind === 'bezierCurveTo')
        ctx.bezierCurveTo(c.cp1x, c.cp1y, c.cp2x, c.cp2y, c.x, c.y);
      else ctx[c.kind](c.x, c.y);
    }
    if (p.fill.state === 'solid') {
      ctx.fillStyle = p.fill.color;
      ctx.fill();
    }
    if (p.strokeEnabled !== false) {
      ctx.strokeStyle = p.strokeColor;
      ctx.lineWidth = p.lineWidth;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 10;
      ctx.setLineDash(p.dash);
      ctx.lineDashOffset = 0;
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
  return true;
}
