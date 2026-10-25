/** Midpoint shaping and discrete levels; raster boundary parity is unverified. */
export function gradientStepPosition(position, steps, centerPercent) {
  if (!Number.isFinite(position) || position < 0 || position > 1 || !Number.isInteger(steps) || steps < 0 || steps > 255 || !Number.isInteger(centerPercent) || centerPercent < 0 || centerPercent > 100) throw new Error("InvalidGradientStepPosition");
  if (steps === 0) return null;
  if (steps === 1) throw new Error("UnsupportedSingleGradientStep");
  const center = centerPercent / 100;
  const shaped = position === 0 ? 0 : position === 1 ? 1 : position <= center ? position / center / 2 : 0.5 + (position - center) / (1 - center) / 2;
  return Math.round(shaped * (steps - 1)) / (steps - 1);
}
