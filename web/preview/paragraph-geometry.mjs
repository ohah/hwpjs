// Display margins and offsets; line-alignment owns spacing distribution.
import { hwpUnitPixels } from "./hwp-units.mjs";
import { paragraphAlignmentKey } from "./paragraph-alignments.mjs";
// Paragraph margins use twice the coordinate scale; line spacing does not.
export const paragraphMarginPixels = value => Number.isInteger(value) ? hwpUnitPixels(value) / 2 : 0;
export const paragraphSpacePixels = value => Math.max(0, paragraphMarginPixels(value));
export function paragraphSpacing(shape) {
  const modern = shape?.modernSpacing;
  return { kind: modern ? modern.attributes & 31 : shape?.legacySpacingKind, value: modern ? modern.value : shape?.legacySpacing };
}
export function paragraphLineAdvance(shape, textHeight, baselineHeight) {
  if (!shape) return baselineHeight;
  const { kind, value } = paragraphSpacing(shape);
  if (!Number.isInteger(value) || value < 0) return baselineHeight;
  const advance = kind === 0 ? textHeight * value / 100
    : kind === 1 || kind === 3 ? hwpUnitPixels(value)
    : kind === 2 ? textHeight + hwpUnitPixels(value) : baselineHeight;
  // Prototype baseline padding prevents overlapping editable row hit regions.
  return Math.max(baselineHeight, advance);
}
export function paragraphLineGeometry(shape, width, measuredWidth, firstLine) {
  const pixels = paragraphMarginPixels;
  const left = pixels(shape?.left), right = pixels(shape?.right);
  const indent = firstLine ? pixels(shape?.indent) : 0;
  const start = Math.min(Math.max(0, width - 1), Math.max(0, left + indent));
  const available = Math.max(1, width - start - Math.max(0, right));
  const slack = Math.max(0, available - Math.max(1, measuredWidth));
  const alignment = paragraphAlignmentKey(shape?.alignment);
  const offset = alignment === "RIGHT" ? slack : alignment === "CENTER" ? slack / 2 : 0;
  return { x: start + offset, width: available };
}
