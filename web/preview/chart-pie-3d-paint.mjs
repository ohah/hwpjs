import { validChartPie } from "./chart-pie-paint.mjs";
export function validChartPie3D(value) {
  if (
    !value ||
    !validChartPie(value.pie) ||
    ![value.ratio, value.wall_ratio, value.rotation].every(Number.isFinite) ||
    value.ratio <= 0 ||
    value.ratio > 1 ||
    value.wall_ratio < 0 ||
    value.wall_ratio > 1 ||
    !Array.isArray(value.walls)
  )
    return false;
  if (value.pie.slices.some((slice) => slice.explosion !== 0)) return false;
  for (const wall of value.walls) {
    if (
      !wall ||
      !Number.isInteger(wall.slice_position) ||
      wall.slice_position < 0 ||
      wall.slice_position >= value.pie.slices.length ||
      ![wall.start_angle, wall.end_angle].every(Number.isFinite) ||
      wall.end_angle <= wall.start_angle ||
      wall.end_angle - wall.start_angle > Math.PI
    )
      return false;
    const slice = value.pie.slices[wall.slice_position];
    if (
      wall.start_angle < slice.start_angle + value.rotation ||
      wall.end_angle > slice.end_angle + value.rotation ||
      Math.sin((wall.start_angle + wall.end_angle) / 2) < 0
    )
      return false;
  }
  return true;
}
export function paintChartPie3D(ctx, value, plot, x, y, color) {
  if (
    !validChartPie3D(value) ||
    ![x, y, plot?.width, plot?.height].every(Number.isFinite) ||
    plot.width <= 0 ||
    plot.height <= 0
  )
    return false;
  const size = Math.min(plot.width, plot.height),
    fit = 1 / Math.max(1, value.ratio + value.wall_ratio / 2);
  const rows = value.pie.slices.map((slice) => {
    const radius = slice.radius * size * fit,
      thickness = radius * value.wall_ratio;
    return {
      slice,
      radius,
      thickness,
      cx: x + plot.width / 2 + (slice.center_x - 0.5) * size * fit,
      cy: y + plot.height / 2 + (slice.center_y - 0.5) * size * fit * value.ratio - thickness / 2,
    };
  });
  if (rows.some((row) => ![row.radius, row.thickness, row.cx, row.cy].every(Number.isFinite)))
    return false;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, plot.width, plot.height);
    ctx.clip();
    for (const wall of value.walls) {
      const row = rows[wall.slice_position],
        { cx, cy, radius, thickness } = row,
        ry = radius * value.ratio;
      if (!thickness) continue;
      ctx.fillStyle = color(row.slice.color_index);
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, ry, 0, wall.start_angle, wall.end_angle);
      ctx.lineTo(
        cx + radius * Math.cos(wall.end_angle),
        cy + thickness + ry * Math.sin(wall.end_angle),
      );
      ctx.ellipse(cx, cy + thickness, radius, ry, 0, wall.end_angle, wall.start_angle, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();
    }
    for (const { slice, cx, cy, radius } of rows) {
      if (slice.start_angle === slice.end_angle) continue;
      ctx.fillStyle = color(slice.color_index);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.ellipse(
        cx,
        cy,
        radius,
        radius * value.ratio,
        0,
        slice.start_angle + value.rotation,
        slice.end_angle + value.rotation,
      );
      ctx.closePath();
      ctx.fill();
    }
    return true;
  } finally {
    ctx.restore();
  }
}
