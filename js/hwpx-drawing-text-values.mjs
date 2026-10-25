// Shared raw drawText/list metadata. Does not imply a rectangle or editable UI.
export function validDrawingTextValues(text, drawingNode) {
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const signed = value => Number.isSafeInteger(value) && value >= -2147483648 && value <= 4294967295;
  const optional = (value, check) => value === null || check(value);
  return Boolean(text && typeof text === "object" && !Array.isArray(text) && uint(drawingNode)
    && uint(text.node) && text.node > drawingNode && optional(text.list_node, uint) && (text.list_node === null || text.list_node > text.node)
    && typeof text.margin_present === "boolean" && Array.isArray(text.margins) && text.margins.length === 4
    && Array.from(text.margins).every(value => optional(value, signed))
    && [null, false, true].includes(text.editable) && optional(text.last_width, uint)
    && (text.margin_present || text.margins.every(value => value === null))
    && [text.text_direction, text.line_wrap, text.vertical_alignment].every(value => optional(value, n => uint(n) && n <= 2)));
}
