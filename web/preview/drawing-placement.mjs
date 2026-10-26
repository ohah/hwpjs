import { placeFloatingComponentSource } from './component-placement.mjs';

// RHWP 호환 방향 정책입니다. mirrored 제본은 페이지 기준 영역 단계에서 거부합니다.
export const drawingPagePlacementOptions = Object.freeze({
  edgePolicy: 'inside-start-outside-end',
});

// 도형 원값을 공통 배치 입력으로 변환합니다. 기준 영역은 호출자가 소유합니다.
export function placeFloatingDrawing(drawing, boxes, options) {
  return placeFloatingComponentSource(drawing?.source, boxes, options);
}
