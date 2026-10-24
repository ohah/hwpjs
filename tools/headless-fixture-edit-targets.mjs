import { paragraphSelectionOwner } from '../web/preview/paragraph-selection.mjs';

const u32 = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function scalarString(text) {
  if (typeof text !== 'string') return false;
  for (let at = 0; at < text.length; at++) {
    const unit = text.charCodeAt(at);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++at);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** Borrowed rows for one collapsed trial edit per paragraph, not all edit positions.
 * Does not mutate content or assert that native editing will accept a candidate.
 * startUnit is a display UTF-16 offset; the caller owns source mapping and editing.
 */
export function fixtureEditCandidates(content) {
  if (!object(content) || !['hwp5', 'hwpx'].includes(content.format)
    || !Array.isArray(content.paragraphs)) return [];
  const counts = new Map();
  for (const row of content.paragraphs) {
    if (!object(row) || !u32(row.section) || !u32(row.paragraph)) continue;
    const key = `${row.section}:${row.paragraph}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const classes = [[], [], [], []];
  for (const row of content.paragraphs) {
    if (!object(row) || !u32(row.section) || !u32(row.paragraph)
      || counts.get(`${row.section}:${row.paragraph}`) !== 1
      || row.editable !== true || row.clipped || row.createdCell || !scalarString(row.text)) continue;
    if (content.format === 'hwp5' && (!object(row.currentReference)
      || row.currentReference.kind !== 'original' || row.currentReference.section !== row.section)) continue;
    const bindings = [row.tableCell, row.drawingText, row.drawingCaption].filter(value => value != null);
    if (bindings.length > 1) continue;
    if (bindings.length && (!object(bindings[0]) || !u32(bindings[0].listNode)
      || !u32(row.tableCell != null ? bindings[0].tableNode : bindings[0].drawingNode))) continue;
    const owner = paragraphSelectionOwner(row);
    const body = bindings.length === 0 && owner === `section:${row.section}:body`;
    if (!body && bindings.length === 0 || typeof owner !== 'string' || !owner) continue;
    // Display object anchors and control characters are not trial insertion sites.
    let startUnit = 0;
    while (startUnit < row.text.length) {
      const scalar = row.text.codePointAt(startUnit);
      if (scalar !== 0xfffc && !(scalar <= 0x1f) && !(scalar >= 0x7f && scalar <= 0x9f)) break;
      startUnit += scalar > 0xffff ? 2 : 1;
    }
    const priority = !row.text.length ? 3 : startUnit > 0 ? 2 : body ? 0 : 1;
    classes[priority].push({ row, startUnit, owner });
  }
  return classes.flat();
}
