import { hwpUnitPixels } from "./hwp-units.mjs";
import { layoutDrawingCaption } from "./drawing-caption-layout.mjs";
import { captionBoundsInsets } from "./caption-bounds-insets.mjs";

// Root group origin is unchanged; the caller owns the final page placement.
export function reserveInlineGroupCaption(root, paragraphs, measure, { maxRows = 20000 } = {}) {
  const fail = (error) => ({ state: "unavailable", error });
  const source = root?.source;
  if (
    !source ||
    source.group_context !== null ||
    source.container_node !== root.containerNode ||
    !Number.isSafeInteger(root.containerNode) ||
    root.containerNode < 0 ||
    source.has_caption !== true ||
    !source.caption ||
    !Array.isArray(paragraphs) ||
    typeof measure !== "function" ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    ![source.geometry?.width, source.geometry?.height].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff,
    ) ||
    !Array.isArray(source.flow?.outside_margins) ||
    source.flow.outside_margins.length !== 4 ||
    !source.flow.outside_margins.every(
      (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff,
    )
  )
    return fail("InvalidInlineGroupCaptionSource");
  const rectangle = {
    x: 0,
    y: 0,
    width: hwpUnitPixels(source.geometry.width),
    height: hwpUnitPixels(source.geometry.height),
  };
  const caption = layoutDrawingCaption(
    { ...root, drawingNode: root.containerNode },
    paragraphs,
    rectangle,
    measure,
    { maxRows },
  );
  if (caption.state !== "positioned") return caption;
  const [left, right, top, bottom] = source.flow.outside_margins.map(hwpUnitPixels);
  const insets = captionBoundsInsets(rectangle, caption.bounds, { left, right, top, bottom });
  if (!insets) return fail("InvalidInlineGroupCaptionReservation");
  const width = rectangle.width + insets.left + insets.right,
    height = rectangle.height + insets.top + insets.bottom;
  if (![width, height].every((value) => Number.isFinite(value) && value > 0))
    return fail("InvalidInlineGroupCaptionReservation");
  return {
    state: "reserved",
    rectangle,
    caption,
    outerInsets: insets,
    width,
    height,
    rowCount: caption.rows.length,
  };
}
