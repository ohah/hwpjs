// A projection of one current Native canonical cell, never a SelectionTarget
// or a second mutable text/style model. Draft ranges cannot grant this port.
import { validateCreatedCellCharacterRuns } from '../../js/created-cell-character-runs.mjs';
import { isUtf16Boundary } from './utf16-boundary.mjs';
import { observeFormattingIds } from './range-formatting-observation.mjs';
import { createdCellCharacterRanges } from '../../js/created-cell-character-runs.mjs';
import { projectTypingDraftRanges } from './typing-format-draft.mjs';
import { textChange } from './text-input.mjs';

const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
const identity = (n) =>
  typeof n === 'string' && /^[1-9][0-9]{0,19}$/.test(n) && BigInt(n) <= 0xffffffffffffffffn;
function observedCell(content, paragraph, point, allowDraftText = false) {
  const address = point?.createdCell;
  if (
    !['hwp5', 'hwpx'].includes(content?.format) ||
    !Number.isSafeInteger(content.createdCellTypingScope) ||
    content.createdCellTypingScope < 0 ||
    !uint(point?.section) ||
    !address ||
    !identity(address.identity) ||
    !uint(address.row) ||
    !uint(address.column) ||
    paragraph?.clipped ||
    paragraph?.editable !== true ||
    paragraph.section !== point.section ||
    paragraph.createdCell?.identity !== address.identity ||
    paragraph.createdCell?.row !== address.row ||
    paragraph.createdCell?.column !== address.column ||
    !Array.isArray(content.createdTables)
  )
    return null;
  let table = null,
    cell = null;
  for (const row of content.createdTables) {
    if (row?.section !== point.section || row.identity !== address.identity) continue;
    if (table) return null;
    table = row;
  }
  if (!table || !Array.isArray(table.cells)) return null;
  for (const row of table.cells) {
    if (row?.row !== address.row || row.column !== address.column) continue;
    if (cell) return null;
    cell = row;
  }
  if (
    !cell ||
    !uint(cell.paragraph_id) ||
    cell.paragraph_id === 0 ||
    (!allowDraftText && cell.text !== paragraph.text) ||
    !Object.hasOwn(cell, 'character_runs')
  )
    return null;
  try {
    validateCreatedCellCharacterRuns(cell.text, cell.character_runs);
  } catch {
    return null;
  }
  return {
    cell,
    scope: content.createdCellTypingScope,
    owner: `section:${point.section}:created:${address.identity}:row:${address.row}:column:${address.column}:paragraph-id:${cell.paragraph_id}`,
  };
}
// 읽기 전용 Native 셀 관측입니다. 편집 가능성·typing scope·이력은 요구하지 않습니다.
export function createdCellClipboardSource(content, paragraph, point) {
  const address = point?.createdCell;
  if (
    !['hwp5', 'hwpx'].includes(content?.format) ||
    !uint(point?.section) ||
    !address ||
    !identity(address.identity) ||
    !uint(address.row) ||
    !uint(address.column) ||
    paragraph?.clipped ||
    paragraph?.selectable !== true ||
    paragraph.section !== point.section ||
    paragraph.createdCell?.identity !== address.identity ||
    paragraph.createdCell?.row !== address.row ||
    paragraph.createdCell?.column !== address.column ||
    !Array.isArray(content.createdTables)
  )
    return null;
  let table = null,
    cell = null;
  for (const row of content.createdTables) {
    if (row?.section !== point.section || row.identity !== address.identity) continue;
    if (table) return null;
    table = row;
  }
  if (!table || !Array.isArray(table.cells)) return null;
  for (const row of table.cells) {
    if (row?.row !== address.row || row.column !== address.column) continue;
    if (cell) return null;
    cell = row;
  }
  if (
    !cell ||
    !uint(cell.paragraph_id) ||
    cell.paragraph_id === 0 ||
    typeof cell.text !== 'string' ||
    cell.text !== paragraph.text ||
    !cell.text.isWellFormed() ||
    !uint(point.unit) ||
    point.unit > cell.text.length ||
    !isUtf16Boundary(cell.text, point.unit)
  )
    return null;
  return Object.freeze({ table, cell, text: cell.text, paragraphId: cell.paragraph_id });
}
export function createdCellTypingOwner(content, paragraph, point) {
  // Input already owns the Native revision/text base; a display-only draft may
  // change row.text while pump submits that exact base's splice. It grants no
  // formatting observation or new source identity.
  const value = observedCell(content, paragraph, point, true);
  return value ? Object.freeze({ scope: value.scope, owner: value.owner }) : null;
}
function insertionResourceId(format, cell, start, end) {
  if (
    !uint(start) ||
    !uint(end) ||
    start > end ||
    end > cell.text.length ||
    !isUtf16Boundary(cell.text, start) ||
    !isUtf16Boundary(cell.text, end)
  )
    return null;
  const preceding = start === end && start > 0 && (start === cell.text.length || format === 'hwpx');
  const unit = preceding ? start - 1 : start;
  let id = cell.character_runs[0].char_shape_id;
  for (const run of cell.character_runs) {
    if (run.start_unit > unit) break;
    id = run.char_shape_id;
  }
  return id;
}
export function createdCellTypingObservation(content, paragraph, point) {
  const value = observedCell(content, paragraph, point);
  if (!value || !uint(point?.unit)) return null;
  const { cell } = value;
  if (point.unit > cell.text.length || !isUtf16Boundary(cell.text, point.unit)) return null;
  // Same format-adapter contract as authored_paragraph.typingResourceId:
  // H5 preserves interior right affinity; HX retains existing left affinity.
  // Both use the preceding visible scalar at a nonempty pure visible EOF.
  const id = insertionResourceId(content.format, cell, point.unit, point.unit);
  return Object.freeze({
    scope: value.scope,
    owner: value.owner,
    resourceId: id,
    observation: observeFormattingIds(content, [id], [paragraph]),
  });
}
/** Only the current Native ACK text/runs form a draft base. Painted text never
 * becomes another canonical paragraph and cannot allocate resources. */
export function createdCellTypingDraftRanges(content, paragraph, point, text, selection, baseText) {
  const value = observedCell(content, paragraph, point, true);
  if (!value || value.cell.text !== baseText) return null;
  const change = textChange(baseText, text, selection);
  const ranges = createdCellCharacterRanges(value.cell, 0);
  if (!change) return projectTypingDraftRanges({ text: baseText, characterRanges: ranges }, text);
  const id = insertionResourceId(content.format, value.cell, change.startUnit, change.endUnit);
  if (id === null) return null;
  return projectTypingDraftRanges({ text: baseText, characterRanges: ranges }, text, selection, id);
}
