import { signedInt32 } from "./signed-int32.mjs";
// Inline objects do not use floating reference, offset, or text-wrap policies.
export function tablePageAnchorSupported(source) {
  return tablePageAnchorError(source) === null;
}

export function tablePageAnchorError(source) {
  const geometry = source?.geometry;
  if (!geometry || geometry.width_relative !== 4 || geometry.height_relative !== 2) return "UnsupportedTableSizeReference";
  if (geometry.treat_as_character === true) return null;
  if (geometry.treat_as_character !== false) return "MissingTableAnchorMode";
  if (signedInt32(geometry.vertical_offset) === null) return "InvalidTableVerticalOffset";
  if (source.text_wrap !== 1) return "UnsupportedTableTextWrap";
  if (source.text_flow !== 0) return "UnsupportedTableTextFlow";
  if (source.flow_with_text !== true) return "UnsupportedTableFlowWithText";
  if (source.allow_overlap !== false) return "UnsupportedTableOverlap";
  if (![0, 1, 2].includes(source.vertical_relative)) return "UnsupportedTableVerticalReference";
  if (![0, 1, 2, 3].includes(source.horizontal_relative)) return "UnsupportedTableHorizontalReference";
  if (source.vertical_relative === 2 ? source.vertical_alignment !== 0 : ![0, 1, 2].includes(source.vertical_alignment)) return "UnsupportedTableVerticalAlignment";
  if (![0, 1, 2].includes(source.horizontal_alignment)) return "UnsupportedTableHorizontalAlignment";
  return null;
}
