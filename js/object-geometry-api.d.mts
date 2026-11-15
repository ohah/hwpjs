import type {
  ObjectGeometryObservation,
  ObjectGeometrySelector,
  objectGeometryMessage,
} from './object-geometry-edit.mjs';
import type { NativeEditOutcome, NativeEditMemory } from './native-edit-outcome.mjs';
export interface ObjectGeometryApi {
  supportsObjectGeometry(): boolean;
  objectGeometry(selector: ObjectGeometrySelector): ObjectGeometryObservation;
  setObjectGeometry(
    request: ReturnType<typeof objectGeometryMessage>['request'],
  ): NativeEditOutcome;
}
export function createObjectGeometryApi(options: {
  wasm: Record<string, any>;
  memory: NativeEditMemory & { copy(pointer: number, length: number): Uint8Array };
  check(): void;
  format?: 'hwp5' | 'hwpx';
}): ObjectGeometryApi;
