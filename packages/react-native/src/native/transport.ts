import type { RuntimeMessage, RuntimeReply, RuntimeRequestContext } from '@hwpjs/core';

/** JS-facing transport contains owned DTOs only. Native pointer/ArrayBuffer views
 * are copied/released inside the native provider before this boundary resolves.
 */
export interface NativeTransportDescriptor {
  readonly protocol: 'hwpjs.editor-runtime/1';
  readonly abiVersion: 1;
  readonly projection: 'shared-provider';
  readonly implementation: string;
}
export interface NativeRuntimeTransport {
  readonly descriptor: NativeTransportDescriptor;
  request(message: RuntimeMessage, context?: RuntimeRequestContext): Promise<RuntimeReply>;
  /** Synchronous terminal fence. Must not free a running operation's context. */
  invalidate(): void;
  /** Drain native work, release outputs/contexts once, then resolve. */
  dispose(): void | Promise<void>;
}
export type NativeTransportFactory = () => NativeRuntimeTransport | Promise<NativeRuntimeTransport>;
export type NativeBackendAvailability =
  | { readonly status: 'unavailable'; readonly reason: 'NativeBackendNotInstalled' }
  | { readonly status: 'configured'; readonly reason: 'TransportValidatedOnCreation' };

export class NativeBackendUnavailableError extends Error {
  readonly code = 'NativeBackendUnavailable';
  constructor() {
    super('NativeBackendUnavailable: inject a native shared-provider transport; no WebView fallback');
    this.name = 'NativeBackendUnavailableError';
  }
}
export class NativeRuntimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'NativeRuntimeError';
  }
}
