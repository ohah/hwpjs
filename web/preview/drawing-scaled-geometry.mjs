import { drawingQuadGeometry } from "./drawing-quad-geometry.mjs";

// 선언 크기는 로컬 배치, 양의 축 배율은 표시 변환으로 분리합니다.
export function drawingScaledGeometry(source) {
  const rendering = source?.rendering, matrix = rendering?.matrix;
  if (rendering?.angle !== 0 || rendering.reverse !== null || rendering.flip?.length !== 2 || !rendering.flip.every(v => v === false)
    || !Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(Number.isFinite)
    || matrix[0] <= 0 || matrix[4] <= 0 || matrix[1] !== 0 || matrix[3] !== 0 || matrix[2] !== 0 || matrix[5] !== 0) return false;
  if (drawingQuadGeometry(source, { x: 0, y: 0 }).state !== "mapped") return false;
  const [a, b, c, d] = source.rendering_corners;
  if (a[0] !== 0 || a[1] !== 0 || b[1] !== 0 || d[0] !== 0 || b[0] !== c[0] || c[1] !== d[1] || b[0] <= 0 || d[1] <= 0) return false;
  return Number.isFinite(source.geometry?.width) && source.geometry.width > 0 && Number.isFinite(source.geometry?.height) && source.geometry.height > 0;
}
