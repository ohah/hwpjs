import type { OriginalCellSelector } from './original-cell-vertical-alignment.mjs';
import type {
  CellInsetsPatch,
  CellInsetsValue,
} from '../packages/core/src/commands/original-cell-insets-dto.ts';
export interface CellInsetsObservation extends OriginalCellSelector, CellInsetsValue {
  schemaVersion: 1;
  format: 'hwp5' | 'hwpx';
  lease: string | null;
  historyRevision: number;
  editable: boolean;
  scope?: string;
}
export function checkedOriginalCellSelector(input: unknown): Readonly<OriginalCellSelector>;
export function checkedCellInsetsPatch(input: unknown): CellInsetsPatch;
export function checkedCellInsetsObservation(input: unknown): Readonly<CellInsetsObservation>;
export function checkedCellInsetsRequest(
  input: unknown,
): Readonly<{ before: CellInsetsObservation; patch: CellInsetsPatch }>;
export function createOriginalCellInsetsApi(options: any): {
  supportsOriginalCellInsets(): boolean;
  originalCellInsets(selector: OriginalCellSelector): Readonly<CellInsetsObservation>;
  setOriginalCellInsets(input: unknown): any;
};
