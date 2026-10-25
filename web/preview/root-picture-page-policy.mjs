import { picturePaintPlan } from "./picture-paint-plan.mjs";

/** Layer-only root projection; wrapping belongs to body pagination. */
export function rootPicturePagePolicyError(picture) {
  if (!picture?.owner || picture.owner.anchorNode !== picture.pictureNode) return "MissingRootPictureOwner";
  if (picture.geometry?.treatAsCharacter !== false) return "UnsupportedRootInlinePicture";
  if (![2, 3].includes(picture.flow?.textWrap)) return "UnsupportedRootPictureWrap";
  if (picture.position?.flags?.[0] !== false) return "UnsupportedRootPictureFlowFlag";
  if (picturePaintPlan(picture).state === "unsupported_transform") return "UnsupportedRootPictureTransform";
  return null;
}
