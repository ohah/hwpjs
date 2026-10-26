// Inline roots participate in the text line, not floating behind-text wrapping.
export function groupedPaintLayer(source, reserved = false) {
  const wrap = source?.flow?.text_wrap;
  if (source?.geometry?.treat_as_character === true)
    return [0, 1, 2, 3].includes(wrap) ? "front" : null;
  if (reserved === true && [0, 1].includes(wrap)) return "front";
  return wrap === 2 ? "behind" : wrap === 3 ? "front" : null;
}
