import { curveRenderingMatrix } from "./curve-rendering-geometry.mjs";
import { affineBox } from "./affine-point-geometry.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { validGroupContext } from "../../js/hwpx-group-context.mjs";

// Explicit candidate basis, not a fallback from zero curSz or sampled ink bounds.
export function curveTextFrame(source, projected) {
  const fail = error => ({ state: "unavailable", error });
  const original = source?.common?.component_sizes?.original, matrix = curveRenderingMatrix(source);
  if (source?.sourceOnly !== true || !Number.isInteger(source.node) || source.node < 0 || source.node > 0xffffffff
    || !source.common?.group_context || !validGroupContext(source.common.group_context, source.node)
    || projected?.state !== "placed" || projected.curveNode !== source.node
    || projected.rootNode !== source.common?.group_context?.root_anchor) return fail("CurveTextFrameBindingMismatch");
  if (!original || ![original.width, original.height].every(v => Number.isInteger(v) && v > 0 && v <= 0xffffffff)) return fail("MissingCurveOriginalFrame");
  if (!matrix || matrix[1] !== 0 || matrix[2] !== 0 || matrix[0] <= 0 || matrix[3] <= 0) return fail("UnsupportedCurveTextFrameTransform");
  const frame = affineBox(matrix, { x: 0, y: 0, width: original.width, height: original.height });
  const lastWidth = source.text?.last_width;
  if (!frame || !Number.isInteger(lastWidth) || lastWidth <= 0 || lastWidth > 0xffffffff
    || Math.abs(frame.width - lastWidth) > 1) return fail("CurveTextFrameWidthMismatch");
  const origin = projected.rootRectangle;
  if (!origin || ![origin.x, origin.y, origin.width, origin.height, origin.x + origin.width, origin.y + origin.height].every(Number.isFinite)
    || origin.width <= 0 || origin.height <= 0) return fail("MissingCurveTextFrameOrigin");
  const rectangle = { x: origin.x + hwpUnitPixels(frame.x), y: origin.y + hwpUnitPixels(frame.y),
    width: hwpUnitPixels(frame.width), height: hwpUnitPixels(frame.height) };
  if (![...Object.values(rectangle), rectangle.x + rectangle.width, rectangle.y + rectangle.height].every(Number.isFinite)) return fail("InvalidCurveTextFrame");
  return { state: "selected", basis: "original-component-rendering", rectangle, widthToleranceHwpUnits: 1 };
}
