import { HWP5_STRUCTURAL_ANCHOR_KINDS } from "../../js/hwp5-structural-anchors.mjs";
/** Protected display coordinates; never removes units from the editing text. */
export function structuralAnchorUnits(paragraph) {
  const anchors = paragraph.structuralAnchors ?? [];
  if (!Array.isArray(anchors)) throw new Error("InvalidStructuralAnchorUnits");
  const units = new Set(), controls = new Set();
  for (const anchor of anchors) {
    if (!anchor || !HWP5_STRUCTURAL_ANCHOR_KINDS.includes(anchor.kind) || anchor.paragraph !== paragraph.paragraph || !Number.isSafeInteger(anchor.control_node) || anchor.control_node < 0 || controls.has(anchor.control_node) || !Number.isSafeInteger(anchor.unit) || anchor.unit < 0 || units.has(anchor.unit) || paragraph.text[anchor.unit] !== "\ufffc") throw new Error("InvalidStructuralAnchorUnits");
    controls.add(anchor.control_node); units.add(anchor.unit);
  }
  return units;
}

export function isStructuralAnchor(paragraph, unit) {
  return paragraph?.structuralAnchors?.some(anchor => anchor.unit === unit && anchor.paragraph === paragraph.paragraph && HWP5_STRUCTURAL_ANCHOR_KINDS.includes(anchor.kind)) === true;
}
