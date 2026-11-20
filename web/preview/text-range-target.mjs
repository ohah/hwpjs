import { sameCreatedCell } from './created-cell-address.mjs';

const uint = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
const identity = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 20 &&
  /^[1-9][0-9]*$/.test(value) &&
  (value.length < 20 || value <= '18446744073709551615');

// Generated cells occupy a disjoint namespace. The current layout must prove a
// unique owner; a first-match renderer fallback cannot admit this range.
export function textRangeTarget(range, layout) {
  if (!range || !uint(range.section)) return null;
  if (range.createdCell === undefined)
    return uint(range.paragraph)
      ? { target: { section: range.section, paragraph: range.paragraph } }
      : null;
  const cell = range.createdCell;
  if (
    range.paragraph !== undefined ||
    !cell ||
    !identity(cell.identity) ||
    !uint(cell.row) ||
    !uint(cell.column) ||
    !Array.isArray(layout?.createdCellParagraphs)
  )
    return null;
  const target = {
    section: range.section,
    createdCell: { identity: cell.identity, row: cell.row, column: cell.column },
  };
  let paragraph = null;
  for (const row of layout.createdCellParagraphs) {
    if (!sameCreatedCell(row, target)) continue;
    if (paragraph !== null || row.paragraph !== undefined) return null;
    paragraph = row;
  }
  return paragraph ? { target, paragraph } : null;
}
