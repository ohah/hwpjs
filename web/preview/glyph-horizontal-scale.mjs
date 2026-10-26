/** Glyph-only transform. Row advances and decorations use the measured width. */
export function horizontalGlyphWidth(width, scale) {
  const result = width * scale;
  if (
    !Number.isFinite(width) ||
    width < 0 ||
    !Number.isFinite(scale) ||
    scale < 0.5 ||
    scale > 2 ||
    !Number.isFinite(result)
  )
    throw new RangeError('InvalidHorizontalGlyphMeasurement');
  return result;
}
export function paintHorizontalGlyph(ctx, scale, x, y, paint) {
  horizontalGlyphWidth(0, scale);
  if (scale === 1) return paint(x, y);
  ctx.save();
  try {
    ctx.translate(x, y);
    ctx.scale(scale, 1);
    return paint(0, 0);
  } finally {
    ctx.restore();
  }
}
