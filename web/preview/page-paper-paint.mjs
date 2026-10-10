// Page decoration uses layout geometry; it does not alter text or hit-testing.
export function paintPagePaper(ctx, pages, scrollTop, width, height) {
  if (!Array.isArray(pages) || !pages.length || ![scrollTop, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return 0;
  ctx.save();
  let painted = 0;
  try {
    ctx.fillStyle = "#e8edf2";
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#bbcbd6";
    for (const page of pages) {
      const box = page?.paper;
      if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) continue;
      const y = box.y - scrollTop;
      if (y + box.height < 0 || y > height || box.x + box.width < 0 || box.x > width) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(box.x, y, box.width, box.height);
      ctx.strokeRect(box.x, y, box.width, box.height);
      painted++;
    }
  } finally { ctx.restore(); }
  return painted;
}
