import type { NativeEditOutcome, NativeEditMemory } from './native-edit-outcome.mjs';
declare const pageRestartIssuer: unique symbol;
export interface PageRestartObservation {
  readonly [pageRestartIssuer]: true;
  readonly lease: string;
  readonly session: string;
  readonly revision: string;
  readonly serial: string;
}
export type PageRestartRow =
  | Readonly<{
      section: number;
      controlNode: number;
      /** Public display ordinal, zero-based. Native HX IDs remain inside the lease. */
      paragraph: number;
      number: number;
      observation: PageRestartObservation;
      reason: null;
    }>
  | Readonly<{
      section: number;
      controlNode: number | null;
      paragraph: number | null;
      number: number | null;
      observation: null;
      reason: string;
    }>;
export interface PageRestartCapabilities {
  readonly schemaVersion: 1;
  readonly format: 'hwp5' | 'hwpx';
  readonly binding: Readonly<{ session: string; revision: string; serial: string }>;
  readonly rows: readonly PageRestartRow[];
}
export interface PageRestartApi {
  supportsPageRestartWrite(): boolean;
  pageRestartCapabilities(): PageRestartCapabilities;
  ownsPageRestartObservation(value: unknown): value is PageRestartObservation;
  writePageRestart(input: { before: PageRestartObservation; number: number }): NativeEditOutcome;
}
export function createPageRestartApi(options: {
  wasm: Record<string, unknown>;
  memory: NativeEditMemory & { copy(pointer: number, length: number): Uint8Array };
  check(): void;
  prefix: 'hwp5_edit' | 'hwpx_edit';
}): PageRestartApi;
