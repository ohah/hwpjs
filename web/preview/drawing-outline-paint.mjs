import { hwpUnitPixels } from "./hwp-units.mjs";
const patterns = Object.freeze([null, [], [2, 2], [6, 3], [6, 3, 2, 3], [6, 3, 2, 3, 2, 3]]);

// 꼭짓점에는 renderingInfo가 이미 적용되어 있습니다. 배율을 다시 적용하지 않습니다.
export function drawingOutlinePoints(source, origin, scrollTop = 0) {
  const { color, width, style } = source?.stroke ?? {};
  if (!Number.isInteger(style) || !patterns[style] || !Number.isInteger(color) || color < 0 || color > 0xffffff || !Number.isInteger(width) || width <= 0 || width > 0xffffffff) return null;
  const corners = source.rendering_corners;
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) || ![origin?.x, origin?.y, scrollTop].every(Number.isFinite)) return null;
  const points = corners.map(([x, y]) => [origin.x + hwpUnitPixels(x), origin.y + hwpUnitPixels(y) - scrollTop]);
  return points.flat().every(Number.isFinite) ? points : null;
}

export function paintDrawingOutline(ctx, source, origin, scrollTop = 0) {
  const points = drawingOutlinePoints(source, origin, scrollTop);
  if (!points) return false;
  ctx.save();
  try {
    ctx.strokeStyle = `#${source.stroke.color.toString(16).padStart(6, "0")}`;
    ctx.lineWidth = hwpUnitPixels(source.stroke.width);
    ctx.lineJoin = "miter"; ctx.lineCap = "butt"; ctx.setLineDash(patterns[source.stroke.style]);
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath(); ctx.stroke();
  } finally { ctx.restore(); }
  return true;
}
