import { hwpUnitPixels } from './hwp-units.mjs';

// 변환이 적용된 네 모서리를 정규화한 이미지 사각형의 Canvas 행렬로 연결합니다.
export function pictureQuadTransform(corners, origin = { x: 0, y: 0 }) {
  if (
    !Array.isArray(corners) ||
    corners.length !== 4 ||
    !Array.from(corners).every(
      (point) =>
        Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite),
    ) ||
    !origin ||
    ![origin.x, origin.y].every(Number.isFinite)
  )
    return { state: 'invalid_corners' };
  const points = corners.map((point) => point.map(hwpUnitPixels));
  const [p0, p1, p2, p3] = points;
  const a = p1[0] - p0[0],
    b = p1[1] - p0[1],
    c = p3[0] - p0[0],
    d = p3[1] - p0[1];
  const e = origin.x + p0[0],
    f = origin.y + p0[1];
  if (![a, b, c, d, e, f, a * d - b * c].every(Number.isFinite))
    return { state: 'invalid_corners' };
  const tolerance = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) * 1e-10;
  if (
    Math.abs(p2[0] - (p1[0] + p3[0] - p0[0])) > tolerance ||
    Math.abs(p2[1] - (p1[1] + p3[1] - p0[1])) > tolerance
  )
    return { state: 'unsupported_quad' };
  if (a * d - b * c === 0) return { state: 'degenerate_quad' };
  return { state: 'mapped', matrix: [a, b, c, d, e, f] };
}
