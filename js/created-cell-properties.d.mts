import type { CreatedCellPropertiesRequest } from './created-cell-properties-api.mjs';
import type { EditorState } from '../packages/core/src/state/editor-state.ts';

export function captureCreatedCellPropertiesPatch(
  input: unknown,
): Readonly<Pick<CreatedCellPropertiesRequest, 'size' | 'appearance'>>;
export function captureCreatedCellPropertiesRequest(
  input: unknown,
): Readonly<CreatedCellPropertiesRequest>;
export function createdCellPropertiesMessage(
  input: unknown,
  state: Pick<EditorState, 'status' | 'historyRecoveryRequired' | 'content' | 'capabilities'>,
): Readonly<CreatedCellPropertiesRequest & { kind: 'created-cell-properties' }>;
