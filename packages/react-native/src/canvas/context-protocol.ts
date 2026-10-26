/** Low-level packet inventory for the real C++ Context JSI service.
 * This does not replace EditorRuntime's shared command/snapshot projection.
 * There are no raw native pointer fields. Tokens are bridge-bound uint32 pairs.
 */
import type { NativeToken } from '../native/backend-contract.ts';
declare const nativeContextToken: unique symbol;
/** Runtime token is a native HostObject capability, not a serializable DTO. */
export interface NativeContextToken extends NativeToken {
  readonly [nativeContextToken]: true;
}
export type NativeContextPacket =
  | {
      readonly kind: 'history-configure';
      readonly token: NativeContextToken;
      readonly expectedRevision: number;
      readonly bytes: Uint8Array;
    }
  | { readonly kind: 'history-stats'; readonly token: NativeContextToken }
  | {
      readonly kind: 'render-sources';
      readonly token: NativeContextToken;
      readonly expectedRevision: number;
    }
  | {
      readonly kind: 'picture-bytes';
      readonly token: NativeContextToken;
      readonly expectedRevision: number;
      readonly section: number;
      readonly pictureNode: number;
    }
  | { readonly kind: 'open'; readonly format: 1 | 2; readonly bytes: Uint8Array | ArrayBuffer }
  | {
      readonly kind: 'read';
      readonly token: NativeContextToken;
      readonly section: number;
      readonly paragraph: number;
    }
  | {
      readonly kind: 'splice';
      readonly token: NativeContextToken;
      readonly expectedRevision: number;
      readonly section: number;
      readonly paragraph: number;
      readonly startUnit: number;
      readonly deletedUnits: number;
      readonly bytes: Uint8Array | ArrayBuffer;
    }
  | {
      readonly kind: 'save';
      readonly token: NativeContextToken;
      readonly expectedRevision: number;
      readonly allowStaleLayout: boolean;
    }
  | {
      readonly kind: 'history';
      readonly token: NativeContextToken;
      readonly expectedRevision: number;
      readonly redo: boolean;
    }
  | {
      readonly kind: 'snapshot-window';
      readonly token: NativeContextToken;
      readonly section: number;
      readonly startOrdinal: number;
      readonly count: number;
      readonly expectedRevision: number;
    }
  | { readonly kind: 'state' | 'close' | 'snapshot'; readonly token: NativeContextToken };
export interface NativeContextResult {
  readonly kind: NativeContextPacket['kind'] | 'dispose';
  readonly status: number;
  readonly error?: string;
  readonly token?: NativeContextToken;
  readonly revision?: number;
  readonly epoch?: number;
  readonly historyRevision?: number;
  readonly undoCount?: number;
  readonly redoCount?: number;
  readonly bytes?: Uint8Array;
  readonly encoding?: 0 | 1 | 2;
  readonly outputRevision?: number;
  readonly savedRevision?: number;
  readonly layoutRequiresReflow?: boolean | null;
  readonly meta: {
    readonly application: 'unapplied' | 'applied' | 'unknown';
    readonly changed: boolean | null;
  };
}
export interface NativeContextPort {
  readonly descriptor: {
    readonly protocol: 'hwpjs.native-context/1';
    readonly abiVersion: 1;
    readonly historyProtocol?: 'hwpjs.native-history/2';
    readonly snapshotProtocol?: 'hwpjs.native-snapshot/2';
    readonly renderSourcesProtocol?: 'hwpjs.native-render-sources/3';
    readonly projection: 'format-native-wire';
  };
  request(packet: NativeContextPacket): Promise<NativeContextResult>;
  invalidate(): void;
  dispose(): Promise<NativeContextResult>;
}
