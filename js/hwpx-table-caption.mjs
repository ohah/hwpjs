/** Source caption scalar values; node numbers belong to the current XML tree. */
export function decodeTableCaption(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return validateTableCaption(value);
}
export function validateTableCaption(value) {
  if (value === null) return null;
  const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const signed = v => Number.isSafeInteger(v) && v >= -0x80000000 && v <= 0xffffffff;
  const optional = (v, check) => v === null || check(v);
  for (const field of ["text_direction", "line_wrap", "vertical_alignment"]) if (!optional(value?.[field], v => uint(v) && v <= 2)) throw new Error("InvalidTableCaption");
  if (!value || typeof value !== "object" || Array.isArray(value) || !uint(value.caption_node) || !optional(value.list_node, uint) || !optional(value.side, v => uint(v) && v <= 3) || ![null, false, true].includes(value.full_size) || !optional(value.width, signed) || !optional(value.gap, signed) || !optional(value.last_width, uint)) throw new Error("InvalidTableCaption");
  return value;
}
