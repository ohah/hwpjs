import type {
  ObjectBodyFlow,
  ObjectBodyFlowSelector,
  NativeObjectBodyFlowObservation,
  NativeObjectBodyFlowRequest,
} from '../packages/core/src/commands/object-body-flow-dto.ts';
import type { NativeEditOutcome } from '../packages/core/src/contracts/native-edit-outcome.ts';
export function checkedObjectBodyFlow(value: unknown): ObjectBodyFlow;
export function checkedObjectBodyFlowObservation(value: unknown): NativeObjectBodyFlowObservation;
export function checkedObjectBodyFlowRequest(value: unknown): NativeObjectBodyFlowRequest;
export interface ObjectBodyFlowApi {
  supportsObjectBodyFlow(): boolean;
  objectBodyFlow(selector: ObjectBodyFlowSelector): NativeObjectBodyFlowObservation;
  setObjectBodyFlow(request: NativeObjectBodyFlowRequest): NativeEditOutcome;
}
export function createObjectBodyFlowApi(options: {
  wasm: Record<string, unknown>;
  memory: {
    withBytes<T>(bytes: Uint8Array, action: (ptr: number, length: number) => T): T;
    error(): Error;
    copy(ptr: number, length: number): Uint8Array;
  };
  check(): void;
}): ObjectBodyFlowApi;
