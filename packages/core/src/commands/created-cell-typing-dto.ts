import type { CharacterFormattingPatch } from './character-formatting-patch.ts';
import type { NativeEditOutcome } from '../contracts/native-edit-outcome.ts';

/** Logical pending-cell address. It is never a source paragraph SelectionTarget. */
export interface CreatedCellTypingRequest {
  readonly section: number;
  /** Canonical nonzero decimal u64; runtime validates its exact bounds. */
  readonly identity: string;
  readonly row: number;
  readonly column: number;
  readonly startUnit: number;
  readonly endUnit: number;
  readonly text: string;
  readonly insertion?: {
    readonly character?: CharacterFormattingPatch;
    readonly paragraph?: never;
    readonly reset?: never;
  };
}
export interface CreatedCellTypingCapabilities {
  readonly schemaVersion: 1;
  readonly atomic: true;
  readonly format: 'hwp5' | 'hwpx';
  readonly coordinateSpace: 'created-cell-utf16';
  readonly requiresHistoryProtocol: 2;
  readonly binding: Readonly<{ session: string; revision: number }>;
  readonly limits: Readonly<Record<string, number>>;
}
export interface CreatedCellTypingApi {
  supportsCreatedCellTypingAbi(): boolean;
  createdCellTypingCapabilities(): CreatedCellTypingCapabilities;
  spliceCreatedCell(request: CreatedCellTypingRequest): NativeEditOutcome;
}
