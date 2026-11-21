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
    [1, 1],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [0, -1],
    [-1, 0],
  ].map(([xSide, ySide]) => {
    const u = (xSide + 1) / 2,
      v = (ySide + 1) / 2;
    return {
      horizontal: xSide !== 0,
      vertical: ySide !== 0,
      xSide,
      ySide,
      point: [origin[0] + x[0] * u + y[0] * v, origin[1] + x[1] * u + y[1] * v],
    };
  });
  return handles.filter(
    (handle) => basis.pageClip === undefined || pageContainsPoint(basis.pageClip, ...handle.point),
  );
}

export function resizedPicture(
  basis,
  point,
  { horizontal = true, vertical = true, xSide = 1, ySide = 1, preserveAspect = false } = {},
) {
  if (!basis || !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
    return null;
  const dx = point[0] - basis.origin[0],
    dy = point[1] - basis.origin[1];
  const horizontalPosition = (dx * basis.y[1] - dy * basis.y[0]) / basis.determinant,
    verticalPosition = (dy * basis.x[0] - dx * basis.x[1]) / basis.determinant;
  const u = xSide < 0 ? 1 - horizontalPosition : horizontalPosition,
    v = ySide < 0 ? 1 - verticalPosition : verticalPosition;
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

// Fixed point is the opposite of the dragged handle; values match Native names.
const fixedPictureResizeAnchors = Object.freeze({
  top_left: [0, 0],
  top_center: [0.5, 0],
  top_right: [1, 0],
  center_left: [0, 0.5],
  center_right: [1, 0.5],
  bottom_left: [0, 1],
  bottom_center: [0.5, 1],
  bottom_right: [1, 1],
});

export function pictureResizeFixedAnchor(handle) {
  if (
    !handle ||
    ![-1, 0, 1].includes(handle.xSide) ||
    ![-1, 0, 1].includes(handle.ySide) ||
    (handle.xSide === 0 && handle.ySide === 0)
  )
    return null;
  const x = (1 - handle.xSide) / 2,
    y = (1 - handle.ySide) / 2;
  return (
    Object.entries(fixedPictureResizeAnchors).find(
      ([, point]) => point[0] === x && point[1] === y,
    )?.[0] ?? null
  );
}

// Paint-only geometry. This does not issue an owner or admit a Native mutation.
// Omitted mode retains the legacy origin and bottom-right guide exactly.
export function pictureResizeGuideGeometry({ basis, size, mode = 'legacy', anchor } = {}) {
  if (
    !basis ||
    !size ||
    ![basis.width, basis.height, size.width, size.height].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 0xffffffff,
    ) ||
    ![basis.origin, basis.x, basis.y].every(
      (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
    )
  )
    return null;
  const x = basis.x.map((value) => (value * size.width) / basis.width),
    y = basis.y.map((value) => (value * size.height) / basis.height);
  let origin = [...basis.origin],
    moving = [1, 1];
  if (mode === 'anchored') {
    if (typeof anchor !== 'string' || !Object.hasOwn(fixedPictureResizeAnchors, anchor))
      return null;
    const fixed = fixedPictureResizeAnchors[anchor];
    origin = origin.map(
      (value, axis) =>
        value + fixed[0] * (basis.x[axis] - x[axis]) + fixed[1] * (basis.y[axis] - y[axis]),
    );
    moving = fixed.map((value) => 1 - value);
  } else if (mode !== 'legacy') return null;
  const point = origin.map((value, axis) => value + moving[0] * x[axis] + moving[1] * y[axis]);
  if (![...origin, ...x, ...y, ...point].every(Number.isFinite)) return null;
  return { origin, x, y, point };
}

// Native midpoint anchors require exact integer offsets, never hidden rounding.
export function pictureResizeAnchorSizeSupported(basis, size, anchor) {
  if (typeof anchor !== 'string' || !Object.hasOwn(fixedPictureResizeAnchors, anchor)) return false;
  if (
    !basis ||
    !size ||
    ![basis.width, basis.height, size.width, size.height].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 0xffffffff,
    )
  )
    return false;
  const fixed = fixedPictureResizeAnchors[anchor];
  return (
    (fixed[0] !== 0.5 || (basis.width - size.width) % 2 === 0) &&
    (fixed[1] !== 0.5 || (basis.height - size.height) % 2 === 0)
  );
}
