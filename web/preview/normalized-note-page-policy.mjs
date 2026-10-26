import { hwpUnitPixels } from './hwp-units.mjs';

// 포맷 어댑터는 원값을 해석하고 이 계층은 공통 배치 단위만 소유합니다.
export function normalizedNotePagePolicy({
  section,
  kind,
  sourceNode,
  placement,
  beneathText,
  between,
  below,
  above,
  length,
  type,
  width,
  color,
}) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const allowed =
    kind === 'footnote'
      ? ['EACH_COLUMN', 'MERGED_COLUMN', 'RIGHT_MOST_COLUMN']
      : kind === 'endnote'
        ? ['END_OF_DOCUMENT', 'END_OF_SECTION']
        : [];
  if (
    !Number.isSafeInteger(section) ||
    section < 0 ||
    !allowed.includes(placement) ||
    typeof beneathText !== 'boolean' ||
    ![between, below, above].every(uint) ||
    !Number.isInteger(length) ||
    length < -1 ||
    length > 2147483647
  )
    return { state: 'unavailable', error: 'UnsupportedNotePagePolicy' };
  return {
    state: 'selected',
    section,
    kind,
    sourceNode,
    placement,
    beneathText,
    betweenNotes: hwpUnitPixels(between),
    belowLine: hwpUnitPixels(below),
    aboveLine: hwpUnitPixels(above),
    separator: { length: length === -1 ? 'full' : hwpUnitPixels(length), type, width, color },
  };
}
