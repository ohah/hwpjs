import type { CreatedCellTypingApi } from '../packages/core/src/commands/created-cell-typing-dto.ts';
import type { NativeEditMemory } from './native-edit-outcome.mjs';
export type {
  CreatedCellTypingRequest,
  CreatedCellTypingCapabilities,
  CreatedCellTypingApi,
} from '../packages/core/src/commands/created-cell-typing-dto.ts';
export function createCreatedCellTypingApi(options: {
  readonly wasm: Readonly<Record<string, unknown>>;
  readonly memory: NativeEditMemory;
  readonly prefix: 'hwp5_edit' | 'hwpx_edit';
  check(): void;
  available(): boolean;
  capabilities(): {
    readonly format: 'hwp5' | 'hwpx';
    readonly binding: Readonly<{ session: string; revision: number }>;
    readonly limits: Readonly<Record<string, number>>;
  };
}): CreatedCellTypingApi;
