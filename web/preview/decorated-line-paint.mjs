import { paintArrowHead } from "./arrow-head-paint.mjs";
import { arrowHeadGeometry } from "./arrow-head-geometry.mjs";
import { decoratedLineBounds } from "./decorated-line-bounds.mjs";
export function paintDecoratedLine(ctx, plan, origin, scrollTop = 0) {
  if (
    plan?.state !== "planned" ||
    plan.policy !== "rhwp_reference" ||
    ![origin?.x, origin?.y, scrollTop].every(Number.isFinite)
  )
    return false;
  if (!decoratedLineBounds(plan)) return false;
  if (
    !Array.isArray(plan.endpoints) ||
    plan.endpoints.length !== 2 ||
    !plan.endpoints.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ||
    !Array.isArray(plan.arrows) ||
    plan.arrows.length > 2 ||
    !Number.isFinite(plan.strokeWidth) ||
    plan.strokeWidth <= 0 ||
    !Number.isInteger(plan.color) ||
    plan.color < 0 ||
    plan.color > 0xffffff
  )
    return false;
  const translate = (point) => [point[0] + origin.x, point[1] + origin.y - scrollTop];
  const endpoints = plan.endpoints.map(translate);
  if (!endpoints.flat().every(Number.isFinite)) return false;
  const arrows = [];
  for (const arrow of plan.arrows) {
    if (
      !arrow ||
      typeof arrow.fill !== "boolean" ||
      !Array.isArray(arrow.tip) ||
      arrow.tip.length !== 2
    )
      return false;
    const translated = {
      ...arrow,
      tip: translate(arrow.tip),
      color: plan.color,
      strokeWidth: plan.strokeWidth,
    };
    if (!arrowHeadGeometry(translated)) return false;
    arrows.push(translated);
  }
  ctx.save();
  try {
    ctx.strokeStyle = `#${plan.color.toString(16).padStart(6, "0")}`;
    ctx.lineWidth = plan.strokeWidth;
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(...endpoints[0]);
    ctx.lineTo(...endpoints[1]);
    ctx.stroke();
    for (const arrow of arrows) paintArrowHead(ctx, arrow);
  } finally {
    ctx.restore();
  }
  return true;
}
