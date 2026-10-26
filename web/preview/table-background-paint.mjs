import { paintDrawingFill } from './drawing-fill-paint.mjs';
import { paintTableImageFill } from './table-image-fill.mjs';
export function paintTableBackground(ctx, box, fill, scrollTop, bitmap) {
  return fill?.state === 'image'
    ? paintTableImageFill(ctx, bitmap, box, fill, scrollTop)
    : paintDrawingFill(ctx, { rectangle: box, fill }, scrollTop);
}
