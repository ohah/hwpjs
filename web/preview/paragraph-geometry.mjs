// Display margins and offsets; line-alignment owns spacing distribution.
import { hwpUnitPixels } from './hwp-units.mjs';
import { paragraphAlignmentKey } from './paragraph-alignments.mjs';
import { hwp5LineSpacing } from './hwp5-line-spacing.mjs';
import { currentParagraphSpacing } from './paragraph-spacing-source.mjs';
export const paragraphSpacing = (shape) =>
  currentParagraphSpacing(shape) ?? { kind: undefined, value: undefined };
// Raw paragraph margins use twice the coordinate scale.
export const paragraphMarginPixels = (value) =>
  Number.isInteger(value) ? hwpUnitPixels(value) / 2 : 0;
export const paragraphSpacePixels = (value) => Math.max(0, paragraphMarginPixels(value));
export function paragraphLineAdvance(
  shape,
  textHeight,
  baselineHeight,
  { spacingBasisHeight = textHeight } = {},
) {
  if (!shape) return baselineHeight;
  const { kind, value } = paragraphSpacing(shape);
  if (!Number.isInteger(value) || value < 0) return baselineHeight;
  if (!Number.isFinite(textHeight) || textHeight < 0) return baselineHeight;
  if (shape.spacingFormat === 'hwpx') {
    return kind === 0
      ? (textHeight * value) / 100
      : kind === 1
        ? hwpUnitPixels(value)
        : kind === 2
          ? textHeight + hwpUnitPixels(value)
          : kind === 3
            ? Math.max(textHeight, hwpUnitPixels(value))
            : baselineHeight;
  }
  if (!Number.isFinite(spacingBasisHeight) || spacingBasisHeight < 0) return baselineHeight;
  const result = hwp5LineSpacing(kind, value, Math.round(textHeight * 75), {
    basisHeight: Math.round(spacingBasisHeight * 75),
  });
  // Relative units require a document font basis; never invent one from row ink.
  return result && result.advance >= 0 ? hwpUnitPixels(result.advance) : baselineHeight;
}
export function paragraphLineGeometry(shape, width, measuredWidth, firstLine) {
  const pixels = paragraphMarginPixels;
  const left = pixels(shape?.left),
    right = pixels(shape?.right);
  const declaredIndent = pixels(shape?.indent);
  const indent =
    declaredIndent < 0 ? (firstLine ? 0 : -declaredIndent) : firstLine ? declaredIndent : 0;
  const start = Math.min(Math.max(0, width - 1), Math.max(0, left + indent));
  const available = Math.max(1, width - start - Math.max(0, right));
  const slack = Math.max(0, available - Math.max(1, measuredWidth));
  const alignment = paragraphAlignmentKey(shape?.alignment);
  const offset = alignment === 'RIGHT' ? slack : alignment === 'CENTER' ? slack / 2 : 0;
  return { x: start + offset, width: available };
}

// Match the ordinary picture-paragraph producer: paragraph margins define
// its frame, while first-line and hanging offsets belong only to text layout.
export function paragraphReferenceGeometry(shape, width) {
  return paragraphLineGeometry({ ...shape, alignment: 0, indent: 0 }, width, 0, false);
}
