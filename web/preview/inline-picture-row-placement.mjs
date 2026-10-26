import { rowLeft, rowTop, rowTextTop } from './row-geometry.mjs';
import { affineBox } from './affine-point-geometry.mjs';

/** Shared Canvas origin and physical footprint for the current inline anchor. */
export function inlinePictureRowPlacement(item, row, index) {
  const fail = (error) => ({ state: 'unavailable', error });
  const picture = item?.picture,
    unit = picture?.anchorUnit;
  if (
    !picture ||
    row?.kind !== 'text' ||
    row.section !== picture.section ||
    row.paragraph !== picture.paragraph ||
    !Number.isSafeInteger(unit) ||
    unit < 0 ||
    !Array.isArray(row.boundaries) ||
    ![item.width, item.height].every((v) => Number.isFinite(v) && v > 0)
  )
    return fail('InvalidInlinePictureRow');
  const matches = row.boundaries.flatMap((boundary, i) => (boundary?.unit === unit ? [i] : []));
  if (matches.length !== 1) return fail('AmbiguousInlinePictureBoundary');
  const boundary = row.boundaries[matches[0]],
    next = row.boundaries[matches[0] + 1];
  if (
    !next ||
    next.unit !== unit + 1 ||
    !Number.isFinite(boundary.x) ||
    !Number.isFinite(next.x) ||
    row.startUnit > unit ||
    row.endUnit <= unit
  )
    return fail('InvalidInlinePictureRow');
  const origin = { x: rowLeft(row) + boundary.x, y: rowTop(row, index) + rowTextTop(row) };
  const box = { ...origin, width: item.width, height: item.height };
  const rectangle = row.transform === undefined ? box : affineBox(row.transform, box);
  if (
    !rectangle ||
    ![
      origin.x,
      origin.y,
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
      rectangle.x + rectangle.width,
      rectangle.y + rectangle.height,
    ].every(Number.isFinite) ||
    rectangle.width <= 0 ||
    rectangle.height <= 0
  )
    return fail('InvalidInlinePictureRow');
  return { state: 'placed', origin, rectangle, pageOrdinal: row.pageOrdinal };
}
