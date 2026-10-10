import { signedInt32 } from "./signed-int32.mjs";
// Inline objects do not use floating reference, offset, or text-wrap policies.
export function tablePageAnchorSupported(source) {
  const geometry = source?.geometry;
  if (!geometry || geometry.width_relative !== 4 || geometry.height_relative !== 2) return false;
  if (geometry.treat_as_character === true) return true;
  return geometry.treat_as_character === false && signedInt32(geometry.vertical_offset) !== null
    && source.text_wrap === 1 && source.text_flow === 0 && source.flow_with_text === true
    && source.allow_overlap === false && source.vertical_relative === 2
    && [0, 1, 2, 3].includes(source.horizontal_relative) && source.vertical_alignment === 0
    && [0, 1, 2].includes(source.horizontal_alignment);
}
