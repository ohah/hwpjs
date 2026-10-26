import { FONT_LANGUAGES } from '../../js/font-faces.mjs';
import { snapUnit } from './text-input.mjs';

/** Current native display references, not installed-font detection. */
export function selectedFontIds(content, ranges, language) {
  const index = FONT_LANGUAGES.indexOf(language);
  if (
    index < 0 ||
    !Array.isArray(content?.paragraphs) ||
    !Array.isArray(content?.characterFontReferences) ||
    !Array.isArray(ranges) ||
    !ranges.length
  )
    return null;
  const references = new Map(content.characterFontReferences.map((row) => [row.id, row.fontIds]));
  const ids = new Set();
  for (const range of ranges) {
    if (!range) return null;
    const row = content.paragraphs.find(
      (row) => row.section === range.section && row.paragraph === range.paragraph,
    );
    const start = range.startUnit,
      end = range.endUnit;
    if (
      typeof row?.text !== 'string' ||
      row.clipped ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start > end ||
      end > row.text.length ||
      snapUnit(row.text, start) !== start ||
      snapUnit(row.text, end, true) !== end
    )
      return null;
    let cursor = start;
    for (const span of row.characterRanges ?? []) {
      const low = Math.max(start, span.start),
        high = Math.min(end, span.end);
      if (low >= high) continue;
      const id = references.get(span.charShapeId)?.[index];
      if (low !== cursor || !Number.isInteger(id) || id < 0 || id > 0xffffffff) return null;
      ids.add(id);
      cursor = high;
    }
    if (cursor !== end) return null;
  }
  return ids.size ? [...ids].sort((a, b) => a - b) : null;
}
