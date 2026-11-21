/** Portable Core value types. Runtime validators remain implementation dependencies. */
export type OriginalCellAlignment = 'TOP' | 'CENTER' | 'BOTTOM';
export interface OriginalCellSelector {
  section: number;
  paragraph: number;
  tableNode: number;
  listNode: number;
}
