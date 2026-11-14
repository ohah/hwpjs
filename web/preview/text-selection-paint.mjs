/** Blend the selection with already painted inline objects instead of covering their pixels. */
export function paintTextSelectionBackground(ctx, rectangles, scrollTop) {
  if (rectangles.length === 0) return;
  ctx.save();
  try {
    // On white this keeps the existing light-blue selection; object ink remains visible.
    ctx.fillStyle = 'rgba(25, 128, 218, 0.3)';
    for (const rect of rectangles)
      ctx.fillRect(rect.x, rect.y - scrollTop, rect.width, rect.height);
  } finally {
    ctx.restore();
  }
}
