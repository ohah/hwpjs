import { hwpUnitPixels } from "./hwp-units.mjs";
export const EQUATION_PREVIEW_FAMILY = "Times New Roman";
// Size and color can follow source values; these ratios remain preview policy.
export function equationDisplayStyle(source = null) {
  if (source?.error_name) throw new Error(source.error_name);
  let size = 16;
  if (source?.base_unit !== null && source?.base_unit !== undefined) {
    if (!/^\d+$/.test(source.base_unit) || source.base_unit.length > 32) throw new Error("InvalidEquationBaseUnit");
    const units = Number(source.base_unit);
    if (!Number.isSafeInteger(units) || units <= 0 || units > 0xffffffff) throw new Error("InvalidEquationBaseUnit");
    size = hwpUnitPixels(units);
    if (size > 1_000_000) throw new Error("EquationMeasurementLimitExceeded");
  }
  const family = source?.font ?? EQUATION_PREVIEW_FAMILY;
  if (!family.trim()) throw new Error("InvalidEquationFontFamily");
  const rawColor = source?.text_color;
  if (rawColor !== null && rawColor !== undefined && !/^#?[0-9a-fA-F]{6}$/.test(rawColor)) throw new Error("InvalidEquationTextColor");
  const color = rawColor === null || rawColor === undefined ? null : `#${rawColor.replace(/^#/, "")}`;
  return { settings: { size, script_scale: 0.7, fraction_scale: 0.9 }, family, color, sourceStyle: source };
}
