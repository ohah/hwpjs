import { pictureShadowBounds } from './picture-shadow-bounds.mjs';
import { paintPictureBorder } from './picture-border-paint.mjs';
import { pictureShadowRasterSize } from './picture-shadow-raster-budget.mjs';

export function paintPictureShadow(ctx, bitmap, item, x, y, crop, border, plan) {
  const bounds = pictureShadowBounds(plan, border.state === 'solid' ? border.width / 75 : 0);
  if (
    !bounds ||
    ![x, y, item.width, item.height].every(Number.isFinite) ||
    item.width <= 0 ||
    item.height <= 0
  )
    return false;
  const matrix = ctx.getTransform();
  const scaleX = item.width / plan.width,
    scaleY = item.height / plan.height;
  const deviceScaleX = (Math.hypot(matrix.a, matrix.b) * item.width) / plan.width;
  const deviceScaleY = (Math.hypot(matrix.c, matrix.d) * item.height) / plan.height;
  const rasterScale = Math.ceil(Math.max(1, deviceScaleX, deviceScaleY));
  const size = pictureShadowRasterSize(bounds, rasterScale);
  if (!size) return false;
  const { width, height } = size;
  const make = () => {
    const canvas =
      ctx.canvas?.ownerDocument?.createElement('canvas') ??
      (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : null);
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  };
  let content, result;
  try {
    content = make();
    result = make();
    const source = content?.getContext('2d'),
      effect = result?.getContext('2d');
    if (!source || !effect) return false;
    source.scale(rasterScale, rasterScale);
    source.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      bounds.left,
      bounds.top,
      plan.width,
      plan.height,
    );
    // This surface is already in native pixel units. Keep the stroke in those
    // same units instead of composing a second raw-unit affine transform.
    const rasterBorder =
      border.state === 'solid'
        ? {
            ...border,
            width: border.width / 75,
            rectangleWidth: plan.width,
            rectangleHeight: plan.height,
          }
        : border;
    paintPictureBorder(
      source,
      rasterBorder,
      { width: plan.width, height: plan.height },
      bounds.left,
      bounds.top,
    );
    const color = plan.color;
    const shadowColor = `rgba(${(color >>> 16) & 255},${(color >>> 8) & 255},${color & 255},${plan.opacity})`;
    effect.shadowColor = shadowColor;
    effect.shadowBlur = plan.blur * rasterScale;
    effect.shadowOffsetX = plan.offsetX * rasterScale;
    effect.shadowOffsetY = plan.offsetY * rasterScale;
    effect.drawImage(content, 0, 0);
    ctx.save();
    try {
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.filter = 'none';
      ctx.drawImage(
        result,
        0,
        0,
        width,
        height,
        x - bounds.left * scaleX,
        y - bounds.top * scaleY,
        (width / rasterScale) * scaleX,
        (height / rasterScale) * scaleY,
      );
    } finally {
      ctx.restore();
    }
    return true;
  } finally {
    for (const canvas of [content, result])
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
  }
}
