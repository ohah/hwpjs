// 자식 로컬 축의 편집 크기만 계산하며 부모 표시 geometry는 변경하지 않습니다.
export function hwp5PictureResizeGeometry(corners, rootGeometry) {
  if (rootGeometry?.width_relative !== 4 || rootGeometry?.height_relative !== 2) return null;
  if (
    !Array.isArray(corners) ||
    corners.length !== 4 ||
    corners.some(
      (point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite),
    )
  )
    return null;
  const x = corners[1].map((value, i) => value - corners[0][i]);
  const y = corners[3].map((value, i) => value - corners[0][i]);
  const determinant = x[0] * y[1] - x[1] * y[0];
  if (!Number.isFinite(determinant) || determinant === 0) return null;
  const [width, height] = [x, y].map((axis) => Math.round(Math.hypot(...axis)));
  if (
    ![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 0xffffffff)
  )
    return null;
  return { width, height, widthRelative: 4, heightRelative: 2 };
}
