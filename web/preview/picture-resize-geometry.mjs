import { pictureQuadTransform } from './picture-quad-transform.mjs';
import { affinePoint } from './affine-point-geometry.mjs';
import { pageContainsPoint } from './page-visible-rectangle.mjs';

export function pictureResizeBasis(item, target, { allowPartialHandles = false } = {}) {
  if (
    !item ||
    !target ||
    ![target.width, target.height].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 0xffffffff,
    )
  )
    return null;
  let points;
  if (item.paintPlan?.state === 'quad') {
    const mapped = pictureQuadTransform(
      item.paintPlan.corners,
      item.paintOrigin ?? { x: item.x, y: item.y },
    );
    if (mapped.state !== 'mapped') return null;
    const [a, b, c, d, e, f] = mapped.matrix;
    points = [
      [e, f],
      [e + a, f + b],
      [e + c, f + d],
    ];
  } else if (item.paintPlan?.state === 'plain') {
    if (
      ![item.x, item.y, item.width, item.height].every(Number.isFinite) ||
      item.width <= 0 ||
      item.height <= 0
    )
      return null;
    points = [
      [item.x, item.y],
      [item.x + item.width, item.y],
      [item.x, item.y + item.height],
    ];
  } else return null;
  if (item.transform !== undefined)
    points = points.map((point) => affinePoint(item.transform, point));
  if (points.some((point) => !point || !point.every(Number.isFinite))) return null;
  const [origin, right, bottom] = points;
  const x = [right[0] - origin[0], right[1] - origin[1]],
    y = [bottom[0] - origin[0], bottom[1] - origin[1]];
  const determinant = x[0] * y[1] - x[1] * y[0];
  if (!Number.isFinite(determinant) || determinant === 0) return null;
  const corner = [origin[0] + x[0] + y[0], origin[1] + x[1] + y[1]];
  if (
    item.pageClip !== undefined &&
    (allowPartialHandles
      ? !pageContainsPoint(item.pageClip, item.pageClip?.x, item.pageClip?.y)
      : !pageContainsPoint(item.pageClip, ...corner))
  )
    return null;
  return { ...target, origin, x, y, determinant, corner, pageClip: item.pageClip };
}

export function pictureResizeHandles(basis) {
  if (!basis) return [];
  const { origin, x, y } = basis;
  const handles = [
    { horizontal: true, vertical: true, point: basis.corner },
    {
      horizontal: true,
      vertical: false,
      point: [origin[0] + x[0] + y[0] / 2, origin[1] + x[1] + y[1] / 2],
    },
    {
      horizontal: false,
      vertical: true,
      point: [origin[0] + x[0] / 2 + y[0], origin[1] + x[1] / 2 + y[1]],
    },
  ];
  return handles.filter(
    (handle) => basis.pageClip === undefined || pageContainsPoint(basis.pageClip, ...handle.point),
  );
}

export function resizedPicture(
  basis,
  point,
  { horizontal = true, vertical = true, preserveAspect = false } = {},
) {
  if (!basis || !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
    return null;
  const dx = point[0] - basis.origin[0],
    dy = point[1] - basis.origin[1];
  const u = (dx * basis.y[1] - dy * basis.y[0]) / basis.determinant;
  const v = (dy * basis.x[0] - dx * basis.x[1]) / basis.determinant;
  if (preserveAspect) {
    if (!horizontal && !vertical) return null;
    const factor =
      horizontal && vertical ? (Math.abs(u - 1) >= Math.abs(v - 1) ? u : v) : horizontal ? u : v;
    if (!Number.isFinite(factor)) return null;
    const minimum = Math.max(1 / basis.width, 1 / basis.height);
    const maximum = Math.min(0xffffffff / basis.width, 0xffffffff / basis.height);
    const bounded = Math.max(minimum, Math.min(maximum, factor));
    return {
      width: Math.max(1, Math.min(0xffffffff, Math.round(basis.width * bounded))),
      height: Math.max(1, Math.min(0xffffffff, Math.round(basis.height * bounded))),
    };
  }
  const width = horizontal ? Math.round(basis.width * u) : basis.width,
    height = vertical ? Math.round(basis.height * v) : basis.height;
  if (![width, height].every(Number.isFinite)) return null;
  return {
    width: Math.max(1, Math.min(0xffffffff, width)),
    height: Math.max(1, Math.min(0xffffffff, height)),
  };
}
