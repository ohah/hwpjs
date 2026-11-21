export type OriginalCellAlignment = 'TOP' | 'CENTER' | 'BOTTOM';
export interface OriginalCellSelector {
  section: number;
  paragraph: number;
  tableNode: number;
  listNode: number;
}
export interface OriginalCellObservation extends OriginalCellSelector {
  schemaVersion: 1;
  format: 'hwp5' | 'hwpx';
  lease: string;
  historyRevision: number;
  value: OriginalCellAlignment | null;
  editable: boolean;
  scope?: string;
}
export function checkedOriginalCellSelector(input: unknown): Readonly<OriginalCellSelector>;
export function checkedOriginalCellAlignment(input: unknown): OriginalCellAlignment;
export function checkedOriginalCellObservation(input: unknown): Readonly<OriginalCellObservation>;
export function checkedOriginalCellRequest(
  input: unknown,
): Readonly<{ before: OriginalCellObservation; value: OriginalCellAlignment }>;
export function createOriginalCellVerticalAlignmentApi(options: any): {
  supportsOriginalCellVerticalAlignment(): boolean;
  originalCellVerticalAlignment(selector: OriginalCellSelector): Readonly<OriginalCellObservation>;
  setOriginalCellVerticalAlignment(input: unknown): any;
};
