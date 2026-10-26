import { layoutDrawingCaption } from "./drawing-caption-layout.mjs";

// Picture captions retain native drawing-list ownership; only display row tags change.
export function layoutPictureCaption(picture, paragraphs, rectangle, measure, options = {}) {
  const id = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (
    !picture?.caption ||
    !id(picture.pictureNode) ||
    !id(picture.section) ||
    !Array.isArray(picture.flow?.outsideMargins) ||
    picture.flow.outsideMargins.length !== 4 ||
    !picture.flow.outsideMargins.every(
      (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff,
    )
  ) {
    return { state: "unavailable", error: "MissingPictureCaptionSource" };
  }
  const drawing = {
    section: picture.section,
    drawingNode: picture.pictureNode,
    source: { caption: picture.caption, flow: { outside_margins: picture.flow.outsideMargins } },
  };
  const result = layoutDrawingCaption(drawing, paragraphs, rectangle, measure, options);
  if (result.state !== "positioned") return result;
  return {
    ...result,
    rows: result.rows.map((row) => {
      const { drawingNode, ...remaining } = row;
      return { ...remaining, pictureNode: drawingNode };
    }),
  };
}
