import type { RuntimeMessage, RuntimeReply } from './contracts.ts';
import type { EditorState, StateToken } from './state/editor-state.ts';
import type { CommandResult } from './editor/create-editor.ts';
import type {
  SourceTableCellBlockWitness,
  SourceTableCellMergeTarget,
} from './commands/source-table-cell-merge.ts';
import type { SelectionTarget } from './commands/commands.ts';

export type CompositionSettlement = 'committed' | 'unchanged' | 'blocked';
export interface InputSurfaceHooks {
  commitComposition(): CompositionSettlement | Promise<CompositionSettlement>;
  isOutputInputSettled?(): boolean;
  cancelComposition(reason: 'detach' | 'load' | 'external-replace' | 'dispose'): void;
}
export interface SurfaceRequestOptions {
  token: StateToken;
  /** The existing input controller has already converted display offsets. Never convert again. */
  coordinates: 'legacy-native';
}
export interface InputSurfaceLease {
  readonly id: string;
  readonly generation: number;
  isActive(): boolean;
  request(
    message: RuntimeMessage,
    options: SurfaceRequestOptions,
  ): Promise<CommandResult | RuntimeReply>;
  captureSourceTableCellMerge?(
    witness: SourceTableCellBlockWitness,
    current: () => boolean,
  ): SourceTableCellMergeTarget | null;
  publishSelection(target: SelectionTarget | null): Promise<EditorState>;
  release(): void;
}
