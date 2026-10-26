import { clipChartLineSegment } from './chart-line-clip.mjs';

export function validChartStock(stock) {
  return (
    stock &&
    Array.isArray(stock.high_low) &&
    Array.isArray(stock.bodies) &&
    stock.high_low.every(
      (row) => [row.x, row.y1, row.y2].every(Number.isFinite) && row.x >= 0 && row.x <= 1,
    ) &&
    stock.bodies.every(
      (row) =>
        ['up', 'down', 'equal'].includes(row.direction) &&
        row.rectangle &&
        [row.first_y, row.last_y].every(Number.isFinite) &&
        row.rectangle.y === Math.min(row.first_y, row.last_y) &&
        row.rectangle.height === Math.abs(row.last_y - row.first_y) &&
        [row.rectangle.x, row.rectangle.y, row.rectangle.width, row.rectangle.height].every(
          Number.isFinite,
        ) &&
        row.rectangle.x >= 0 &&
        row.rectangle.width >= 0 &&
        row.rectangle.x + row.rectangle.width <= 1 &&
        row.rectangle.height >= 0,
    )
  );
}

/** Plot-clipped preview strokes/fills; source drawing styles are not applied. */
export function paintChartStock(ctx, stock, plot, x, y) {
  if (
    !validChartStock(stock) ||
    ![x, y, plot?.width, plot?.height].every(Number.isFinite) ||
    plot.width <= 0 ||
    plot.height <= 0
  )
    return false;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, plot.width, plot.height);
    ctx.clip();
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 1;
    for (const row of stock.high_low) {
      const segment = clipChartLineSegment({ x: row.x, y: row.y1 }, { x: row.x, y: row.y2 });
      if (!segment) continue;
      ctx.beginPath();
      ctx.moveTo(x + segment[0].x * plot.width, y + segment[0].y * plot.height);
      ctx.lineTo(x + segment[1].x * plot.width, y + segment[1].y * plot.height);
      ctx.stroke();
    }
    for (const row of stock.bodies) {
      const r = row.rectangle;
      const low = Math.min(row.first_y, row.last_y),
        high = Math.max(row.first_y, row.last_y);
      if (low > 1 || high < 0) continue;
      const start = Math.max(0, low),
        end = Math.min(1, high);
      const left = x + r.x * plot.width,
        top = y + start * plot.height,
        height = (end - start) * plot.height;
      ctx.fillStyle = row.direction === 'down' ? '#444444' : '#ffffff';
      ctx.fillRect(left, top, r.width * plot.width, height);
      if (r.height === 0) {
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left + r.width * plot.width, top);
        ctx.stroke();
      } else if (low >= 0 && high <= 1) ctx.strokeRect(left, top, r.width * plot.width, height);
      else {
        const right = left + r.width * plot.width,
          bottom = top + height;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left, bottom);
        ctx.moveTo(right, top);
        ctx.lineTo(right, bottom);
        if (low >= 0 && low <= 1) {
          ctx.moveTo(left, top);
          ctx.lineTo(right, top);
        }
        if (high >= 0 && high <= 1) {
          ctx.moveTo(left, bottom);
          ctx.lineTo(right, bottom);
        }
        ctx.stroke();
      }
    }
    return true;
  } finally {
    ctx.restore();
  }
}
