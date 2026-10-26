import { horizontalGlyphWidth, paintHorizontalGlyph } from './glyph-horizontal-scale.mjs';

// The exact same source-width calibration is used for measurement and paint.
// Vertical metrics remain those of the actual Canvas font, not an outline claim.
export function canvasGlyphGeometry(ctx, fontAt, paragraph, unit, kind, text, measureText) {
  const projection = fontAt.displayGlyph?.(paragraph, unit, kind, text) ?? null;
  const glyphText = projection?.text ?? text;
  const metrics = measureText ? measureText(glyphText) : ctx.measureText(glyphText),
    scale = fontAt.horizontalScale(paragraph, unit, kind);
  const measured = projection?.width ?? fontAt.measuredWidth?.(paragraph, unit, kind, text) ?? null;
  if (measured !== null && (!Number.isFinite(measured) || measured <= 0))
    throw new RangeError('InvalidMeasuredFontWidth');
  const candidate = measured !== null && metrics.width > 0 ? measured / metrics.width : 1;
  const calibrated =
    measured !== null &&
    metrics.width > 0 &&
    Number.isFinite(candidate) &&
    candidate >= 0.125 &&
    candidate <= 8;
  const calibration = calibrated ? candidate : 1;
  return {
    ...(projection ? { paintText: projection.text } : {}),
    metrics,
    horizontalScale: scale,
    calibration,
    measured: calibrated,
    width: horizontalGlyphWidth(calibrated ? measured : metrics.width, scale),
  };
}

export function paintCanvasGlyph(ctx, geometry, x, y, paint) {
  if (
    !Number.isFinite(geometry.calibration) ||
    geometry.calibration < 0.125 ||
    geometry.calibration > 8
  )
    throw new RangeError('InvalidMeasuredFontWidth');
  return paintHorizontalGlyph(ctx, geometry.horizontalScale, x, y, (px, py) => {
    if (geometry.calibration === 1) return paint(px, py, geometry.paintText);
    ctx.save();
    try {
      ctx.translate(px, py);
      ctx.scale(geometry.calibration, 1);
      return paint(0, 0, geometry.paintText);
    } finally {
      ctx.restore();
    }
  });
}
