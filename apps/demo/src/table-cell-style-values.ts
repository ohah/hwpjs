import type { TableCellAppearanceCapture } from './table-cell-appearance-port.ts';
import type {
  TableCellAppearanceDraft,
  TableCellAppearanceTargetDraft,
  TableCellFillDraft,
} from './table-cell-fill-draft.ts';
// @ts-ignore Shared scalar and sparse-wire admission, independent of the UI.
import { validateCellStyles } from '../../../js/cell-style-command.mjs';
// @ts-ignore Coverage and merged-cell admission are shared with border planning.
import { tableCellRegion } from '../../../js/table-cell-region.mjs';
// @ts-ignore Existing colour syntax is the single parser for UI RGB fields.
import { characterColorArg } from '../../../js/character-color-args.mjs';

function integer(value: string | undefined, maximum: number, positive = false) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value))
    throw Error('InvalidCellFill');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result > maximum || (positive && result === 0))
    throw Error('InvalidCellFill');
  return result;
}
function color(value: string | undefined) {
  try {
    return characterColorArg(value);
  } catch {
    throw Error('InvalidCellBackgroundColor');
  }
}
function fillValue(draft: TableCellFillDraft) {
  if (draft.dirty !== true) throw Error('CellAppearanceChoiceRequired');
  switch (draft.kind === undefined ? 'solid' : draft.kind) {
    case 'none':
      return { kind: 'none' };
    case 'solid':
      return { kind: 'solid', color: color(draft.color) };
    case 'hatch':
      return {
        kind: 'hatch',
        face: color(draft.color),
        hatch: color(draft.hatchColor),
        style: draft.hatchStyle,
      };
    case 'linear':
      return {
        kind: 'linear',
        colors: [color(draft.color), color(draft.endColor)],
        angle: integer(draft.angle, 359),
        centerX: integer(draft.centerX, 100),
        centerY: integer(draft.centerY, 100),
        step: integer(draft.step, 100),
        stepCenter: integer(draft.stepCenter, 100),
      };
    default:
      throw Error('InvalidCellFill');
  }
}
function bounds(target: TableCellAppearanceTargetDraft) {
  if (target.mode !== 'range') return {};
  try {
    return {
      range: {
        rowStart: integer(target.startRow, 0xffffffff, true) - 1,
        rowEnd: integer(target.endRow, 0xffffffff, true),
        columnStart: integer(target.startColumn, 0xffffffff, true) - 1,
        columnEnd: integer(target.endColumn, 0xffffffff, true),
      },
    };
  } catch {
    throw Error('InvalidCellRange');
  }
}
function tableFor(captured: TableCellAppearanceCapture) {
  const tables = (
    captured.state.content as { tables?: { section: number; tableNode: number }[] } | null
  )?.tables;
  const matches = tables?.filter(
    (table) =>
      table.section === captured.cell!.section && table.tableNode === captured.cell!.tableNode,
  );
  if (matches?.length !== 1) throw Error('CompleteOriginalTableRequired');
  return matches[0];
}
export function tableCellStyleValues(
  draft: TableCellAppearanceDraft,
  captured: TableCellAppearanceCapture,
) {
  const cell = captured.cell;
  if (!cell || captured.reason) throw Error('InvalidCellAppearanceCapture');
  if (!draft.border && !draft.background) throw Error('CellAppearanceChoiceRequired');
  const border = draft.border;
  const target: TableCellAppearanceTargetDraft = draft.target ??
    border ?? { mode: 'cell', startRow: '', endRow: '', startColumn: '', endColumn: '' };
  if (
    draft.target &&
    border &&
    (border.mode !== target.mode ||
      (target.region !== undefined && target.region !== border.region) ||
      (target.mode === 'range' &&
        (['startRow', 'endRow', 'startColumn', 'endColumn'] as const).some(
          (key) => border[key] !== target[key],
        )))
  )
    throw Error('InconsistentCellStyleTarget');
  if (!['cell', 'range', 'table'].includes(target.mode)) throw Error('InvalidCellRange');
  const owner = { section: cell.section, tableNode: cell.tableNode, listNode: cell.listNode };
  let selected: {
    listNode: number;
    row: number;
    column: number;
    rowSpan: number;
    columnSpan: number;
  }[] = [];
  let regionBounds:
    | { rowStart: number; rowEnd: number; columnStart: number; columnEnd: number }
    | undefined;
  if (draft.border || target.mode !== 'cell') {
    const plan = tableCellRegion(tableFor(captured), {
      ...owner,
      mode: target.mode,
      ...bounds(target),
    });
    if (plan.state !== 'planned') throw Error(plan.error);
    selected = plan.cells;
    regionBounds = plan.bounds;
  }
  const borders: Record<string, unknown>[] = [];
  if (draft.border) {
    const draftBorder = draft.border,
      patch: Record<string, unknown> = {};
    if (draftBorder.dirty?.style === true) patch.style = draftBorder.style;
    if (draftBorder.dirty?.width === true) patch.width = integer(draftBorder.width, 0xffff, true);
    if (draftBorder.dirty?.color === true) patch.color = color(draftBorder.color);
    if (!Object.keys(patch).length) {
      const known = captured.currentBorder;
      if (!known) throw Error('CellBorderChoiceRequired');
      patch.style = known.style;
      patch.width = known.width;
      patch.color = color(known.color);
    }
    if (!['outer', 'inner', 'all'].includes(draftBorder.region)) throw Error('InvalidCellBorder');
    for (const row of selected) {
      let outer = 0;
      if (row.column === regionBounds!.columnStart) outer |= 1;
      if (row.column + row.columnSpan === regionBounds!.columnEnd) outer |= 2;
      if (row.row === regionBounds!.rowStart) outer |= 4;
      if (row.row + row.rowSpan === regionBounds!.rowEnd) outer |= 8;
      const edges =
        target.mode === 'cell'
          ? draftBorder.edges
          : draftBorder.region === 'all'
            ? 15
            : draftBorder.region === 'outer'
              ? outer
              : 15 ^ outer;
      if (edges)
        borders.push({
          section: cell.section,
          tableNode: cell.tableNode,
          listNode: row.listNode,
          edges,
          ...patch,
        });
    }
    if (!borders.length && !draft.background) throw Error('EmptyCellBorderRegion');
  }
  const fill = draft.background ? fillValue(draft.background) : null;
  const fills = fill
    ? (target.mode === 'cell' ? [cell] : selected).map((row) => ({
        section: cell.section,
        tableNode: cell.tableNode,
        listNode: row.listNode,
        fill,
      }))
    : [];
  return validateCellStyles({ borders, fills });
}
