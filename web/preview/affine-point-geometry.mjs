const valid = (matrix) =>
  Array.isArray(matrix) && matrix.length === 6 && Array.from(matrix).every(Number.isFinite);

// HWP renderingInfo row order -> Canvas affine order; no unit conversion.
export function hwpRenderingMatrix(matrix) {
  if (!valid(matrix)) return null;
  const [a, c, e, b, d, f] = matrix;
  return [a, b, c, d, e, f];
}

// Canvas 순서 a,b,c,d,e,f를 사용합니다.
export function affinePoint(matrix, point) {
  if (
    !valid(matrix) ||
    !Array.isArray(point) ||
    point.length !== 2 ||
    !Array.from(point).every(Number.isFinite)
  )
    return null;
  const [a, b, c, d, e, f] = matrix,
    [x, y] = point;
  const result = [a * x + c * y + e, b * x + d * y + f];
  return result.every(Number.isFinite) ? result : null;
}

export function inverseAffine(matrix) {
  if (!valid(matrix)) return null;
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || det === 0) return null;
  const result = [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ];
  return result.every(Number.isFinite) ? result : null;
}

export function affineBox(matrix, box) {
  if (
    !box ||
    ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
    box.width < 0 ||
    box.height < 0
  )
    return null;
  const { x, y, width, height } = box;
  const points = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ].map((point) => affinePoint(matrix, point));
  if (points.some((point) => !point)) return null;
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const left = Math.min(...xs),
    top = Math.min(...ys);
  const result = { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  return Object.values(result).every(Number.isFinite) ? result : null;
}
