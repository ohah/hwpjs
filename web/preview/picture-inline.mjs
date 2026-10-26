import { hwpUnitPixels } from "./hwp-units.mjs";
import { pictureCropRect } from "./picture-crop-geometry.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { pictureCropSourceOptions } from "./picture-crop-source.mjs";
import { hasFinitePictureCrop } from "./picture-source-validation.mjs";
import { hwp5PictureBorderPlan } from "./hwp5-picture-border-plan.mjs";
import { paintPictureBorder } from "./picture-border-paint.mjs";
import { hwp5PictureShadowPlan } from "./hwp5-picture-shadow-plan.mjs";
import { paintPictureShadow } from "./picture-shadow-paint.mjs";
export const picturePositionKey = (section, paragraph, unit) => `${section}:${paragraph}:${unit}`;
export function inlinePictureIndex(content) {
  const index = new Map();
  for (const picture of content.pictures ?? []) {
    const geometry = picture.geometry;
    const paintPlan = picturePaintPlan(picture);
    if (
      picture.state !== "located" ||
      paintPlan.state === "unsupported_transform" ||
      geometry?.treatAsCharacter !== true ||
      geometry.widthRelative !== 4 ||
      geometry.heightRelative !== 2 ||
      ![geometry.width, geometry.height].every(
        (value) => Number.isInteger(value) && value > 0 && value <= 4294967295,
      ) ||
      !hasFinitePictureCrop(picture)
    )
      continue;
    const paragraph = content.paragraphs.find(
      (p) => p.section === picture.section && p.paragraph === picture.paragraph,
    );
    if (paragraph?.text[picture.anchorUnit] !== "\ufffc") continue;
    const key = picturePositionKey(picture.section, picture.paragraph, picture.anchorUnit);
    if (index.has(key)) {
      index.set(key, null);
      continue;
    }
    index.set(key, {
      picture,
      paintPlan,
      width: paintPlan.width ?? hwpUnitPixels(geometry.width),
      height: paintPlan.height ?? hwpUnitPixels(geometry.height),
    });
  }
  return index;
}
export function paintInlinePicture(ctx, bitmap, item, x, y) {
  const border = hwp5PictureBorderPlan(item.picture);
  const shadow = hwp5PictureShadowPlan(item.picture);
  if (shadow.state === "unavailable") return false;
  if (item.picture.paintError != null || border.state === "unavailable") return false;
  const options = pictureCropSourceOptions(item.picture.crop);
  const crop = pictureCropRect(item.picture.crop.clip, bitmap.width, bitmap.height, options);
  if (crop.state !== "mapped") return false;
  const source = crop.rectangle;
  if (shadow.state === "outer")
    return paintPictureShadow(ctx, bitmap, item, x, y, source, border, shadow);
  ctx.drawImage(
    bitmap,
    source.x,
    source.y,
    source.width,
    source.height,
    x,
    y,
    item.width,
    item.height,
  );
  paintPictureBorder(ctx, border, item, x, y);
  return true;
}
