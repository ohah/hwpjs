import { createDrawingPattern } from "./drawing-pattern-fill.mjs";
export function paintDrawingFill(ctx, drawing, scrollTop) {
  if (!["solid", "linear_gradient", "pattern"].includes(drawing.fill?.state)) return false;
  const r = drawing.rectangle;
  if (!r || ![r.x, r.y, r.width, r.height, scrollTop].every(Number.isFinite) || r.width <= 0 || r.height <= 0) return false;
  if (drawing.fill.state === "solid" && !/^#[0-9a-f]{6}$/i.test(drawing.fill.color)) return false;
  ctx.save();
  try {
    if (drawing.fill.state === "solid") ctx.fillStyle = drawing.fill.color;
    else if (drawing.fill.state === "pattern") {
      const pattern = createDrawingPattern(ctx, drawing.fill);
      if (!pattern) return false;
      ctx.fillStyle = pattern;
    }
    else {
      const angle = ((drawing.fill.angle % 360) + 360) % 360;
      if (!Number.isFinite(angle) || !Array.isArray(drawing.fill.stops)) return false;
      const radians = angle * Math.PI / 180;
      const dx = angle % 180 === 0 ? 0 : Math.sin(radians) * r.width / 2;
      const dy = angle % 180 === 90 ? 0 : Math.cos(radians) * r.height / 2;
      const cx = r.x + r.width / 2, cy = r.y - scrollTop + r.height / 2;
      const gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      for (const stop of drawing.fill.stops) gradient.addColorStop(stop.offset, stop.color);
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(r.x, r.y - scrollTop, r.width, r.height);
  } finally { ctx.restore(); }
  return true;
}
