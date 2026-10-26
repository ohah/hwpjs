import { compoundLineWeights, compoundLineGap } from "./compound-line-weights.mjs";
/** Approximate Canvas decoration on current glyph geometry, not page shaping. */
export function paintUnderline(ctx, style, x, width, y, metrics, height, origin = x) {
  if (!style || !Number.isFinite(width) || width <= 0) return;
  const ascent = Number.isFinite(metrics?.fontBoundingBoxAscent)
    ? metrics.fontBoundingBoxAscent
    : 0;
  const descent = Number.isFinite(metrics?.fontBoundingBoxDescent)
    ? metrics.fontBoundingBoxDescent
    : height * 0.8;
  const at =
    style.kind === "top"
      ? y - ascent - 1
      : style.kind === "center"
        ? y + (descent - ascent) / 2
        : y + descent + 1;
  const strokes = compoundLineWeights(style.shape) ?? [1];
  const dash =
    {
      DASH: [5, 3],
      DOT: [1, 2],
      DASH_DOT: [5, 2, 1, 2],
      DASH_DOT_DOT: [5, 2, 1, 2, 1, 2],
      LONG_DASH: [9, 3],
      CIRCLE: [1, 3],
    }[style.shape] ?? [];
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.setLineDash(dash);
  ctx.lineDashOffset = -(x - origin);
  ctx.lineCap = style.shape === "CIRCLE" ? "round" : "butt";
  let offset = 0;
  for (const thickness of strokes) {
    ctx.lineWidth = thickness;
    ctx.beginPath();
    const wave = style.shape === "WAVE" || style.shape === "DOUBLEWAVE";
    const waveY = (position) =>
      at + offset + (wave ? Math.sin(((position - origin) * Math.PI) / 3) : 0);
    ctx.moveTo(x, waveY(x));
    if (wave)
      for (let position = x + 0.5; position < x + width; position += 0.5)
        ctx.lineTo(position, waveY(position));
    ctx.lineTo(x + width, waveY(x + width));
    ctx.stroke();
    offset += thickness + compoundLineGap;
  }
  ctx.restore();
}
