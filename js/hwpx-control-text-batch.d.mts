import type {
  ControlTextReadIdentity,
  ControlTextReadApi,
  ControlTextSnapshot,
} from '../packages/core/src/contracts/control-text-read.ts';
export type {
  ControlTextReadApi,
  ControlTextSnapshot,
  ControlTextRow,
  ControlTextUnit,
  ControlTextKind,
} from '../packages/core/src/contracts/control-text-read.ts';
export function decodeControlTextSnapshot(
  value: unknown,
  expectedSection: number,
  expectedIdentity?: ControlTextReadIdentity,
): ControlTextSnapshot;
export function createHwpxControlTextBatchApi(options: {
  wasm: Readonly<Record<string, unknown>>;
  memory: { copy(pointer: number, length: number): Uint8Array; error(): Error };
  check(): void;
}): ControlTextReadApi;

export function decodeControlTextIdentity(value: unknown, section: number): ControlTextReadIdentity;
