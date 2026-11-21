import type { OriginalCellAlignment } from './original-cell-vertical-alignment.mjs';
export interface OriginalCellBlockWitness {
  section: number;
  tableNode: number;
  rows: number;
  columns: number;
  rectangle: Readonly<{ top: number; left: number; bottom: number; right: number }>;
  cells: readonly Readonly<{
    listNode: number;
    row: number;
    column: number;
    paragraphs: readonly number[];
  }>[];
}
export interface OriginalCellBlockObservation extends OriginalCellBlockWitness {
  schemaVersion: 1;
  format: 'hwp5' | 'hwpx';
  lease: string;
  historyRevision: number;
  editable: boolean;
  scope?: string;
  cells: readonly Readonly<{
    listNode: number;
    row: number;
    column: number;
    paragraphs: readonly number[];
    value: OriginalCellAlignment | null;
    editable: boolean;
  }>[];
}
export function checkedOriginalCellBlockWitness(input: unknown): Readonly<OriginalCellBlockWitness>;
export function checkedOriginalCellBlockObservation(
  input: unknown,
): Readonly<OriginalCellBlockObservation>;
export function checkedOriginalCellBlockRequest(
  input: unknown,
): Readonly<{ before: OriginalCellBlockObservation; value: OriginalCellAlignment }>;
export function createOriginalCellVerticalAlignmentBatchApi(options: any): {
  supportsOriginalCellVerticalAlignmentBatch(): boolean;
  originalCellVerticalAlignmentBatch(
    witness: OriginalCellBlockWitness,
  ): Readonly<OriginalCellBlockObservation>;
  setOriginalCellVerticalAlignmentBatch(input: unknown): any;
};
