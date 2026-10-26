import { drawingQuadGeometry } from './drawing-quad-geometry.mjs';

// 선언 크기와 변환 외곽은 분리합니다. 스키마는 두 값의 일치를 요구하지 않습니다.
export function drawingRotatedGeometry(source) {
  const rendering = source?.rendering;
  if (
    !Number.isInteger(rendering?.angle) ||
    rendering.angle <= 0 ||
    rendering.angle >= 360 ||
    rendering.reverse !== null ||
    !Array.isArray(rendering.flip) ||
    rendering.flip.length !== 2 ||
    !Array.from(rendering.flip).every((value) => value === false)
  )
    return false;
  if (drawingQuadGeometry(source, { x: 0, y: 0 }).state !== 'mapped') return false;
  return (
    Number.isFinite(source.geometry?.width) &&
    source.geometry.width > 0 &&
    Number.isFinite(source.geometry?.height) &&
    source.geometry.height > 0
  );
}

export function drawingRotatedBounds(source) {
  if (!drawingRotatedGeometry(source)) return null;
  const points = source.rendering_corners;
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    declaredWidth: source.geometry.width,
    declaredHeight: source.geometry.height,
  };
}
