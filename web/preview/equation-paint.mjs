import { configureEquationText, equationFont } from "./equation-font-measure.mjs";

/** Paint only a complete native layout. Coordinates are logical CSS pixels. */
export function paintEquation(ctx, plan, layout, family, x, baseline) {
  const finite = value => Number.isFinite(value) && Math.abs(value) <= 1_000_000;
  const dimension = value => finite(value) && value >= 0;
  const invalid = () => { throw new Error("InvalidEquationPaintPlan"); };
  if (!plan?.ready || !Array.isArray(plan.blockers) || plan.blockers.length || !Array.isArray(plan.requests) || !Array.isArray(layout?.glyphs) || !Array.isArray(layout?.rules) || !finite(x) || !finite(baseline)) invalid();
  if (!dimension(layout.box?.width) || !dimension(layout.box?.ascent) || !dimension(layout.box?.descent) || !dimension(layout.box.ascent + layout.box.descent) || layout.glyphs.length !== plan.requests.length || layout.glyphs.length > 65536 || layout.rules.length > 65536) invalid();
  const seen = new Set();
  const glyphs = layout.glyphs.map(glyph => {
    if (!Number.isInteger(glyph?.request) || glyph.request < 0 || glyph.request >= plan.requests.length || seen.has(glyph.request) || !dimension(glyph.x) || glyph.x > layout.box.width || !finite(glyph.baseline) || !finite(x + glyph.x) || !finite(baseline + glyph.baseline)) invalid();
    seen.add(glyph.request);
    const request = plan.requests[glyph.request];
    if (typeof request?.text !== "string" || !request.text.isWellFormed()) invalid();
    return { ...glyph, text: request.text, font: equationFont(request, family) };
  });
  for (const rule of layout.rules) {
    if (!dimension(rule?.x) || !finite(rule?.y) || !dimension(rule?.width) || !dimension(rule?.thickness) || rule.x + rule.width > layout.box.width || !finite(x + rule.x) || !finite(baseline + rule.y - rule.thickness / 2)) invalid();
  }
  const paths = layout.paths ?? [];
  const curves = layout.curves ?? [];
  const rectangles = layout.rectangles ?? [];
  if (!Array.isArray(rectangles) || rectangles.length > 65536) invalid();
  for (const rect of rectangles) {
    if (!dimension(rect?.x) || !finite(rect?.y) || !dimension(rect?.width) || !dimension(rect?.height) || rect.x + rect.width > layout.box.width || rect.y < -layout.box.ascent || rect.y + rect.height > layout.box.descent || !finite(x + rect.x) || !finite(baseline + rect.y)) invalid();
  }
  if (!Array.isArray(paths) || !Array.isArray(curves) || paths.length + curves.length > 65536) invalid();
  const prepareStroke = (value, count, build) => {
    if (!dimension(value?.thickness) || value.thickness <= 0 || !Array.isArray(value.points) || value.points.length !== count) invalid();
    const half = value.thickness / 2;
    for (const point of value.points) {
      if (!dimension(point?.x) || point.x - half < 0 || point.x + half > layout.box.width || !finite(point?.y) || point.y - half < -layout.box.ascent || point.y + half > layout.box.descent || !finite(x + point.x) || !finite(baseline + point.y)) invalid();
    }
    // Path2D keeps the caller's current Canvas path intact (save does not).
    const path = new Path2D();
    build(path, value.points);
    return { path, thickness: value.thickness };
  };
  const strokes = paths.map(value => prepareStroke(value, 5, (path, points) => points.forEach((point, index) => path[index ? "lineTo" : "moveTo"](x + point.x, baseline + point.y))));
  for (const value of curves) strokes.push(prepareStroke(value, 7, (path, points) => {
    path.moveTo(x + points[0].x, baseline + points[0].y);
    for (const start of [1, 4]) path.bezierCurveTo(x + points[start].x, baseline + points[start].y, x + points[start + 1].x, baseline + points[start + 1].y, x + points[start + 2].x, baseline + points[start + 2].y);
  }));
  ctx.save();
  try {
    configureEquationText(ctx);
    for (const glyph of glyphs) {
      ctx.font = glyph.font;
      ctx.fillText(glyph.text, x + glyph.x, baseline + glyph.baseline);
    }
    for (const rule of layout.rules) ctx.fillRect(x + rule.x, baseline + rule.y - rule.thickness / 2, rule.width, rule.thickness);
    for (const rect of rectangles) ctx.fillRect(x + rect.x, baseline + rect.y, rect.width, rect.height);
    if (strokes.length) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineCap = "butt"; ctx.lineJoin = "round";
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      for (const stroke of strokes) { ctx.lineWidth = stroke.thickness; ctx.stroke(stroke.path); }
    }
  } finally { ctx.restore(); }
}
