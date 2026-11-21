import type { CreatedCellPropertiesPayload as CreatedCellPropertiesRequest } from '../packages/core/src/commands/created-cell-properties.ts';
export type { CreatedCellPropertiesRequest };

export type CreatedCellPropertiesOutcome =
  | { application: 'applied'; changed: true }
  | { application: 'not-applied'; changed: false }
  | { application: 'unknown'; changed: null };
export function createCreatedCellPropertiesApi(input: {
  wasm: Record<string, any>;
  memory: any;
  check(): void;
  prefix: 'hwp5_edit' | 'hwpx_edit';
}): {
  supportsCreatedCellProperties(): boolean;
  supportsCreatedCellPropertiesProjection(): boolean;
  createdCellPropertiesProjection(section: number): unknown[];
  editCreatedCellProperties(request: CreatedCellPropertiesRequest): CreatedCellPropertiesOutcome;
};
