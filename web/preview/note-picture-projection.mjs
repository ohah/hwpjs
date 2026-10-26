import { translatePicturePlacement } from "./picture-placement-translation.mjs";
/** Move only proven local picture rectangles; source/cell identities are unchanged. */
export function projectNoteFlowPictures(pictures, x, y, physical = {}, bounds = null) {
  const fail = () => ({ state: "unavailable", error: "InvalidNotePicturePlacement" });
  if (!Array.isArray(pictures) || ![x, y].every(Number.isFinite)) return fail();
  if (
    !physical ||
    typeof physical !== "object" ||
    ["pageOrdinal", "columnOrdinal"].some(
      (key) =>
        physical[key] !== undefined && (!Number.isSafeInteger(physical[key]) || physical[key] < 0),
    )
  )
    return fail();
  const target = Object.fromEntries(
    ["pageOrdinal", "columnOrdinal", "referenceBoxes"]
      .filter((key) => physical[key] !== undefined)
      .map((key) => [key, physical[key]]),
  );
  if (
    pictures.length &&
    bounds !== null &&
    ![bounds?.width, bounds?.height].every((n) => Number.isFinite(n) && n > 0)
  )
    return fail();
  const result = [],
    identities = new Set();
  for (const picture of pictures) {
    const box = picture?.rectangle,
      key = `${picture?.section}:${picture?.pictureNode}`;
    if (
      !picture ||
      !Number.isSafeInteger(picture.section) ||
      picture.section < 0 ||
      !Number.isSafeInteger(picture.pictureNode) ||
      picture.pictureNode < 0 ||
      identities.has(key) ||
      !box ||
      ![
        box.x,
        box.y,
        box.width,
        box.height,
        box.x + box.width,
        box.y + box.height,
        box.x + x,
        box.y + y,
        box.x + x + box.width,
        box.y + y + box.height,
      ].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0
    )
      return fail();
    if (
      bounds &&
      (box.x < 0 ||
        box.y < 0 ||
        box.x + box.width > bounds.width + 1e-8 ||
        box.y + box.height > bounds.height + 1e-8)
    )
      return fail();
    identities.add(key);
    const moved = translatePicturePlacement(picture, x, y, target);
    if (moved.state !== "translated") return fail();
    result.push(moved.picture);
  }
  return { state: "projected", pictures: result };
}
