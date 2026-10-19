import { drawingAxisGeometry } from "./drawing-axis-geometry.mjs";

// 본문 어울림에 필요한 추가 조건만 소유합니다. 공통 도형/paint 검사는 호출자 책임입니다.
export function drawingWrapPagePolicyError(source, placement, grouped) {
  if (placement?.flow?.text_wrap !== 1 || grouped || !drawingAxisGeometry(source) || source.caption !== null
    || placement.position?.relations?.[2] !== 0) return "UnsupportedDrawingPageWrap";
  if (placement.position?.flags?.[1] !== false) return "UnsupportedDrawingFlowWithText";
  if (placement.position?.flags?.[2] !== true) return "UnsupportedDrawingOverlapPolicy";
  return null;
}
