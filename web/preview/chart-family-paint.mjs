import { finitePoint } from './chart-family-geometry.mjs';
const kinds = new Set([
  'areaChart',
  'area3DChart',
  'line3DChart',
  'doughnutChart',
  'radarChart',
  'bubbleChart',
  'surfaceChart',
  'surface3DChart',
]);
const colorIndex = (i) => i === undefined || (Number.isInteger(i) && i >= 0 && i <= 16384);
const unitPoint = (p) => finitePoint(p) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
export function validChartFamily(g) {
  return (
    !!g &&
    kinds.has(g.kind) &&
    (g.disclosure === undefined ||
      (typeof g.disclosure === 'string' && g.disclosure.length <= 120)) &&
    ['polygons', 'strokes', 'circles', 'sectors'].every(
      (k) => Array.isArray(g[k]) && g[k].length <= 65536,
    ) &&
    g.polygons.every(
      (p) =>
        colorIndex(p.color_index) &&
        Array.isArray(p.points) &&
        p.points.length >= 3 &&
        p.points.length <= 12 &&
        p.points.every(unitPoint),
    ) &&
    g.strokes.every(
      (s) => Array.isArray(s.points) && s.points.length === 2 && s.points.every(unitPoint),
    ) &&
    g.circles.every(
      (c) =>
        finitePoint(c) &&
        Number.isFinite(c.radius) &&
        c.radius >= 0 &&
        c.radius <= 0.27 &&
        typeof c.sphere === 'boolean',
    ) &&
    g.sectors.every(
      (s) =>
        colorIndex(s.color_index) &&
        s.color_index !== undefined &&
        unitPoint(s) &&
        [s.inner_radius, s.outer_radius, s.start_angle, s.end_angle].every(Number.isFinite) &&
        s.inner_radius > 0 &&
        s.inner_radius < s.outer_radius &&
        s.outer_radius <= 0.5 &&
        s.end_angle >= s.start_angle &&
        s.end_angle - s.start_angle <= 2 * Math.PI + 1e-12,
    )
  );
}
/** Plot clipping and isotropic circles/rings; sphere highlights are a preview approximation. */
export function paintChartFamily(ctx, g, plot, x, y, color, indexColor) {
  if (
    !validChartFamily(g) ||
    ![plot.width, plot.height, x, y].every(Number.isFinite) ||
    plot.width <= 0 ||
    plot.height <= 0
  )
    return false;
  const scale = Math.min(plot.width, plot.height),
    px = (p) => x + p.x * plot.width,
    py = (p) => y + p.y * plot.height;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, plot.width, plot.height);
    ctx.clip();
    ctx.lineWidth = 1.5;
    for (const polygon of g.polygons) {
      ctx.fillStyle =
        polygon.color_index === undefined
          ? color(polygon.series_node)
          : indexColor(polygon.color_index);
      ctx.beginPath();
      polygon.points.forEach((p, i) => (i ? ctx.lineTo(px(p), py(p)) : ctx.moveTo(px(p), py(p))));
      ctx.closePath();
      ctx.fill();
    }
    for (const stroke of g.strokes) {
      ctx.strokeStyle = color(stroke.series_node);
      ctx.beginPath();
      ctx.moveTo(px(stroke.points[0]), py(stroke.points[0]));
      ctx.lineTo(px(stroke.points[1]), py(stroke.points[1]));
      ctx.stroke();
    }
    for (const c of g.circles) {
      if (c.x < -0.27 || c.x > 1.27 || c.y < -0.27 || c.y > 1.27) continue;
      const r = c.radius * scale,
        cx = px(c),
        cy = py(c);
      if (
        cx + r < x ||
        cx - r > x + plot.width ||
        cy + r < y ||
        cy - r > y + plot.height ||
        r === 0
      )
        continue;
      ctx.fillStyle = color(c.series_node);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      if (c.size < 0) ctx.stroke();
      else ctx.fill();
      if (c.sphere && c.size >= 0) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.22, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    for (const s of g.sectors) {
      ctx.fillStyle = indexColor(s.color_index);
      ctx.beginPath();
      ctx.arc(px(s), py(s), s.outer_radius * scale, s.start_angle, s.end_angle);
      ctx.arc(px(s), py(s), s.inner_radius * scale, s.end_angle, s.start_angle, true);
      ctx.closePath();
      ctx.fill();
    }
    if (g.disclosure) {
      ctx.fillStyle = '#334155';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(g.disclosure, x + 4, y + 4, Math.max(1, plot.width - 8));
    }
    return true;
  } finally {
    ctx.restore();
  }
}
