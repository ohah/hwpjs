import { checkedOriginalCellBlockObservation } from '../../../../js/original-cell-vertical-alignment-batch.mjs';
import { ownObjectGeometryRecord as record } from '../../../../js/object-geometry-edit.mjs';
import type { EditorState } from '../state/editor-state.ts';
import { copyOwned, freezeDTO } from '../state/owned.ts';
import { createCommand } from './commands.ts';
import type { OriginalCellAlignment } from './original-cell-vertical-alignment-dto.ts';
import {
  sourceTableCellBlockPlan,
  type SourceTableCellBlockWitness,
} from './source-table-cell-merge.ts';

declare const selection: unique symbol;
declare const target: unique symbol;
export interface OriginalCellAlignmentBlockSelection {
  readonly [selection]: true;
}
export interface OriginalCellAlignmentBlockTarget {
  readonly [target]: true;
}
export interface SetOriginalCellAlignmentBlockPayload {
  target: OriginalCellAlignmentBlockTarget;
  value: OriginalCellAlignment;
}
export const SET_ORIGINAL_CELL_ALIGNMENT_BLOCK_COMMAND =
  createCommand<SetOriginalCellAlignmentBlockPayload>('set-original-cell-vertical-alignment-batch');

export function originalCellAlignmentBlockWitness(
  state: EditorState,
  input: SourceTableCellBlockWitness,
) {
  const content = state.content as {
    format?: string;
    limited?: boolean;
    readOnly?: boolean;
    viewKind?: unknown;
    window?: unknown;
    createdTableHostPending?: boolean;
    originalCellVerticalAlignmentBatchAvailable?: boolean;
  } | null;
  const capabilities = state.capabilities as {
    readOnly?: boolean;
    originalCellVerticalAlignmentBatchAvailable?: boolean;
  } | null;
  if (
    state.status !== 'ready' ||
    state.historyRecoveryRequired ||
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    capabilities?.readOnly ||
    capabilities?.originalCellVerticalAlignmentBatchAvailable !== true ||
    content?.readOnly ||
    content?.originalCellVerticalAlignmentBatchAvailable !== true ||
    (content.format !== 'hwp5' && content.format !== 'hwpx') ||
    content.limited !== false ||
    content.viewKind ||
    content.window ||
    content.createdTableHostPending
  )
    throw Error('OriginalCellVerticalAlignmentBatchUnavailable');
  const witness = copyOwned(input);
  const { selectedCells, top, left, bottom, right } = sourceTableCellBlockPlan(
    state,
    witness,
    true,
  );
  if (selectedCells < 2) throw Error('OriginalCellAlignmentBlockRequiresMultipleCells');
  return freezeDTO({
    section: witness.section,
    tableNode: witness.tableNode,
    rows: witness.rows,
    columns: witness.columns,
    rectangle: { top, left, bottom, right },
    cells: witness.cells.map(({ listNode, row, column, paragraphs }) => ({
      listNode,
      row,
      column,
      paragraphs,
    })),
  });
}

function alignmentValue(value: unknown): value is OriginalCellAlignment {
  return value === 'TOP' || value === 'CENTER' || value === 'BOTTOM';
}

export function captureOriginalCellAlignmentBlockPayload(
  input: unknown,
): SetOriginalCellAlignmentBlockPayload {
  const payload = record(input, ['target', 'value']);
  if (!payload.target || typeof payload.target !== 'object' || !alignmentValue(payload.value))
    throw Error('InvalidOriginalCellAlignmentBlockCommand');
  return Object.freeze({
    target: payload.target as OriginalCellAlignmentBlockTarget,
    value: payload.value,
  });
}

export function observeOriginalCellAlignmentBlock(
  input: unknown,
  witness: ReturnType<typeof originalCellAlignmentBlockWitness>,
  format: unknown,
  revision: number | undefined,
): Readonly<{
  native: unknown;
  editable: boolean;
  value: OriginalCellAlignment | null | 'mixed';
}> {
  const observation = checkedOriginalCellBlockObservation(input);
  const { rectangle } = witness;
  const box = observation.rectangle;
  if (
    observation.format !== format ||
    observation.section !== witness.section ||
    observation.tableNode !== witness.tableNode ||
    observation.rows !== witness.rows ||
    observation.columns !== witness.columns ||
    box.top !== rectangle.top ||
    box.left !== rectangle.left ||
    box.bottom !== rectangle.bottom ||
    box.right !== rectangle.right ||
    revision === undefined ||
    observation.historyRevision !== revision ||
    !observation.scope ||
    observation.cells.length !== witness.cells.length
  )
    throw Error('OriginalCellAlignmentBlockOwnerMismatch');
  const selected = new Map(witness.cells.map((cell) => [cell.listNode, cell]));
  for (const cell of observation.cells) {
    const expected = selected.get(cell.listNode);
    if (
      !expected ||
      expected.row !== cell.row ||
      expected.column !== cell.column ||
      cell.paragraphs.length !== expected.paragraphs.length ||
      expected.paragraphs.some((id, index) => id !== cell.paragraphs[index])
    )
      throw Error('OriginalCellAlignmentBlockOwnerMismatch');
    selected.delete(cell.listNode);
  }
  const first = observation.cells[0].value;
  return Object.freeze({
    native: observation,
    editable: observation.editable,
    value: observation.cells.every((cell) => cell.value === first) ? first : ('mixed' as const),
  });
}
