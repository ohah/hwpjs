import type { NativeEditOutcome } from '../packages/core/src/contracts/native-edit-outcome.ts';
export type { NativeEditOutcome } from '../packages/core/src/contracts/native-edit-outcome.ts';
export interface NativeEditMemory {
  withBytes<T>(bytes: Uint8Array, invoke: (pointer: number, length: number) => T): T;
  error(): Error;
}
export function applyNativeEdit(
  memory: NativeEditMemory,
  bytes: Uint8Array,
  invoke: (pointer: number, length: number) => number,
  invalidResult: string,
): NativeEditOutcome;
