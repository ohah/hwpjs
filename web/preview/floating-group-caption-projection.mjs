import { layoutDrawingCaption } from "./drawing-caption-layout.mjs";

// Caption policy stays shared with drawings; only physical group ownership is adapted.
export function projectFloatingGroupCaption(root, placement, paragraphs, measure, options = {}) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !root ||
    root.source?.group_context !== null ||
    root.source.geometry?.treat_as_character !== false ||
    root.source.container_node !== root.containerNode ||
    placement?.section !== root.section ||
    placement.containerNode !== root.containerNode ||
    !Number.isSafeInteger(placement.pageOrdinal) ||
    placement.pageOrdinal < 0 ||
    (placement.columnOrdinal !== undefined &&
      (!Number.isSafeInteger(placement.columnOrdinal) || placement.columnOrdinal < 0)) ||
    !placement.rectangle ||
    ![
      placement.rectangle.x,
      placement.rectangle.y,
      placement.rectangle.width,
      placement.rectangle.height,
      placement.rectangle.x + placement.rectangle.width,
      placement.rectangle.y + placement.rectangle.height,
    ].every(Number.isFinite) ||
    placement.rectangle.width <= 0 ||
    placement.rectangle.height <= 0
  )
    return fail("InvalidFloatingGroupCaptionPlacement");
  if (root.source.has_caption !== (root.source.caption !== null))
    return fail("InvalidFloatingGroupCaptionSource");
  if (!root.source.has_caption)
    return { state: "positioned", rows: [], bounds: { ...placement.rectangle } };
  const caption = layoutDrawingCaption(
    { ...root, drawingNode: root.containerNode },
    paragraphs,
    placement.rectangle,
    measure,
    options,
  );
  if (caption.state !== "positioned") return caption;
  return {
    ...caption,
    rows: caption.rows.map((row) => ({
      ...row,
      pageOrdinal: placement.pageOrdinal,
      ...(placement.columnOrdinal === undefined ? {} : { columnOrdinal: placement.columnOrdinal }),
    })),
  };
}
