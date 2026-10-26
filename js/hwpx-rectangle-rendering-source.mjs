import { validShapeLayoutValues } from './hwpx-shape-layout-values.mjs';
import { validShapePaintValues } from './hwpx-shape-paint-values.mjs';
export function decodeRectangleRenderingSource(bytes) {
  const fail = () => {
    throw new Error('InvalidRectangleRenderingSource');
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 65536) return fail();
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const signed = (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
  const optional = (n, check) => n === null || check(n);
  const bool = (n) => n === null || typeof n === 'boolean';
  const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
  if (!value || !uint(value.rectangle_node) || !value.source) return fail();
  if (
    !value.owner ||
    ![value.owner.paragraph, value.owner.anchor_unit, value.owner.anchor_node].every(uint) ||
    value.owner.paragraph === 0 ||
    value.owner.anchor_node > value.rectangle_node
  )
    return fail();
  const s = value.source,
    r = s.rendering,
    p = s.rectangle;
  if (!validShapeLayoutValues(s)) return fail();
  if (!validShapePaintValues(s)) return fail();
  if (
    !bool(s.transform_identity) ||
    !r ||
    !p ||
    !array(r.flip, 2, bool) ||
    !optional(r.angle, uint) ||
    !bool(r.reverse) ||
    !array(r.center, 2, (n) => optional(n, signed)) ||
    !bool(r.rotate_image)
  )
    return fail();
  if (r.matrix === null) {
    if (
      ![
        'UnsupportedPictureMatrixSequence',
        'IncompletePictureMatrix',
        'NonFinitePictureMatrix',
      ].includes(r.matrix_error)
    )
      return fail();
  } else if (!array(r.matrix, 6, Number.isFinite) || r.matrix_error !== null) return fail();
  if (
    typeof p.present !== 'boolean' ||
    !uint(p.unknown_children) ||
    !array(p.point_present, 4, (n) => typeof n === 'boolean') ||
    !array(p.points, 4, (point) => array(point, 2, (n) => optional(n, signed)))
  )
    return fail();
  if (
    p.points.some((point, i) => !p.point_present[i] && point.some((n) => n !== null)) ||
    (!p.present && p.point_present.some(Boolean))
  )
    return fail();
  if (
    s.rendering_corners !== null &&
    (!array(s.rendering_corners, 4, (point) => array(point, 2, Number.isFinite)) ||
      r.matrix === null)
  )
    return fail();
  return value;
}
