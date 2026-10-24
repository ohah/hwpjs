import { layoutPictureCaption } from './picture-caption-layout.mjs';

// Image paint geometry and the caption's occupied region have separate owners.
export function measurePictureCaptionFrame(picture, paragraphs, rectangle, measure, { maxRows = 20000 } = {}) {
  if (!rectangle || ![rectangle.x, rectangle.y, rectangle.width, rectangle.height,
    rectangle.x + rectangle.width, rectangle.y + rectangle.height].every(Number.isFinite)
    || rectangle.width <= 0 || rectangle.height <= 0) return { state: 'unavailable', error: 'InvalidPictureCaptionRectangle' };
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) return { state: 'unavailable', error: 'PictureCaptionRowLimit' };
  const result = layoutPictureCaption(picture, paragraphs, rectangle, measure, { maxRows });
  if (result.state !== 'positioned') return result;
  return { state: 'measured', rectangle: { ...rectangle }, flowRectangle: result.bounds,
    captionRectangle: result.captionRectangle, rows: result.rows };
}
