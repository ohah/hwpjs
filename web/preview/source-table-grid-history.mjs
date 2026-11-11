import { captureSourceTableGridRequest } from '../../js/source-table-grid.mjs';
import { captureSourceTableGridSelection } from './source-table-grid-selection.mjs';
import { paragraphSelectionOwner } from './paragraph-selection.mjs';
import { snapUnit } from './text-input.mjs';
const keys = ['editorId', 'documentId', 'generation', 'operationRevision', 'viewRevision'];
const revision = (n) => Number.isInteger(n) && n >= 0 && n < 0xffffffff;
const history = (s) =>
  Array.isArray(s.nativeHistoryRevisions) &&
  s.nativeHistoryRevisions[0] === s.nativeHistoryRevision &&
  s.nativeHistoryRevisions.every(revision) &&
  new Set(s.nativeHistoryRevisions).size === s.nativeHistoryRevisions.length;
const unique = (array, match) => {
  const found = Array.isArray(array) ? array.filter(match) : [];
  return found.length === 1 ? found[0] : null;
};
// Canonical DTO order defines the complete owner sequence, never the cell's ID declaration.
// Index each snapshot once; duplicate IDs remain ambiguous rather than overwriting an owner.
function cellParagraphs(content, section, tableNode, cell) {
  if (!Array.isArray(cell?.paragraphs) || cell.paragraphs.length === 0) return null;
  const byId = new Map(),
    byOwner = new Map();
  for (const p of content.paragraphs) {
    if (p.section !== section) continue;
    byId.set(p.paragraph, byId.has(p.paragraph) ? null : p);
    if (p.tableCell) {
      const key = `section:${section}:table:${p.tableCell.tableNode}:list:${p.tableCell.listNode}`;
      let owned = byOwner.get(key);
      if (!owned) byOwner.set(key, (owned = []));
      owned.push(p);
    }
  }
  const owner = `section:${section}:table:${tableNode}:list:${cell.listNode}`;
  const paragraphs = byOwner.get(owner);
  if (!paragraphs || paragraphs.length !== cell.paragraphs.length) return null;
  for (let i = 0; i < paragraphs.length; i++) {
    const id = cell.paragraphs[i],
      p = paragraphs[i];
    if (
      !Number.isInteger(id) ||
      id < 0 ||
      id > 0xffffffff ||
      p.paragraph !== id ||
      byId.get(id) !== p ||
      typeof p.text !== 'string' ||
      p.tableCell?.tableNode !== tableNode ||
      p.tableCell?.listNode !== cell.listNode ||
      paragraphSelectionOwner(p) !== owner
    )
      return null;
  }
  return paragraphs;
}
/** Auxiliary bookmarks for a proven SOURCE mutation, never another undo stack.
 * IDs belong to each snapshot. Map logical cell coordinates and the surviving paragraph ordinal.
 */
export function sourceTableGridHistory({ before, after, request }) {
  try {
    if (
      !before ||
      !after ||
      before.status !== 'ready' ||
      after.status !== 'ready' ||
      before.historyRecoveryRequired ||
      after.historyRecoveryRequired ||
      !before.documentId ||
      !history(before) ||
      !history(after) ||
      !revision(before.nativeHistoryRevision) ||
      !revision(after.nativeHistoryRevision) ||
      before.nativeHistoryRevision === after.nativeHistoryRevision ||
      !after.nativeHistoryRevisions.includes(before.nativeHistoryRevision) ||
      !['editorId', 'documentId', 'generation'].every((k) => before[k] === after[k]) ||
      !keys.every((k) => before.token[k] === before[k] && after.token[k] === after[k]) ||
      !(
        after.operationRevision > before.operationRevision &&
        after.viewRevision > before.viewRevision &&
        after.stateVersion > before.stateVersion
      ) ||
      before.content?.format !== after.content?.format
    )
      return null;
    const input = captureSourceTableGridRequest(request, before.content.format);
    const selected = before.selection;
    if (
      !selected ||
      !keys.every((k) => selected[k] === before[k]) ||
      selected.coordinateSpace !== 'display' ||
      selected.format !== before.content.format ||
      !['forward', 'backward'].includes(selected.affinity)
    )
      return null;
    const paragraph = unique(
      before.content.paragraphs,
      (p) => p.section === selected.section && p.paragraph === selected.paragraph,
    );
    if (
      !paragraph ||
      selected.owner !== paragraphSelectionOwner(paragraph) ||
      ![selected.startUnit, selected.endUnit].every(
        (n) =>
          Number.isSafeInteger(n) &&
          n >= 0 &&
          n <= paragraph.text.length &&
          snapUnit(paragraph.text, n) === n,
      ) ||
      selected.startUnit > selected.endUnit
    )
      return null;
    const source = captureSourceTableGridSelection({
      content: before.content,
      paragraph,
      point: selected,
      current: () => true,
    });
    if (
      !source ||
      source.section !== input.section ||
      source.tableNode !== input.tableNode ||
      source.rows !== input.expectedRows ||
      source.columns !== input.expectedColumns
    )
      return null;
    const rowAxis = input.action.endsWith('row'),
      insert = input.action.startsWith('insert');
    const rows = source.rows + (rowAxis ? (insert ? 1 : -1) : 0);
    const columns = source.columns + (!rowAxis ? (insert ? 1 : -1) : 0);
    // Source node numbers are snapshot-local. Native materialization can renumber even TABLE.
    // Reader table arrays preserve source order; an unchanged same-section table count identifies
    // the command's ordinal without treating yesterday's node number as today's identity.
    const sectionTables = (model) => {
      if (!Array.isArray(model.tables)) return null;
      const tables = model.tables.filter((t) => t.section === source.section);
      const nodes = tables.map((t) => Object.getOwnPropertyDescriptor(t, 'tableNode')?.value);
      return nodes.every(
        (n, i) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff && (i === 0 || n > nodes[i - 1]),
      )
        ? tables
        : null;
    };
    const beforeTables = sectionTables(before.content),
      afterTables = sectionTables(after.content);
    if (!beforeTables || !afterTables || beforeTables.length !== afterTables.length) return null;
    const ordinal = beforeTables.findIndex((t) => t.tableNode === source.tableNode);
    const table = afterTables[ordinal];
    if (!table || table.rows !== rows || table.columns !== columns) return null;
    const priorCell = unique(beforeTables[ordinal].cells, (c) => c.listNode === source.listNode);
    const priorParagraphs = cellParagraphs(
      before.content,
      source.section,
      source.tableNode,
      priorCell,
    );
    const paragraphOrdinal = priorParagraphs?.indexOf(paragraph) ?? -1;
    if (paragraphOrdinal < 0) return null;
    let row = source.row,
      column = source.column;
    const axis = rowAxis ? row : column;
    const removed =
      !insert && axis === input.index && (rowAxis ? priorCell.rowSpan : priorCell.columnSpan) === 1;
    const mapped = insert
      ? axis + (axis >= input.index ? 1 : 0)
      : removed
        ? Math.min(input.index, (rowAxis ? rows : columns) - 1)
        : axis - (axis > input.index ? 1 : 0);
    if (rowAxis) row = mapped;
    else column = mapped;
    const cell = unique(
      table.cells,
      (c) =>
        c.row <= row &&
        row < c.row + c.rowSpan &&
        c.column <= column &&
        column < c.column + c.columnSpan,
    );
    if (!cell) return null;
    row = cell.row;
    column = cell.column;
    const nextParagraphs = cellParagraphs(after.content, source.section, table.tableNode, cell);
    if (
      !nextParagraphs ||
      (!removed &&
        (nextParagraphs.length !== priorParagraphs.length ||
          nextParagraphs.some((p, i) => p.text !== priorParagraphs[i].text)))
    )
      return null;
    const next = nextParagraphs[removed ? 0 : paragraphOrdinal];
    const destination = captureSourceTableGridSelection({
      content: after.content,
      paragraph: next,
      point: next,
      current: () => true,
    });
    if (
      !destination ||
      destination.tableNode !== table.tableNode ||
      destination.listNode !== cell.listNode ||
      destination.row !== row ||
      destination.column !== column ||
      (!removed && next.text !== paragraph.text)
    )
      return null;
    const selection = (p, start, end, affinity) => {
      const a = {
        section: p.section,
        paragraph: p.paragraph,
        unit: affinity === 'backward' ? end : start,
      };
      const f = {
        section: p.section,
        paragraph: p.paragraph,
        unit: affinity === 'backward' ? start : end,
      };
      return { anchor: a, focus: f };
    };
    return Object.freeze({
      beforeRevision: before.nativeHistoryRevision,
      afterRevision: after.nativeHistoryRevision,
      beforeSelection: selection(
        paragraph,
        selected.startUnit,
        selected.endUnit,
        selected.affinity,
      ),
      // The selected row/column was deleted: use the proven adjacent cell's start, never old offsets.
      afterSelection: selection(
        next,
        removed ? 0 : selected.startUnit,
        removed ? 0 : selected.endUnit,
        removed ? 'forward' : selected.affinity,
      ),
    });
  } catch {
    return null;
  }
}
