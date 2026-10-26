import { arrowHeadGeometry } from "./arrow-head-geometry.mjs";
export function paintArrowHead(ctx, options) {
  const { color, strokeWidth, fill } = options;
  if (
    !Number.isInteger(color) ||
    color < 0 ||
    color > 0xffffff ||
    !Number.isFinite(strokeWidth) ||
    strokeWidth <= 0 ||
    typeof fill !== "boolean"
  )
    return false;
  const shape = arrowHeadGeometry(options);
  if (!shape) return false;
  ctx.save();
  try {
    const css = `#${color.toString(16).padStart(6, "0")}`;
    ctx.strokeStyle = css;
    ctx.fillStyle = css;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.miterLimit = 10;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(...shape.points[0]);
    for (const point of shape.points.slice(1)) ctx.lineTo(...point);
    if (shape.closed) ctx.closePath();
    if (shape.closed && fill) ctx.fill();
    else ctx.stroke();
  } finally {
    ctx.restore();
  }
  return true;
}
