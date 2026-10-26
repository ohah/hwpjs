import { projectGroupedShape } from './grouped-shape-page-projection.mjs';

// 채우기 영역과 테두리 원점을 분리해 자식의 이동을 두 번 적용하지 않습니다.
export function projectGroupedRectangle(drawing, root, paragraphs, pageRows) {
  const projected = projectGroupedShape(drawing, root, paragraphs, pageRows);
  if (projected.state !== 'placed') return projected;
  const [a, b, c, d] = projected.points;
  if (
    a[1] !== b[1] ||
    b[0] !== c[0] ||
    c[1] !== d[1] ||
    d[0] !== a[0] ||
    b[0] <= a[0] ||
    d[1] <= a[1]
  )
    return { state: 'unavailable', error: 'UnsupportedGroupedRectangleTransform' };
  return {
    ...projected,
    origin: { x: projected.rectangle.x, y: projected.rectangle.y },
    rectangle: { x: a[0], y: a[1], width: b[0] - a[0], height: d[1] - a[1] },
  };
}
