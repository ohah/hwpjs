// Terminal ASCII spaces keep source/caret advance without creating a line
// containing only overflow whitespace. Other Unicode whitespace is unchanged.
export function trailingSpaceStart(text, offset = 0) {
  let start = text.length;
  while (start > 0 && text[start - 1] === " ") start--;
  return offset + start;
}

export function hangsTrailingSpace(segment, unit, suffixStart, hasContent) {
  return segment === " " && unit >= suffixStart && hasContent;
}
