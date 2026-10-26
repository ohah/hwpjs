import { projectFloatingPicturePage } from "./picture-page-projection.mjs";
import { rootPicturePagePolicyError } from "./root-picture-page-policy.mjs";
import { layoutPictureCaption } from "./picture-caption-layout.mjs";

// Layered root pictures do not reserve body flow. Other wrap modes need pagination.
export function projectRootPicturePage(picture, paragraphs, rows, measure, options = {}) {
  const fail = (error) => ({ state: "unavailable", error });
  const policyReason = rootPicturePagePolicyError(picture);
  if (policyReason)
    return {
      ...fail("UnsupportedRootPicturePagePolicy"),
      policyReason,
      section: picture?.section,
      paragraph: picture?.paragraph,
      pictureNode: picture?.pictureNode,
    };
  const placed = projectFloatingPicturePage(picture, paragraphs, rows);
  if (placed.state !== "placed") return placed;
  const members = paragraphs.filter(
    (row) =>
      row.section === picture.section && row.drawingCaption?.drawingNode === picture.pictureNode,
  );
  if (!picture.caption && members.length) return fail("PictureCaptionSourceMismatch");
  if (!picture.caption) return { ...placed, rows: [] };
  const caption = layoutPictureCaption(picture, paragraphs, placed.rectangle, measure, options);
  if (caption.state !== "positioned") return caption;
  return {
    ...placed,
    captionRectangle: caption.captionRectangle,
    bounds: caption.bounds,
    rows: caption.rows.map((row) => ({
      ...row,
      pageOrdinal: placed.pageOrdinal,
      referenceBoxes: placed.referenceBoxes,
    })),
  };
}
