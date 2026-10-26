import { hwpUnitPixels } from './hwp-units.mjs';
import { drawingPathPoints, traceDrawingPath } from './drawing-path-points.mjs';
import { strokeDashPattern } from './stroke-dash-pattern.mjs';

// 꼭짓점에는 renderingInfo가 이미 적용되어 있습니다. 배율을 다시 적용하지 않습니다.
export function drawingOutlinePoints(source, origin, scrollTop = 0) {
  const { color, width, style } = source?.stroke ?? {};
  if (
    !strokeDashPattern(style) ||
    !Number.isInteger(color) ||
    color < 0 ||
    color > 0xffffff ||
    !Number.isInteger(width) ||
    width <= 0 ||
    width > 0xffffffff
  )
    return null;
  if (source.rendering_polygon !== undefined && typeof source.polygon_closed !== 'boolean')
    return null;
  return drawingPathPoints(source, origin, scrollTop);
}

export function paintDrawingOutline(ctx, source, origin, scrollTop = 0) {
  const points = drawingOutlinePoints(source, origin, scrollTop);
  if (!points) return false;
  ctx.save();
  try {
    ctx.strokeStyle = `#${source.stroke.color.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = hwpUnitPixels(source.stroke.width);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.lineDashOffset = 0;
    ctx.setLineDash(strokeDashPattern(source.stroke.style));
    traceDrawingPath(ctx, points, source.rendering_polygon === undefined || source.polygon_closed);
    ctx.stroke();
  } finally {
    ctx.restore();
  }
  return true;
}
