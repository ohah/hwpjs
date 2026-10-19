import { hwpUnitPixels } from "./hwp-units.mjs";

/** Build physical reference boxes from one explicit declaration, never a viewport. */
export function pageReferenceBoxes(setting, origin, pageOrdinal = 0) {
  const invalid = { state: "unsupported_page_geometry" };
  if (!setting || !origin || ![origin.x, origin.y].every(Number.isFinite) || !Number.isSafeInteger(pageOrdinal) || pageOrdinal < 0) return invalid;
  const { margin, orientation, gutter_type: gutterType } = setting;
  const units = [setting.width, setting.height, margin?.left, margin?.right, margin?.top, margin?.bottom, margin?.gutter, margin?.header, margin?.footer];
  if (!units.every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff) || setting.width === 0 || setting.height === 0 || setting.duplicate_margins !== 0) return invalid;
  // Nonzero/asymmetric mirrored binding still requires binding-side ownership.
  const symmetricMirrored = gutterType === "left_right" && margin.gutter === 0 && margin.left === margin.right;
  if (!["widely", "narrowly"].includes(orientation) || (gutterType !== "left_only" && !symmetricMirrored)) return invalid;
  let [width, height, left, right, top, bottom, gutter, header, footer] = units.map(hwpUnitPixels);
  if (orientation === "narrowly") [width, height] = [height, width];
  left += gutter;
  top += header;
  bottom += footer;
  if (width <= left + right || height <= top + bottom) return invalid;
  const paper = { x: origin.x, y: origin.y, width, height };
  const page = { x: origin.x + left, y: origin.y + top, width: width - left - right, height: height - top - bottom };
  if (![paper.x + paper.width, paper.y + paper.height, page.x + page.width, page.y + page.height].every(Number.isFinite)) return invalid;
  return { state: "placed", boxes: { paper, page } };
}
