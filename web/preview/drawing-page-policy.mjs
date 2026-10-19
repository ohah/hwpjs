import { drawingAxisGeometry } from "./drawing-axis-geometry.mjs";
import { drawingRotatedGeometry } from "./drawing-rotated-geometry.mjs";
import { drawingScaledGeometry } from "./drawing-scaled-geometry.mjs";
import { drawingWrapPagePolicyError } from "./drawing-wrap-page-policy.mjs";

export function drawingPagePolicyError(source, placement, grouped, fill, allowRestricted = false, allowWrap = false) {
  if (!grouped && !(drawingAxisGeometry(source) || drawingRotatedGeometry(source) || drawingScaledGeometry(source))) return "UnsupportedDrawingPageGeometry";
  if (!grouped && fill !== "none" && !drawingAxisGeometry(source)) return "UnsupportedDrawingPageFill";
  if (source.paint?.shadow_type !== 0) return "UnsupportedDrawingPageShadow";
  if (placement.flow?.text_wrap === 1) {
    return allowWrap ? drawingWrapPagePolicyError(source, placement, grouped) : "UnsupportedDrawingPageWrap";
  } else if (placement.flow?.text_wrap !== 3) return "UnsupportedDrawingPageWrap";
  if (allowRestricted && !grouped && drawingAxisGeometry(source) && source.caption === null
    && placement.position?.relations?.[0] === 2 && placement.position?.flags?.[1] === true
    && typeof placement.position?.flags?.[2] === "boolean") return null;
  if (placement.position?.flags?.[1] !== false) return "UnsupportedDrawingFlowWithText";
  if (placement.position?.flags?.[2] !== true) return "UnsupportedDrawingOverlapPolicy";
  return null;
}
