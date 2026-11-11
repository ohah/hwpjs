/** Static clipped form face; never mutates a value or invokes a button command. */
import { paintSourceCheckBox } from './checkbox-source-paint.mjs';
export function paintHwp5Form(ctx, item, x, y) {
  if (
    !item ||
    ![x, y, item.width, item.height, x + item.width, y + item.height].every(Number.isFinite) ||
    item.width <= 0 ||
    item.height <= 0
  )
    return false;
  if (item.checkBox) {
    paintSourceCheckBox(
      ctx,
      { x, y, width: item.width, height: item.height, font: item.font, checkBox: item.checkBox },
      0,
    );
    return true;
  }
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, item.width, item.height);
    ctx.clip();
    ctx.fillStyle = item.background;
    ctx.fillRect(x, y, item.width, item.height);
    if (item.drawFrame) {
      ctx.strokeStyle = '#707070';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, item.width - 1), Math.max(0, item.height - 1));
    }
    ctx.font = item.font;
    ctx.fillStyle = item.foreground;
    ctx.textBaseline = 'middle';
    ctx.textAlign = item.form.source.kind === 'push_button' ? 'center' : 'left';
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(
        x + 2,
        y,
        Math.max(0, item.width - (item.form.source.kind === 'combo_box' ? 18 : 4)),
        item.height,
      );
      ctx.clip();
      if (item.multiline === true) {
        if (!Number.isFinite(item.lineHeight) || item.lineHeight <= 0) return false;
        const lines = item.label.split('\n');
        const visible = Math.min(lines.length, Math.ceil(item.height / item.lineHeight));
        for (let i = 0; i < visible; i++)
          ctx.fillText(lines[i], x + 3, y + item.lineHeight * (i + 0.5));
      } else {
        ctx.fillText(
          item.label,
          x + (ctx.textAlign === 'center' ? item.width / 2 : 3),
          y + item.height / 2,
        );
      }
    } finally {
      ctx.restore();
    }
    if (item.form.source.kind === 'combo_box') {
      const right = x + item.width - 8,
        middle = y + item.height / 2;
      ctx.beginPath();
      ctx.moveTo(right - 3, middle - 2);
      ctx.lineTo(right + 3, middle - 2);
      ctx.lineTo(right, middle + 2);
      ctx.closePath();
      ctx.fill();
    }
  } finally {
    ctx.restore();
  }
  return true;
}
