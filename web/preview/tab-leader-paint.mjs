/** Canvas display policy; source leader names stay distinct from underline styles. */
export function canPaintTabLeader(leader) {
  return leader === null || ["NONE", "SOLID", "DASH", "CIRCLE"].includes(leader);
}

/** Paint only the measured gap, never the stop position or cached source width. */
export function paintTabLeader(ctx, leader, x, width, y, height, color) {
  if (
    !canPaintTabLeader(leader) ||
    leader === null ||
    leader === "NONE" ||
    ![x, width, y, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(x + width) ||
    typeof color !== "string"
  )
    return false;
  const thickness = leader === "CIRCLE" ? Math.max(0.7, height / 18) : Math.max(0.5, height / 24);
  // Insets keep round caps inside the tab interval, including very short gaps.
  const inset = Math.min(thickness / 2, width / 2),
    left = x + inset,
    right = x + width - inset;
  const at = y + height * 0.65;
  if (right <= left || !Number.isFinite(at)) return false;
  ctx.save();
  try {
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = leader === "SOLID" ? "butt" : "round";
    ctx.lineDashOffset = 0;
    ctx.setLineDash(leader === "SOLID" ? [] : [0.1, Math.max(thickness * 3, height / 5)]);
    ctx.beginPath();
    ctx.moveTo(left, at);
    ctx.lineTo(right, at);
    ctx.stroke();
  } finally {
    ctx.restore();
  }
  return true;
}
