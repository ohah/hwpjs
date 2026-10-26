import { signedInt32 } from './signed-int32.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

// A non-overlapping PARA/TOP CELL table may start at an offset and continue
// at subsequent page tops. Physical paper/page anchors remain whole objects.
export function paragraphCellOffset(table) {
  const source = table?.sourceGeometry,
    geometry = source?.geometry;
  const offset = signedInt32(geometry?.vertical_offset);
  return table?.pagination?.page_break === 'cell' &&
    geometry?.treat_as_character === false &&
    source.vertical_relative === 2 &&
    source.vertical_alignment === 0 &&
    source.flow_with_text === true &&
    source.allow_overlap === false &&
    offset !== null &&
    offset !== 0
    ? hwpUnitPixels(offset)
    : null;
}
