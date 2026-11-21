import type { EditorState } from '../state/editor-state.ts';
import { createdCellPropertiesMessage as admitCreatedCellPropertiesRequest } from '../../../../js/created-cell-properties.mjs';
export interface CreatedCellPropertiesPayload {
  section: number;
  identity: string;
  row: number;
  column: number;
  expected: { width: number; height: number };
  size?: { width?: number; height?: number };
  verticalAlignment?: 0 | 1 | 2;
  appearance?: {
    borders?: Partial<
      Record<
        'left' | 'right' | 'top' | 'bottom',
        { style?: string; width?: number; color?: number }
      >
    >;
    fill?: unknown;
  };
}

/** Generated identity only; Native owns the single History transaction. */
export function createdCellPropertiesMessage(
  input: CreatedCellPropertiesPayload,
  state: EditorState,
): Readonly<CreatedCellPropertiesPayload & { kind: 'created-cell-properties' }> {
  return admitCreatedCellPropertiesRequest(input, state);
}
