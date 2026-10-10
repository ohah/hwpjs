/** Discrete sRGB interpolation; original raster rounding remains unverified. */
export function gradientStepStops(colors, steps, centerPercent) {
  if (!Array.isArray(colors) || colors.length < 2 || colors.length > 256 || !colors.every(c => /^#[0-9a-f]{6}$/i.test(c)) || !Number.isInteger(steps) || steps < 0 || steps > 255 || !Number.isInteger(centerPercent) || centerPercent < 0 || centerPercent > 100) throw new Error("InvalidGradientStepStops");
  if (steps === 0) return [];
  if (steps === 1) throw new Error("UnsupportedSingleGradientStep");
  const rgb = colors.map(c => [1, 3, 5].map(i => Number.parseInt(c.slice(i, i + 2), 16)));
  const colorAt = position => {
    const coordinate = position * (rgb.length - 1), index = Math.min(Math.floor(coordinate), rgb.length - 2), fraction = coordinate - index;
    return "#" + rgb[index].map((channel, axis) => Math.round(channel + (rgb[index + 1][axis] - channel) * fraction).toString(16).padStart(2, "0")).join("");
  };
  const center = centerPercent / 100;
  const inverse = t => t <= 0.5 ? t * 2 * center : center + (t - 0.5) * 2 * (1 - center);
  const stops = [{ offset: 0, color: colorAt(0) }];
  for (let i = 0; i < steps - 1; i++) {
    const offset = inverse((i + 0.5) / (steps - 1));
    stops.push({ offset, color: colorAt(i / (steps - 1)) }, { offset, color: colorAt((i + 1) / (steps - 1)) });
  }
  stops.push({ offset: 1, color: colorAt(1) });
  return stops;
}
