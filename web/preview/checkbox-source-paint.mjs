import { FORM_CHOICE_SIZE, FORM_CHOICE_GAP } from './form-face-geometry.mjs';
// Source-sized inline checkbox/caption. Font raster equivalence remains external.
import { paintCheckBoxProxy } from './checkbox-proxy-paint.mjs';
export function paintSourceCheckBox(ctx, box, scrollTop) {
  const { checkBox, font } = box,
    y = box.y - scrollTop;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(box.x, y, box.width, box.height);
    ctx.clip();
    if (checkBox.backStyle === 'OPAQUE') {
      ctx.fillStyle = checkBox.backColor;
      ctx.fillRect(box.x, y, box.width, box.height);
    }
    const size = Math.min(FORM_CHOICE_SIZE, box.height, box.width);
    paintCheckBoxProxy(
      ctx,
      {
        ...box,
        y: box.y + (box.height - size) / 2,
        width: size,
        height: size,
        foreground: checkBox.foreColor,
        background: checkBox.backStyle === 'OPAQUE' ? checkBox.backColor : null,
      },
      scrollTop,
    );
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = checkBox.foreColor;
    ctx.fillText(checkBox.caption, box.x + size + FORM_CHOICE_GAP, y + box.height / 2);
  } finally {
    ctx.restore();
  }
}
