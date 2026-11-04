/** 화면 좌표만 소비합니다. 텍스트·선택·행 크기를 변경하지 않습니다. */
export function paintFormattingMarks(ctx, plans, scrollTop) {
  if (!Array.isArray(plans) || !Number.isFinite(scrollTop) || !plans.length) return 0;
  let count = 0;
  ctx.save();
  try {
    ctx.strokeStyle = '#4169E1';
    ctx.fillStyle = '#4169E1';
    ctx.lineWidth = 1;
    for (const plan of plans) {
      const { kind, x, width, height } = plan,
        y = plan.y - scrollTop;
      if (![x, y, width, height].every(Number.isFinite) || height <= 0 || width < 0) continue;
      if (kind === 'space' && width > 0) {
        const size = Math.min(2, width / 3, height / 8);
        ctx.fillRect(x + width / 2 - size / 2, y - size / 2, size, size);
      } else if (kind === 'tab' && width > 0) {
        const inset = Math.min(2, width / 4),
          tip = x + width - inset,
          head = Math.min(3, width / 4, height / 5);
        ctx.beginPath();
        ctx.moveTo(x + inset, y);
        ctx.lineTo(tip, y);
        ctx.moveTo(tip - head, y - head);
        ctx.lineTo(tip, y);
        ctx.lineTo(tip - head, y + head);
        ctx.stroke();
      } else if (kind === 'line-break' && width === 0) {
        const size = Math.min(9, height * 0.45);
        ctx.beginPath();
        ctx.moveTo(x + size / 2, y - size);
        ctx.lineTo(x + size / 2, y);
        ctx.moveTo(x + size / 6, y - size / 3);
        ctx.lineTo(x + size / 2, y);
        ctx.lineTo(x + (size * 5) / 6, y - size / 3);
        ctx.stroke();
      } else continue;
      count++;
    }
  } finally {
    ctx.restore();
  }
  return count;
}
