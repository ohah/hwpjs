import { hwpUnitPixels } from "./hwp-units.mjs";
import { paintDecoratedLine } from "./decorated-line-paint.mjs";
import { strokeDashPattern } from "./stroke-dash-pattern.mjs";

/** Endpoints already carry renderingInfo; never apply display size scaling twice. */
export function linePaintPoints(line, origin, scrollTop = 0) {
  const { color, width, style } = line.stroke ?? {};
  if (!strokeDashPattern(style) || !Number.isInteger(color) || color < 0 || color > 0xffffff || !Number.isInteger(width) || width <= 0 || width > 0xffffffff) return null;
  if (!Array.isArray(line.endpoints) || line.endpoints.length !== 2 || line.endpoints.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) return null;
  if (![origin?.x, origin?.y, scrollTop].every(Number.isFinite)) return null;
  const points = line.endpoints.map(([x, y]) => [origin.x + hwpUnitPixels(x), origin.y + hwpUnitPixels(y) - scrollTop]);
  return points.flat().every(Number.isFinite) ? points : null;
}

export function paintLine(ctx, line, origin, scrollTop = 0) {
  if (line.state === "reference_located" && line.referencePlan) return paintDecoratedLine(ctx, line.referencePlan, origin, scrollTop);
  const points = linePaintPoints(line, origin, scrollTop);
  if (!points) return false;
  const { color, width } = line.stroke;
  ctx.save();
  try {
    ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.lineWidth = hwpUnitPixels(width);
    ctx.lineCap = "butt";
    ctx.lineDashOffset = 0;
    ctx.setLineDash(strokeDashPattern(line.stroke.style));
    ctx.beginPath(); ctx.moveTo(...points[0]); ctx.lineTo(...points[1]); ctx.stroke();
  } finally { ctx.restore(); }
  return true;
}
