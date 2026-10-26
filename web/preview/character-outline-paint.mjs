/** Canvas state ownership only; outline interpretation belongs to outline-style. */
export function paintCharacterOutline(ctx, style, text, x, y) {
  if (
    !style ||
    typeof ctx.strokeText !== 'function' ||
    (style.dash.length && typeof ctx.setLineDash !== 'function')
  )
    return false;
  ctx.save();
  try {
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = style.width;
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash(style.dash);
      ctx.lineDashOffset = 0;
    }
    ctx.strokeText(text, x, y);
    return true;
  } finally {
    ctx.restore();
  }
}
