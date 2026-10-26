import { colorrefCss } from './colorref-css.mjs';

// Raw picture units are retained until the painter maps the border rectangle.
export function hwp5PictureBorderPlan(picture) {
  const source = picture?.source;
  if (!source || source.border_width === undefined) return { state: 'none' };
  if (source.border_width === 0 && source.border_attributes === 0) return { state: 'none' };
  // NONE leaves stored width and arrow defaults inactive. Only known cap/size
  // declarations with no arrow shapes are accepted; raw values remain intact.
  const raw = source.border_attributes;
  if (
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= 0xffffffff &&
    (raw & 63) === 0 &&
    ((raw >>> 6) & 15) <= 1 &&
    ((raw >>> 10) & 4095) === 0 &&
    ((raw >>> 22) & 15) <= 8 &&
    ((raw >>> 26) & 15) <= 8 &&
    Number.isInteger(source.border_width) &&
    source.border_width >= 0 &&
    source.border_width <= 0x7fffffff
  )
    return { state: 'none' };
  const fail = () => ({ state: 'unavailable', error: 'UnsupportedHwp5PictureBorder' });
  const attributes = source.border_attributes;
  if (
    !Number.isInteger(attributes) ||
    attributes < 0 ||
    attributes > 0xffffffff ||
    (attributes & 63) !== 1 ||
    ((attributes >>> 6) & 15) > 1 ||
    ((attributes >>> 10) & 4095) !== 0 ||
    ((attributes >>> 22) & 15) > 8 ||
    ((attributes >>> 26) & 15) > 8 ||
    !Number.isInteger(source.border_width) ||
    source.border_width <= 0 ||
    !Number.isInteger(source.border_color) ||
    source.border_color < 0 ||
    source.border_color > 0xffffff ||
    picture.tailSource?.border_opacity !== 0
  )
    return fail();
  const points = source.points;
  if (
    !Array.isArray(points) ||
    points.length !== 4 ||
    !points.every(
      (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
    )
  )
    return fail();
  const [[x, y], [right, top], [farRight, bottom], [left, farBottom]] = points;
  if (
    x !== 0 ||
    y !== 0 ||
    top !== 0 ||
    left !== 0 ||
    right <= 0 ||
    bottom <= 0 ||
    farRight !== right ||
    farBottom !== bottom
  )
    return fail();
  // Both specified caps paint the same closed rectangle. Arrow fill bits are
  // inactive when neither endpoint declares an arrow shape.
  return {
    state: 'solid',
    color: colorrefCss(source.border_color),
    width: source.border_width,
    rectangleWidth: right,
    rectangleHeight: bottom,
  };
}
