import type { NativeEditOutcome } from './native-edit-outcome.mjs';
export interface LiveImageInsertOptions {
  readonly imageBytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}
export function checkedImageInsertOptions(input: unknown): LiveImageInsertOptions;
export function createLiveImageInsertApi(options: {
  wasm: Record<string, unknown>;
  memory: {
    withBytes<T>(bytes: Uint8Array, action: (ptr: number, size: number) => T): T;
    error(): { message: string };
  };
  check(): void;
  encode?: (reference: unknown) => Uint8Array;
}): {
  supportsImageInsertionAbi(): boolean;
  insertImage(input: unknown): NativeEditOutcome;
};
