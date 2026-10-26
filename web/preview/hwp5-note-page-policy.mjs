import { validateHwp5NoteShapeSources } from '../../js/hwp5-note-shape-sources.mjs';
import { normalizedNotePagePolicy } from './normalized-note-page-policy.mjs';

const widths = Object.freeze([
  '0.1 mm',
  '0.12 mm',
  '0.15 mm',
  '0.2 mm',
  '0.25 mm',
  '0.3 mm',
  '0.4 mm',
  '0.5 mm',
  '0.6 mm',
  '0.7 mm',
  '1.0 mm',
  '1.5 mm',
  '2.0 mm',
  '3.0 mm',
  '4.0 mm',
  '5.0 mm',
]);
export function selectHwp5NotePagePolicy(rows, section, kind) {
  try {
    validateHwp5NoteShapeSources(rows);
  } catch {
    return { state: 'unavailable', error: 'InvalidHwp5NoteShapeSources' };
  }
  const shape = rows.find((row) => row.kind === kind);
  if (!shape) return { state: 'unavailable', error: 'InvalidNotePagePolicy' };
  const placement = (shape.flags >>> 8) & 3;
  const places =
    kind === 'footnote'
      ? ['EACH_COLUMN', 'MERGED_COLUMN', 'RIGHT_MOST_COLUMN']
      : ['END_OF_DOCUMENT', 'END_OF_SECTION'];
  // 관측된 note record의 1은 paired XML SOLID입니다. 테두리 0 기반 enum과 다릅니다.
  if (
    shape.extra_bytes !== 0 ||
    shape.flags >>> 14 !== 0 ||
    shape.line_type !== 1 ||
    !widths[shape.line_width] ||
    shape.color > 0xffffff
  )
    return { state: 'unavailable', error: 'UnsupportedHwp5NotePagePolicy' };
  const color = `#${[shape.color & 255, (shape.color >>> 8) & 255, (shape.color >>> 16) & 255].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  return normalizedNotePagePolicy({
    section,
    kind,
    sourceNode: shape.source_node,
    placement: places[placement],
    beneathText: Boolean(shape.flags & (1 << 13)),
    between: shape.between,
    below: shape.below,
    above: shape.above,
    length: shape.separator_length,
    type: 'SOLID',
    width: widths[shape.line_width],
    color,
  });
}
