import { signedInt32 } from "./signed-int32.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// Resolve a paragraph-relative, non-overlapping floating table reservation.
// The caller owns the current paragraph anchor and occupied content boundary.
export function reserveTableVerticalFlow(source, bounds) {
  if (!bounds) return { state: "unavailable", error: "InvalidTableVerticalFlow" };
  const { anchorY, occupiedBottom, height, pageTop, pageBottom } = bounds;
  const geometry = source?.geometry;
  if (geometry?.treat_as_character !== false || source.vertical_relative !== 2 || source.vertical_alignment !== 0 || source.flow_with_text !== true || source.allow_overlap !== false) return { state: "unavailable", error: "UnsupportedTableVerticalFlow" };
  const offset = signedInt32(geometry.vertical_offset);
  if (offset === null || ![anchorY, occupiedBottom, height, pageTop, pageBottom].every(Number.isFinite) || height <= 0 || pageBottom <= pageTop || anchorY < pageTop || anchorY > pageBottom || occupiedBottom < pageTop || occupiedBottom > pageBottom || !Number.isFinite(pageBottom - pageTop)) return { state: "unavailable", error: "InvalidTableVerticalFlow" };
  if (height > pageBottom - pageTop) return { state: "unavailable", error: "TableVerticalFlowHeightOverflow" };
  const requestedY = anchorY + hwpUnitPixels(offset);
  const y = Math.max(pageTop, occupiedBottom, requestedY), bottom = y + height;
  if (![requestedY, y, bottom].every(Number.isFinite)) return { state: "unavailable", error: "InvalidTableVerticalFlow" };
  if (bottom > pageBottom) return { state: "next-page", requestedY, height };
  return { state: "reserved", requestedY, y, bottom, gap: y - occupiedBottom };
}
