export function paintPictureBorder(ctx, plan, item, x, y) {
  if (plan.state === "none") return;
  ctx.save();
  try {
    ctx.translate(x, y);
    ctx.scale(item.width / plan.rectangleWidth, item.height / plan.rectangleHeight);
    ctx.strokeStyle = plan.color;
    ctx.lineWidth = plan.width;
    ctx.lineJoin = "miter";
    ctx.miterLimit = 10;
    ctx.setLineDash([]);
    ctx.strokeRect(0, 0, plan.rectangleWidth, plan.rectangleHeight);
  } finally { ctx.restore(); }
}
