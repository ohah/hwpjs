import { arrowHeadGeometry } from "./arrow-head-geometry.mjs";
export function decoratedLineBounds(plan) {
  if (!Number.isInteger(plan?.color) || plan.color < 0 || plan.color > 0xffffff) return null;
  if (
    plan?.state !== "planned" ||
    plan.policy !== "rhwp_reference" ||
    !Number.isFinite(plan.strokeWidth) ||
    plan.strokeWidth <= 0 ||
    !Array.isArray(plan.endpoints) ||
    plan.endpoints.length !== 2 ||
    !plan.endpoints.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ||
    !Array.isArray(plan.arrows) ||
    plan.arrows.length > 2
  )
    return null;
  const points = [...plan.endpoints];
  let strokedHead = false;
  for (const arrow of plan.arrows) {
    if (!arrow || typeof arrow.fill !== "boolean") return null;
    const shape = arrowHeadGeometry(arrow);
    if (!shape) return null;
    if (!shape.closed || !arrow.fill) strokedHead = true;
    points.push(...shape.points);
  }
  // Canvas miterLimit=10 bounds the join by ten half-widths.
  const half = (plan.strokeWidth / 2) * (strokedHead ? 10 : 1);
  const bounds = {
    left: Math.min(...points.map((p) => p[0])) - half,
    right: Math.max(...points.map((p) => p[0])) + half,
    top: Math.min(...points.map((p) => p[1])) - half,
    bottom: Math.max(...points.map((p) => p[1])) + half,
  };
  return Object.values(bounds).every(Number.isFinite) ? bounds : null;
}
