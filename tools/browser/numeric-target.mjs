// Canvas coordinates are zero-based; text equality alone cannot identify a cell.
export function numericBrowserTargetMatches(state, expected) {
  if (
    !expected ||
    !Number.isSafeInteger(expected.section) ||
    expected.section < 0 ||
    !Number.isSafeInteger(expected.paragraph) ||
    expected.paragraph < 0 ||
    typeof expected.text !== "string" ||
    typeof state?.caret !== "string"
  )
    return false;
  const caret = /^(0|[1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(state.caret);
  return Boolean(
    caret &&
    state.value === expected.text &&
    caret[1] === String(expected.section) &&
    caret[2] === String(expected.paragraph) &&
    Number(caret[3]) <= expected.text.length,
  );
}
