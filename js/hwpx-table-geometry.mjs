/** Validate source geometry only; source enum indices are not layout defaults. */
export function decodeTableGeometry(bytes) {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!value || typeof value !== "object") throw new Error("InvalidTableGeometry");
  const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const signed = v => Number.isSafeInteger(v) && v >= -0x80000000 && v <= 0xffffffff;
  const optional = (v, check) => v === null || check(v);
  const bool = v => [null, false, true].includes(v);
  const bounded = max => v => uint(v) && v <= max;
  const g = value?.geometry;
  const margin = v => v === null || Array.isArray(v) && v.length === 4 && v.every(n => optional(n, signed));
  for (const [name, maximum] of [["text_wrap", 5], ["text_flow", 3]]) {
    if (name in value && !optional(value[name], bounded(maximum))) throw new Error("InvalidTableGeometry");
  }
  if (!g || !optional(g.width, uint) || !optional(g.height, uint) || !optional(g.width_relative, bounded(4)) || !optional(g.height_relative, bounded(2)) || !bool(g.treat_as_character) || !optional(g.horizontal_offset, signed) || !optional(g.vertical_offset, signed) || ![value.affect_line_spacing, value.flow_with_text, value.allow_overlap, value.hold_anchor].every(bool) || !optional(value.vertical_relative, bounded(2)) || !optional(value.horizontal_relative, bounded(3)) || !optional(value.vertical_alignment, bounded(4)) || !optional(value.horizontal_alignment, bounded(4)) || !margin(value.out_margin) || !margin(value.in_margin)) throw new Error("InvalidTableGeometry");
  return value;
}
