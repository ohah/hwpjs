import { pictureQuadTransform } from "./picture-quad-transform.mjs";
import { hwp5PictureBorderPlan } from "./hwp5-picture-border-plan.mjs";
import { hwp5PictureShadowPlan } from "./hwp5-picture-shadow-plan.mjs";
import { rotatedPicturePlan } from "./rotated-picture-plan.mjs";

export function picturePaintPlan(picture) {
  if (picture.paintError != null)
    return { state: "unsupported_transform", error: picture.paintError };
  const border = hwp5PictureBorderPlan(picture);
  if (border.state === "unavailable")
    return { state: "unsupported_transform", error: border.error };
  const shadow = hwp5PictureShadowPlan(picture);
  if (shadow.state === "unavailable")
    return { state: "unsupported_transform", error: shadow.error };
  if (
    picture.transform?.identity === true &&
    (picture.transform.angle === undefined || picture.transform.angle === 0)
  )
    return { state: "plain" };
  const transform = picture.transform;
  if (
    !transform ||
    (transform.reverse !== false &&
      !(transform.reverse === null && transform.reverseApplicable === false)) ||
    !Array.isArray(transform.flip) ||
    transform.flip.length !== 2 ||
    !Array.from(transform.flip).every((value) => value === false) ||
    transform.unknownMatrixNodes !== 0
  )
    return { state: "unsupported_transform" };
  if (transform.angle !== 0)
    return border.state === "none" && shadow.state === "none"
      ? (rotatedPicturePlan(picture) ?? { state: "unsupported_transform" })
      : { state: "unsupported_transform" };
  const mapped = pictureQuadTransform(picture.renderingCorners);
  if (mapped.state !== "mapped") return { state: "unsupported_transform" };
  const [a, b, c, d, e, f] = mapped.matrix;
  // Preserve zero-angle matrix residuals only within the same integer source
  // frame contract used for rotated images. Do not erase them by snapping.
  if (b !== 0 || c !== 0 || a <= 0 || d <= 0) return { state: "unsupported_transform" };
  if (e !== 0 || f !== 0)
    return border.state === "none" && shadow.state === "none"
      ? (rotatedPicturePlan(picture) ?? { state: "unsupported_transform" })
      : { state: "unsupported_transform" };
  return { state: "quad", corners: picture.renderingCorners, width: a, height: d };
}
