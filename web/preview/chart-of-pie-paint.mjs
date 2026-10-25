import { validChartCircularGroup, paintChartCircularGroup } from "./chart-pie-paint.mjs";

export function validChartOfPie(value) {
  return value && ["pie", "bar"].includes(value.plot_type) && Array.isArray(value.groups) &&
    value.groups.length === (value.plot_type === "pie" ? 2 : 1) &&
    value.groups.every(group => validChartCircularGroup(group, group.origin_angle)) &&
    Array.isArray(value.bars) && (value.plot_type !== "pie" || value.bars.length === 0) &&
    value.bars.every(({ rectangle: r, color_index: color }) => r && Number.isInteger(color) && color >= 0 &&
      [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.x >= 0 && r.y >= 0 && r.width >= 0 && r.height >= 0 && r.x + r.width <= 1 && r.y + r.height <= 1);
}

export function paintChartOfPie(ctx, value, plot, x, y, color) {
  if (!validChartOfPie(value) || ![x, y, plot?.width, plot?.height].every(Number.isFinite) || plot.width <= 0 || plot.height <= 0) return false;
  const size = Math.min(plot.width, plot.height);
  ctx.save();
  try {
    ctx.beginPath(); ctx.rect(x, y, plot.width, plot.height); ctx.clip();
    for (const group of value.groups) if (!paintChartCircularGroup(ctx, group, group.origin_angle, plot, x, y, color)) return false;
    for (const bar of value.bars) {
      const r = bar.rectangle; ctx.fillStyle = color(bar.color_index);
      ctx.fillRect(x + plot.width / 2 + (r.x - 0.5) * size, y + plot.height / 2 + (r.y - 0.5) * size, r.width * size, r.height * size);
    }
    return true;
  } finally { ctx.restore(); }
}
