// Group members inherit placement from their root. Their local flow defaults
// are not independent body-wrapping instructions.
export function drawingHasOwnWrap(drawing) {
  return drawing?.source?.group_context == null && [0, 1].includes(drawing?.source?.flow?.text_wrap);
}
