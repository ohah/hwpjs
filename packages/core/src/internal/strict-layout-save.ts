import type { SaveResult } from '../editor/create-editor.ts';

/** Not exported from the package. Only createEditor binds an owned bridge. */
export interface StrictLayoutLease {
  readonly snapshot: unknown;
}
export interface StrictLayoutSaveBridge {
  available(): boolean;
  prepare(options: {
    allowUnprotectedOutput: boolean;
    signal?: AbortSignal;
  }): Promise<StrictLayoutLease>;
  check(lease: StrictLayoutLease): void;
  commit(lease: StrictLayoutLease, lines: unknown): Promise<SaveResult>;
  cancel(lease: StrictLayoutLease): Promise<void>;
  publish(
    lease: StrictLayoutLease,
    result: SaveResult,
    publish: (result: SaveResult) => void,
  ): void;
  finish(lease: StrictLayoutLease): void;
}
const bridges = new WeakMap<object, StrictLayoutSaveBridge>();
export function bindStrictLayoutSaveBridge(editor: object, bridge: StrictLayoutSaveBridge) {
  if (bridges.has(editor)) throw Error('StrictLayoutBridgeAlreadyOwned');
  bridges.set(editor, bridge);
}
export function strictLayoutSaveBridge(editor: object): StrictLayoutSaveBridge {
  const bridge = bridges.get(editor);
  if (!bridge) throw Error('StrictMeasuredSaveUnavailable');
  return bridge;
}
