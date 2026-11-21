import { createCommand } from './commands.ts';
import { ownObjectGeometryRecord as record } from '../../../../js/object-geometry-edit.mjs';
import { checkedCellInsetsPatch } from '../../../../js/original-cell-insets.mjs';
import type { OriginalCellSelector } from './original-cell-vertical-alignment-dto.ts';
import type { CellInsetsPatch, CellInsetsValue } from './original-cell-insets-dto.ts';
export type { CellInsetsPatch, CellInsetsValue };
declare const insetsTarget: unique symbol;
export interface OriginalCellInsetsTarget {
  readonly [insetsTarget]: true;
}
export type OriginalCellInsetsRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'readonly';
      reason: string;
      observation: CellInsetsValue;
      selector: Readonly<OriginalCellSelector>;
    }>
  | Readonly<{
      state: 'available';
      target: OriginalCellInsetsTarget;
      observation: CellInsetsValue;
      selector: Readonly<OriginalCellSelector>;
    }>;
export interface SetOriginalCellInsetsPayload {
  target: OriginalCellInsetsTarget;
  patch: CellInsetsPatch;
}
export const SET_ORIGINAL_CELL_INSETS_COMMAND = createCommand<SetOriginalCellInsetsPayload>(
  'set-original-cell-insets',
);
export function captureOriginalCellInsetsPayload(input: unknown): SetOriginalCellInsetsPayload {
  const v = record(input, ['target', 'patch']);
  if (!v.target || typeof v.target !== 'object') throw Error('ForeignOriginalCellInsetsTarget');
  return Object.freeze({
    target: v.target as OriginalCellInsetsTarget,
    patch: checkedCellInsetsPatch(v.patch),
  });
}
