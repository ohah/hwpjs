import { pictureQuadTransform } from './picture-quad-transform.mjs';
import { inverseAffine, affinePoint } from './affine-point-geometry.mjs';

// 내부 좌표는 정규화된 도형 영역입니다. 문단 조판 좌표와 혼동하지 않습니다.
export function drawingQuadGeometry(source, origin) {
  const mapped = pictureQuadTransform(source?.rendering_corners, origin);
  if (mapped.state !== 'mapped') return mapped;
  const inverse = inverseAffine(mapped.matrix);
  if (!inverse) return { state: 'noninvertible_drawing' };
  return { state: 'mapped', matrix: mapped.matrix, inverse };
}

export function drawingLocalPoint(geometry, point) {
  return geometry?.state === 'mapped' ? affinePoint(geometry.inverse, point) : null;
}
