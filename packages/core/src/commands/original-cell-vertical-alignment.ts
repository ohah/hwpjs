import { originalCellPropertiesSelector } from './original-cell-owner.ts';
import type { EditorState } from '../state/editor-state.ts';
import { createCommand } from './commands.ts';
import { ownObjectGeometryRecord as record } from '../../../../js/object-geometry-edit.mjs';
import { checkedOriginalCellAlignment } from '../../../../js/original-cell-vertical-alignment.mjs';
import type {
  OriginalCellSelector,
  OriginalCellAlignment,
} from './original-cell-vertical-alignment-dto.ts';
export type { OriginalCellSelector, OriginalCellAlignment };
declare const selected: unique symbol;
declare const target: unique symbol;
export interface OriginalCellSelectionTarget {
  readonly [selected]: true;
}
export interface OriginalCellVerticalAlignmentTarget {
  readonly [target]: true;
}
export type OriginalCellVerticalAlignmentRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: OriginalCellVerticalAlignmentTarget;
      value: OriginalCellAlignment | null;
      selector: Readonly<OriginalCellSelector>;
    }>;
export interface SetOriginalCellVerticalAlignmentPayload {
  target: OriginalCellVerticalAlignmentTarget;
  value: OriginalCellAlignment;
}
export const SET_ORIGINAL_CELL_VERTICAL_ALIGNMENT_COMMAND =
  createCommand<SetOriginalCellVerticalAlignmentPayload>('set-original-cell-vertical-alignment');
export function captureOriginalCellAlignmentPayload(
  input: unknown,
): SetOriginalCellVerticalAlignmentPayload {
  const p = record(input, ['target', 'value']);
  if (!p.target || typeof p.target !== 'object') throw Error('ForeignOriginalCellTarget');
  return Object.freeze({
    target: p.target as OriginalCellVerticalAlignmentTarget,
    value: checkedOriginalCellAlignment(p.value),
  });
}
export function originalCellVerticalAlignmentSelector(
  state: EditorState,
  input: unknown,
): Readonly<OriginalCellSelector> {
  if ((state.capabilities as any)?.originalCellVerticalAlignmentAvailable !== true)
    throw Error('OriginalCellVerticalAlignmentUnavailable');
  return originalCellPropertiesSelector(state, input);
}
