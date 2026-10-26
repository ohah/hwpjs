// Display-only projection into shared geometry, never an editable format cache.
import { paragraphAlignmentValue } from "./paragraph-alignments.mjs";
export function hwpxParagraphGeometry(shape) {
  const unitValue = (measure) =>
    measure && (measure.unit == null || measure.unit === "HWPUNIT") ? measure.value : undefined;
  const marginValue = (measure) =>
    measure && (measure.unit == null || measure.unit === "HWPUNIT") ? measure.value : undefined;
  const spacingKinds = { PERCENT: 0, FIXED: 1, BETWEEN_LINES: 2, AT_LEAST: 3 };
  const kind = Object.hasOwn(spacingKinds, shape.spacing_type)
    ? spacingKinds[shape.spacing_type]
    : undefined;
  const spacing = kind === 0 ? shape.spacing?.value : unitValue(shape.spacing);
  return {
    spacingFormat: "hwpx",
    ...(Object.hasOwn(shape, "break_settings")
      ? { breakSettings: shape.break_settings === null ? null : { ...shape.break_settings } }
      : {}),
    alignment: paragraphAlignmentValue(shape.horizontal),
    indent: marginValue(shape.margins[0]),
    left: marginValue(shape.margins[1]),
    right: marginValue(shape.margins[2]),
    before: marginValue(shape.margins[3]),
    after: marginValue(shape.margins[4]),
    legacySpacingKind: kind,
    legacySpacing: spacing,
  };
}
