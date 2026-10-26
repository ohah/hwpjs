// Visual raster envelope, not text-wrap margins or a change to object geometry.
export function pictureShadowBounds(plan, borderWidth = 0) {
  if (
    plan?.state !== 'outer' ||
    ![plan.width, plan.height, plan.blur, plan.offsetX, plan.offsetY, borderWidth].every(
      Number.isFinite,
    ) ||
    plan.width <= 0 ||
    plan.height <= 0 ||
    plan.blur < 0 ||
    borderWidth < 0
  )
    return null;
  const spread = 2 * plan.blur + borderWidth / 2;
  const left = Math.ceil(Math.max(borderWidth / 2, spread - plan.offsetX));
  const right = Math.ceil(Math.max(borderWidth / 2, spread + plan.offsetX));
  const top = Math.ceil(Math.max(borderWidth / 2, spread - plan.offsetY));
  const bottom = Math.ceil(Math.max(borderWidth / 2, spread + plan.offsetY));
  const width = plan.width + left + right,
    height = plan.height + top + bottom;
  return [left, right, top, bottom, width, height].every(Number.isFinite)
    ? { left, right, top, bottom, width, height }
    : null;
}
