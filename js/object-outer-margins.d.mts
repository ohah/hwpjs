import type {
  ObjectOuterMargins,
  ObjectOuterMarginsSelector,
  HwpxObjectOuterMarginsObservation as NativeObjectOuterMarginsObservation,
  NativeObjectOuterMarginsRequest,
} from '../packages/core/src/commands/object-outer-margins-dto.ts';
import type { NativeEditOutcome } from '../packages/core/src/contracts/native-edit-outcome.ts';
export function checkedObjectOuterMargins(value: unknown): ObjectOuterMargins;
export function checkedObjectOuterMarginsObservation(
  value: unknown,
): NativeObjectOuterMarginsObservation;
export function checkedObjectOuterMarginsRequest(value: unknown): NativeObjectOuterMarginsRequest;
export interface ObjectOuterMarginsApi {
  supportsObjectOuterMargins(): boolean;
  objectOuterMargins(selector: Extract<ObjectOuterMarginsSelector, {kind: 'drawing'}>): NativeObjectOuterMarginsObservation;
  setObjectOuterMargins(request: NativeObjectOuterMarginsRequest): NativeEditOutcome;
}
export function createObjectOuterMarginsApi(options: {
  wasm: Record<string, unknown>;
  memory: {
    withBytes<T>(bytes: Uint8Array, action: (ptr: number, length: number) => T): T;
    error(): Error;
    copy(ptr: number, length: number): Uint8Array;
  };
  check(): void;
}): ObjectOuterMarginsApi;
