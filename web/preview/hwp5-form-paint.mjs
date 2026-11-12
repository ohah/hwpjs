import {
  FORM_TEXT_LEFT,
  FORM_TEXT_CLIP,
  formTextWrapWidth,
  FORM_COMBO_TEXT_CUT,
} from './form-face-geometry.mjs';
import { formTextLayout } from './form-text-layout.mjs';
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
        x + FORM_TEXT_CLIP,
        y,
        Math.max(
          0,
          item.width -
            (item.form.source.kind === 'combo_box' ? FORM_COMBO_TEXT_CUT : 2 * FORM_TEXT_CLIP),
        ),
        item.height,
      );
      ctx.clip();
      if (item.multiline === true) {
        if (!Number.isFinite(item.lineHeight) || item.lineHeight <= 0) return false;
        const layout = formTextLayout(item.label, {
          width: formTextWrapWidth(
            item.width,
            item.form.source.kind,
            item.textOffset ?? FORM_TEXT_LEFT,
          ),
          wrap: item.wordWrap === true,
          measure: (text) => ctx.measureText(text).width,
          maxLines: Math.max(1, Math.min(65536, Math.ceil(item.height / item.lineHeight))),
        });
        for (let i = 0; i < layout.rows.length; i++)
          ctx.fillText(
            layout.rows[i].text,
            x + (item.textOffset ?? FORM_TEXT_LEFT),
            y + item.lineHeight * (i + 0.5),
          );
      } else {
        ctx.fillText(
          item.label,
          x + (ctx.textAlign === 'center' ? item.width / 2 : (item.textOffset ?? FORM_TEXT_LEFT)),
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
