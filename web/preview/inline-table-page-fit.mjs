import { hwpUnitPixels } from "./hwp-units.mjs";

// Only the source table's empty outer bottom margin is discardable. Captions,
// floating references and caller-invented insets keep their complete extent.
export function inlineTablePageFitHeight(table, height, margins) {
  const raw = table?.sourceGeometry?.out_margin;
  if (
    table?.sourceGeometry?.geometry?.treat_as_character !== true ||
    table.sourceCaption ||
    !Array.isArray(raw) ||
    raw.length !== 4 ||
    !raw.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) ||
    !Number.isFinite(height) ||
    height <= 0 ||
    margins?.bottom !== hwpUnitPixels(raw[3])
  )
    return height;
  const fit = height - margins.bottom;
  return fit > 0 ? fit : height;
}
