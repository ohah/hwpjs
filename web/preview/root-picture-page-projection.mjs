import { projectFloatingPicturePage } from "./picture-page-projection.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { layoutPictureCaption } from "./picture-caption-layout.mjs";

// Layered root pictures do not reserve body flow. Other wrap modes need pagination.
export function projectRootPicturePage(picture, paragraphs, rows, measure, options = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (!picture?.owner || picture.owner.anchorNode !== picture.pictureNode
    || picture.geometry?.treatAsCharacter !== false || ![2, 3].includes(picture.flow?.textWrap)
    || picture.position?.flags?.[0] !== false || picturePaintPlan(picture).state === "unsupported_transform") return fail("UnsupportedRootPicturePagePolicy");
  const placed = projectFloatingPicturePage(picture, paragraphs, rows);
  if (placed.state !== "placed") return placed;
  const members = paragraphs.filter(row => row.section === picture.section && row.drawingCaption?.drawingNode === picture.pictureNode);
  if (!picture.caption && members.length) return fail("PictureCaptionSourceMismatch");
  if (!picture.caption) return { ...placed, rows: [] };
  const caption = layoutPictureCaption(picture, paragraphs, placed.rectangle, measure, options);
  if (caption.state !== "positioned") return caption;
  return { ...placed, captionRectangle: caption.captionRectangle, bounds: caption.bounds,
    rows: caption.rows.map(row => ({ ...row, pageOrdinal: placed.pageOrdinal, referenceBoxes: placed.referenceBoxes })) };
}
