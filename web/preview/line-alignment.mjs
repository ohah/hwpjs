import { isHardLineBreak } from './hard-line-break.mjs';
import { paragraphAlignmentKey } from './paragraph-alignments.mjs';
import { lineVisibleEndUnit } from './line-visible-end.mjs';
import { automaticNumberText } from './automatic-number-text.mjs';
import { tabAlignmentPrefix } from './tab-alignment-prefix.mjs';
import { boundaryGlyphWidth } from './text-line-width.mjs';

function slotsAfter(parts, visible, alignment, boundary) {
  const spaces = parts
    .slice(boundary, visible - 1)
    .flatMap((part, index) => (part === ' ' ? [boundary + index + 1] : []));
  return alignment === 'DISTRIBUTE' || (alignment === 'JUSTIFY' && !spaces.length)
    ? Array.from(
        { length: Math.max(0, visible - boundary - 1) },
        (_, index) => boundary + index + 1,
      )
    : spaces;
}

/** Display spacing only; the native document and source offsets stay untouched. */
export function alignTextRow(row, { lastLine = false, paragraph } = {}) {
  const alignment = paragraphAlignmentKey(row.paragraphShape?.alignment);
  if (row.kind !== 'text' || !['JUSTIFY', 'DISTRIBUTE', 'DISTRIBUTE_SPACE'].includes(alignment))
    return row;
  const points = row.boundaries;
  const invalid = () => {
    throw new RangeError('InvalidLineAlignmentGeometry');
  };
  if (
    !Array.isArray(points) ||
    !points.length ||
    !Number.isFinite(row.width) ||
    row.width <= 0 ||
    typeof row.text !== 'string' ||
    !Number.isSafeInteger(row.startUnit) ||
    row.startUnit < 0 ||
    row.endUnit !== row.startUnit + row.text.length ||
    !Number.isSafeInteger(row.endUnit)
  )
    invalid();
  if (points[0]?.unit !== row.startUnit || points.at(-1)?.unit !== row.endUnit) invalid();
  for (const [index, point] of points.entries()) {
    if (
      !Number.isSafeInteger(point?.unit) ||
      !Number.isFinite(point?.x) ||
      point.x < 0 ||
      (index && (point.unit <= points[index - 1].unit || point.x < points[index - 1].x))
    )
      invalid();
  }
  if (points.length < 2) return row;
  const parts = points
    .slice(1)
    .map((point, index) =>
      row.text.slice(points[index].unit - row.startUnit, point.unit - row.startUnit),
    );
  const forced = parts.some(isHardLineBreak);
  if (alignment !== 'DISTRIBUTE' && (forced || (alignment === 'JUSTIFY' && lastLine))) return row;
  const visibleEnd = lineVisibleEndUnit(row.text, row.startUnit);
  const visible = points.findIndex((point) => point.unit === visibleEnd);
  if (visible < 2) return row;
  const glyphWidths = Array.from({ length: visible }, (_, index) => {
    const width = boundaryGlyphWidth(points[index], points[index + 1]);
    if (width === null) invalid();
    return width;
  });
  const occupied = glyphWidths.reduce(
    (right, width, index) =>
      parts[index].trim() ? Math.max(right, points[index].x + width) : right,
    0,
  );
  if (occupied >= row.width) return row;
  let slots = slotsAfter(parts, visible, alignment, 0);
  if (!slots.length) return row;
  let unsupportedControl = false;
  for (let index = 0; index < row.text.length && !unsupportedControl; index++) {
    if (row.text[index] !== '\ufffc') continue;
    const text =
      paragraph && paragraph.section === row.section && paragraph.paragraph === row.paragraph
        ? automaticNumberText(paragraph, row.startUnit + index)
        : null;
    if (typeof text !== 'string' || text.length === 0) unsupportedControl = true;
  }
  if (unsupportedControl) return { ...row, alignmentUnavailable: 'UnsupportedAlignmentControl' };
  if (row.text.includes('\t')) {
    const prefix = tabAlignmentPrefix(row, paragraph, parts);
    if (prefix.state !== 'bound')
      return { ...row, alignmentUnavailable: 'UnsupportedAlignmentControl' };
    slots = slotsAfter(parts, visible, alignment, prefix.boundary);
    if (!slots.length) return row;
  }
  let increment = Infinity,
    shiftedSlots = 0;
  for (let index = 0; index < visible; index++) {
    while (shiftedSlots < slots.length && slots[shiftedSlots] <= index) shiftedSlots++;
    if (!parts[index].trim()) continue;
    const width = glyphWidths[index];
    const right = points[index].x + width;
    if (shiftedSlots) increment = Math.min(increment, (row.width - right) / shiftedSlots);
  }
  if (!Number.isFinite(increment) || increment < 0) invalid();
  if (increment === 0) return row;
  let slot = 0;
  const boundaries = points.map((point, index) => {
    while (slot < slots.length && slots[slot] <= index) slot++;
    const x = point.x + increment * slot;
    if (!Number.isFinite(x)) invalid();
    return { ...point, x };
  });
  return { ...row, boundaries };
}
