import { graphemeUnits } from './text-input.mjs';

// Search the current display snapshot; returned UTF-16 positions never own text.
export function findText(paragraphs, query, limit = 1000) {
  if (typeof query !== 'string' || !query.isWellFormed() || !Number.isInteger(limit) || limit < 1)
    throw new TypeError('InvalidTextSearch');
  const matches = [];
  if (!query) return { matches, limited: false };
  for (const paragraph of paragraphs) {
    if (paragraph.clipped || !(paragraph.editable || paragraph.selectable)) continue;
    const boundaries = new Set(graphemeUnits(paragraph.text));
    let at = 0;
    while ((at = paragraph.text.indexOf(query, at)) !== -1) {
      const end = at + query.length;
      if (boundaries.has(at) && boundaries.has(end)) {
        if (matches.length === limit) return { matches, limited: true };
        matches.push({
          section: paragraph.section,
          paragraph: paragraph.paragraph,
          startUnit: at,
          endUnit: end,
        });
      }
      at++;
    }
  }
  return { matches, limited: false };
}
