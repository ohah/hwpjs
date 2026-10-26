import { curvedShapePaintPlan } from "./curved-shape-paint-plan.mjs";
import { ellipsePrincipalAxes } from "./ellipse-principal-axes.mjs";

export function ellipsePaintPlan(content, item) {
  return curvedShapePaintPlan(content, item, "Ellipse");
}

export function ellipsePaintGeometry(item) {
  const u = item?.u,
    v = item?.v,
    center = item?.center;
  if (![u, v, center].every((a) => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite)))
    return null;
  const rx = Math.hypot(...u),
    ry = Math.hypot(...v),
    dot = u[0] * v[0] + u[1] * v[1];
  if (![rx, ry, dot, rx * ry].every(Number.isFinite) || rx <= 0 || ry <= 0) return null;
  if (Math.abs(dot) > 4 * Number.EPSILON * rx * ry) {
    const axes = ellipsePrincipalAxes(u, v);
    return axes ? { center, ...axes } : null;
  }
  return { center, rx, ry, rotation: Math.atan2(u[1], u[0]) };
}
export function paintEllipse(ctx, item, scrollTop = 0) {
  const p = item?.paintPlan,
    geometry = ellipsePaintGeometry(item);
  if (
    p?.state !== "planned" ||
    !geometry ||
    !Number.isFinite(scrollTop) ||
    (p.strokeEnabled !== false && (!Number.isFinite(p.lineWidth) || p.lineWidth <= 0))
  )
    return false;
  const { center, rx, ry, rotation } = geometry;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.ellipse(center[0], center[1] - scrollTop, rx, ry, rotation, 0, Math.PI * 2);
    if (p.fill.state === "solid") {
      ctx.fillStyle = p.fill.color;
      ctx.fill();
    }
    if (p.strokeEnabled !== false) {
      ctx.strokeStyle = p.strokeColor;
      ctx.lineWidth = p.lineWidth;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.setLineDash(p.dash);
      ctx.lineDashOffset = 0;
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
  return true;
}
