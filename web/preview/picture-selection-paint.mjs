import { pictureQuadTransform } from "./picture-quad-transform.mjs";

export function paintPictureSelection(ctx, item, scrollTop) {
  let corners;
  if (item.paintPlan?.state === "quad") {
    const mapped = pictureQuadTransform(item.paintPlan.corners, item.paintOrigin ?? { x: item.x, y: item.y });
    if (mapped.state !== "mapped") return false;
    const [a, b, c, d, e, f] = mapped.matrix;
    corners = [[e, f], [e + a, f + b], [e + a + c, f + b + d], [e + c, f + d]];
  } else if (item.paintPlan?.state === "plain") {
    corners = [[item.x, item.y], [item.x + item.width, item.y], [item.x + item.width, item.y + item.height], [item.x, item.y + item.height]];
  } else return false;
  if (!Number.isFinite(scrollTop) || !corners.flat().every(Number.isFinite)) return false;
  ctx.save();
  try {
    ctx.strokeStyle = "#145b96";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1] - scrollTop);
    for (const [x, y] of corners.slice(1)) ctx.lineTo(x, y - scrollTop);
    ctx.closePath(); ctx.stroke();
  } finally { ctx.restore(); }
  return true;
}
