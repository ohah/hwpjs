export function paintMemoPane(ctx, boxes, scrollTop, height) {
  if (!boxes?.length) return;
  ctx.save();
  try {
    ctx.fillStyle = '#fff8d8';
    ctx.strokeStyle = '#d8be69';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const box of boxes) {
      const y = box.y - scrollTop;
      if (y + box.height < 0 || y > height) continue;
      ctx.fillRect(box.x, y, box.width, box.height);
      ctx.strokeRect(box.x, y, box.width, box.height);
    }
  } finally {
    ctx.restore();
  }
}
