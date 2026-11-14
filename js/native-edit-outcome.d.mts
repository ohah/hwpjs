export interface NativeEditOutcome {
  readonly nativeCode?: 0 | 1 | 2 | 3;
  readonly application: 'applied' | 'unapplied' | 'unknown';
  readonly changed: boolean | null;
  readonly error?: string;
  readonly cleanupError?: string;
  readonly refreshRequired?: true;
}
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
