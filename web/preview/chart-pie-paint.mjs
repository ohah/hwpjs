export function validChartPie(pie) {
  return pie && Number.isInteger(pie.first_slice_angle) && pie.first_slice_angle >= 0 && pie.first_slice_angle <= 360 &&
    validChartCircularGroup(pie, pie.first_slice_angle * Math.PI / 180 - Math.PI / 2) && pie.slices.length > 0;
}

export function validChartCircularGroup(pie, origin) {
  if (!pie || !Number.isFinite(origin) || !Array.isArray(pie.slices)) return false;
  for (const slice of pie.slices) {
    if (!slice || !(
    [slice.center_x, slice.center_y, slice.radius, slice.start_angle, slice.end_angle, slice.start_fraction, slice.end_fraction].every(Number.isFinite) &&
    slice.radius > 0 && slice.radius <= 0.5 && slice.center_x >= slice.radius && slice.center_x <= 1 - slice.radius &&
    slice.center_y >= slice.radius && slice.center_y <= 1 - slice.radius && slice.start_fraction >= 0 && slice.end_fraction <= 1 && slice.end_fraction >= slice.start_fraction &&
    slice.start_angle === origin + slice.start_fraction * 2 * Math.PI &&
    slice.end_angle === origin + slice.end_fraction * 2 * Math.PI &&
    Number.isInteger(slice.color_index) && slice.color_index >= 0)) return false;
  }
  return true;
}

/** The fit square preserves circles inside non-square host rectangles. */
export function paintChartPie(ctx, pie, plot, x, y, color) {
  if (!validChartPie(pie)) return false;
  return paintChartCircularGroup(ctx, pie, pie.first_slice_angle * Math.PI / 180 - Math.PI / 2, plot, x, y, color);
}

export function paintChartCircularGroup(ctx, pie, origin, plot, x, y, color) {
  if (!validChartCircularGroup(pie, origin) || ![x, y, plot?.width, plot?.height].every(Number.isFinite) || plot.width <= 0 || plot.height <= 0) return false;
  const size = Math.min(plot.width, plot.height);
  ctx.save();
  try {
    ctx.beginPath(); ctx.rect(x, y, plot.width, plot.height); ctx.clip();
    for (const slice of pie.slices) {
      if (slice.end_angle === slice.start_angle) continue;
      const cx = x + plot.width / 2 + (slice.center_x - 0.5) * size;
      const cy = y + plot.height / 2 + (slice.center_y - 0.5) * size;
      ctx.fillStyle = color(slice.color_index);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, slice.radius * size, slice.start_angle, slice.end_angle); ctx.closePath(); ctx.fill();
    }
    return true;
  } finally { ctx.restore(); }
}
