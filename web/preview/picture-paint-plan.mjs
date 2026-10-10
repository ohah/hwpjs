import { pictureQuadTransform } from "./picture-quad-transform.mjs";

export function picturePaintPlan(picture) {
  if (picture.paintError != null) return { state: "unsupported_transform", error: picture.paintError };
  if (picture.transform?.identity === true) return { state: "plain" };
  const transform = picture.transform;
  if (!transform || transform.angle !== 0 || (transform.reverse !== false && !(transform.reverse === null && transform.reverseApplicable === false)) || transform.flip?.length !== 2 || !transform.flip.every(value => value === false) || transform.unknownMatrixNodes !== 0) return { state: "unsupported_transform" };
  const mapped = pictureQuadTransform(picture.renderingCorners);
  if (mapped.state !== "mapped") return { state: "unsupported_transform" };
  const [a, b, c, d, e, f] = mapped.matrix;
  // 현재 배치 사각형에 직접 연결 가능한 양의 축 정렬·원점 0 변환만 허용합니다.
  if (b !== 0 || c !== 0 || e !== 0 || f !== 0 || a <= 0 || d <= 0) return { state: "unsupported_transform" };
  return { state: "quad", corners: picture.renderingCorners, width: a, height: d };
}
