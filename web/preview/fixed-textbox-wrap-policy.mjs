import { drawingAxisGeometry } from './drawing-axis-geometry.mjs';

// Admission requires the reservation and final placement collision proofs.
export function isFixedNoOverlapTextboxWrap(source) {
  return (
    source?.group_context === null &&
    source.caption === null &&
    Number.isSafeInteger(source.text?.list_node) &&
    source.text.list_node >= 0 &&
    source.geometry?.treat_as_character === false &&
    source.geometry.width_relative === 4 &&
    source.geometry.height_relative === 2 &&
    source.position?.relations?.length === 4 &&
    [2, 3, 0, 0].every((value, index) => source.position.relations[index] === value) &&
    source.position.flags?.[0] === false &&
    source.position.flags?.[1] === false &&
    source.position.flags?.[2] === false &&
    source.flow?.text_wrap === 0 &&
    [0, 1, 2, 3].includes(source.flow.text_flow) &&
    drawingAxisGeometry(source)
  );
}
