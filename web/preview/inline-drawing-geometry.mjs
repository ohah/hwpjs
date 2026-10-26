import { drawingAxisGeometry } from "./drawing-axis-geometry.mjs";
import { drawingScaledGeometry } from "./drawing-scaled-geometry.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

export function inlineDrawingGeometry(source) {
  const fail = () => ({ state: "unavailable", error: "UnsupportedInlineDrawingGeometry" });
  if (source?.geometry?.treat_as_character !== true) return fail();
  const axis = drawingAxisGeometry(source);
  if (!axis && !drawingScaledGeometry(source)) return fail();
  const width = hwpUnitPixels(axis ? source.geometry.width : source.rendering_corners[1][0]);
  const height = hwpUnitPixels(axis ? source.geometry.height : source.rendering_corners[3][1]);
  if (![width, height].every((v) => Number.isFinite(v) && v > 0)) return fail();
  // Positive axis resize changes the text area, not document font/table sizes.
  // Rounding differences between declared size and corners must not switch
  // the text coordinate system or multiply owned tables a second time.
  return { state: "selected", mode: "axis", rectangle: { x: 0, y: 0, width, height } };
}
