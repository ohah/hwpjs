import { formatNumber } from "./number-format.mjs";
export function automaticNumberSource(paragraph, unit, kind = "text") {
  if (kind === "number-prefix") {
    const rows = paragraph?.automaticNumberPrefixes;
    return unit === 0 && rows?.length === 1 ? rows[0].source : null;
  }
  if (kind !== "text" || paragraph?.text?.[unit] !== "\ufffc") return null;
  const rows = paragraph?.automaticNumbers?.filter((number) => number.unit === unit) ?? [];
  return rows.length === 1 ? rows[0].source : null;
}
/** Stored source display, not sequence recomputation. */
export function automaticNumberText(paragraph, unit, pageNumber) {
  const source = automaticNumberSource(paragraph, unit);
  if (source?.hwp5PageNumber === true && pageNumber !== undefined) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 0xffffffff) return null;
    return storedAutomaticNumberText({ ...source, values: { ...source.values, num: pageNumber } });
  }
  return storedAutomaticNumberText(source);
}

export function storedAutomaticNumberText(source) {
  const { values, format } = source ?? {};
  if (
    !values?.type_known ||
    !format?.type_known ||
    !Array.isArray(format.raw) ||
    typeof format.supscript !== "boolean" ||
    typeof format.raw[2] !== "string" ||
    typeof format.raw[3] !== "string"
  )
    return null;
  const text = formatNumber(values.num, format.raw[0], format.raw[1]);
  return text === null ? null : format.raw[2] + text + format.raw[3];
}
