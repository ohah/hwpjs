import type { TableCellBorderDraft } from './table-cell-border-port.ts';

export type TableCellFillKind = 'none' | 'solid' | 'hatch' | 'linear';
export type TableCellHatchStyle =
  | 'HORIZONTAL'
  | 'VERTICAL'
  | 'BACK_SLASH'
  | 'SLASH'
  | 'CROSS'
  | 'CROSS_DIAGONAL';

/** Form strings only. The port owns exact RGB/unit validation and Native requests. */
export type TableCellFillDraft = {
  color: string;
  dirty: boolean;
  kind?: TableCellFillKind;
  hatchColor?: string;
  hatchStyle?: TableCellHatchStyle;
  endColor?: string;
  angle?: string;
  centerX?: string;
  centerY?: string;
  step?: string;
  stepCenter?: string;
};
export type TableCellAppearanceTargetDraft = {
  mode: 'cell' | 'range' | 'table';
  region?: 'outer' | 'inner' | 'all';
  startRow: string;
  endRow: string;
  startColumn: string;
  endColumn: string;
};
export type TableCellAppearanceDraft = {
  border:
    | (TableCellBorderDraft &
        TableCellAppearanceTargetDraft & {
          region: 'outer' | 'inner' | 'all';
        })
    | null;
  background: TableCellFillDraft | null;
  target?: TableCellAppearanceTargetDraft;
};
