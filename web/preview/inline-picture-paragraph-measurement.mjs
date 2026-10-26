import { measureInlineObjectParagraph } from "./inline-object-paragraph-measurement.mjs";
import { inlinePictureCaptionFrame } from "./inline-picture-caption-flow.mjs";

// Only complete picture-anchor ownership uses this path; other hosts keep
// their existing object/column-specific measurement owner.
export function measureInlinePictureParagraph(
  paragraph,
  index,
  width,
  measure,
  maxRows,
  captionParagraphs,
) {
  const entries = [...index.values()]
    .filter(
      (item) =>
        item?.picture.section === paragraph.section &&
        item.picture.paragraph === paragraph.paragraph,
    )
    .map((item) => ({
      objectNode: item.picture.pictureNode,
      unit: item.picture.anchorUnit,
      width: item.width,
      height: item.height,
    }));
  if (!entries.length || paragraph.text.split("\ufffc").length - 1 !== entries.length) return null;
  if (captionParagraphs)
    for (const entry of entries) {
      const item = [...index.values()].find(
        (item) =>
          item?.picture.section === paragraph.section &&
          item.picture.pictureNode === entry.objectNode,
      );
      const frame = inlinePictureCaptionFrame(item, captionParagraphs, measure, maxRows);
      if (frame.state === "unavailable") return frame;
      entry.height = frame.height;
    }
  return measureInlineObjectParagraph(paragraph, entries, width, measure, {
    maxRows,
    allowLineOverflow: true,
  });
}
