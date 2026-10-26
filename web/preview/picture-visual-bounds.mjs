import { hwp5PictureShadowPlan } from "./hwp5-picture-shadow-plan.mjs";
import { hwp5PictureBorderPlan } from "./hwp5-picture-border-plan.mjs";
import { pictureShadowBounds } from "./picture-shadow-bounds.mjs";
import { inlinePictureRowPlacement } from "./inline-picture-row-placement.mjs";
import { affineBox } from "./affine-point-geometry.mjs";
import { rotatedPicturePlan } from "./rotated-picture-plan.mjs";

export function pictureVisualBounds(picture, rectangle) {
  if (
    !rectangle ||
    ![
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
      rectangle.x + rectangle.width,
      rectangle.y + rectangle.height,
    ].every(Number.isFinite) ||
    rectangle.width <= 0 ||
    rectangle.height <= 0
  )
    return null;
  const rotated = rotatedPicturePlan(picture);
  const includeCorners = (box) => {
    if (!rotated) return box;
    const b = rotated.bounds,
      left = Math.min(box.x, rectangle.x + b.x),
      top = Math.min(box.y, rectangle.y + b.y);
    const right = Math.max(box.x + box.width, rectangle.x + b.x + b.width),
      bottom = Math.max(box.y + box.height, rectangle.y + b.y + b.height);
    const result = { x: left, y: top, width: right - left, height: bottom - top };
    return Object.values(result).every(Number.isFinite) ? result : null;
  };
  const plan = hwp5PictureShadowPlan(picture);
  if (plan.state === "none") return includeCorners(rectangle);
  if (
    plan.state !== "outer" ||
    !rectangle ||
    ![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite) ||
    rectangle.width <= 0 ||
    rectangle.height <= 0
  )
    return null;
  const border = hwp5PictureBorderPlan(picture);
  const bounds = pictureShadowBounds(plan, border.state === "solid" ? border.width / 75 : 0);
  if (!bounds) return null;
  const sx = rectangle.width / plan.width,
    sy = rectangle.height / plan.height;
  const result = {
    x: rectangle.x - bounds.left * sx,
    y: rectangle.y - bounds.top * sy,
    width: bounds.width * sx,
    height: bounds.height * sy,
  };
  return Object.values(result).every(Number.isFinite) ? includeCorners(result) : null;
}

export function inlinePictureShadowExtent(index, rows, height) {
  const result = { top: 0, bottom: 0, height };
  for (const item of index.values()) {
    if (!item || hwp5PictureShadowPlan(item.picture).state !== "outer") continue;
    const bounds = pictureVisualBounds(item.picture, {
      x: 0,
      y: 0,
      width: item.width,
      height: item.height,
    });
    if (!bounds) continue;
    result.top = Math.max(result.top, -bounds.y);
    result.bottom = Math.max(result.bottom, bounds.y + bounds.height - item.height);
    for (const [i, row] of rows.entries()) {
      if (row.section !== item.picture.section || row.paragraph !== item.picture.paragraph)
        continue;
      const placed = inlinePictureRowPlacement(item, row, i);
      if (placed.state !== "placed") continue;
      const local = { ...bounds, x: placed.origin.x + bounds.x, y: placed.origin.y + bounds.y };
      const physical = row.transform === undefined ? local : affineBox(row.transform, local);
      if (physical) result.height = Math.max(result.height, physical.y + physical.height);
    }
  }
  return result;
}
