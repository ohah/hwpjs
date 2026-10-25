import { pageVisibleRectangle } from "./page-visible-rectangle.mjs";

// Clip the paint/hit region, never the source rectangle or its resize axes.
export function clipCellOverlayPicture(picture, paper) {
  const fail = () => ({ state: "unavailable", error: "InvalidCellOverlayPageClip" });
  if (!picture) return fail();
  const clipped = pageVisibleRectangle(picture.pageClip === undefined ? paper : picture.pageClip, paper);
  if (clipped.state === "invalid_page_clip" || !Number.isSafeInteger(picture.pageOrdinal) || picture.pageOrdinal < 0) return fail();
  return { state: "clipped", picture: { ...picture,
    pageClip: clipped.rectangle ?? { x: paper.x, y: paper.y, width: 0, height: 0 } } };
}
