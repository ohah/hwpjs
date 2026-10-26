// 축 정렬 배율은 이미 변환된 꼭짓점에서 검사합니다. 텍스트를 다시 배율 변환하지 않습니다.
export function drawingAxisGeometry(source) {
  const matrix = source?.rendering?.matrix,
    points = source?.rendering_corners;
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 6 ||
    !matrix.every(Number.isFinite) ||
    matrix[0] <= 0 ||
    matrix[4] <= 0 ||
    matrix[1] !== 0 ||
    matrix[3] !== 0 ||
    matrix[2] !== 0 ||
    matrix[5] !== 0
  )
    return false;
  if (
    source.rendering.angle !== 0 ||
    !Array.isArray(source.rendering.flip) ||
    source.rendering.flip.length !== 2 ||
    !source.rendering.flip.every((v) => v === false) ||
    source.rendering.reverse !== null
  )
    return false;
  if (
    !Array.isArray(points) ||
    points.length !== 4 ||
    !points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
  )
    return false;
  const [a, b, c, d] = points;
  if (a[0] !== 0 || a[1] !== 0 || b[1] !== 0 || d[0] !== 0 || b[0] !== c[0] || c[1] !== d[1])
    return false;
  return (
    Math.round(b[0]) === source.geometry?.width && Math.round(d[1]) === source.geometry?.height
  );
}
