import type { RuntimeProjectionPreference } from '../../packages/core/src/internal/runtime-admission.ts';
import type { RuntimeMessage, RuntimeReply } from '../../packages/core/src/contracts.ts';
/** 기존 JavaScript 전송 경계의 타입이며 Native 검증 증거가 아닙니다. */
export interface ReaderRuntimeOptions {
  readonly wasmModule?: WebAssembly.Module;
  readonly loadWasmModule?: () => Promise<WebAssembly.Module>;
  readonly referenceScope?: string;
  readonly allowReload?: boolean;
}
export function createReaderRuntime(options?: ReaderRuntimeOptions): {
  request(
    message: RuntimeMessage,
    admission?: () => void,
    ownerWindowProjection?: RuntimeProjectionPreference,
  ): Promise<RuntimeReply>;
  outcome(reply: RuntimeReply): NonNullable<RuntimeReply['meta']>;
  dispose(): Promise<void>;
};

export function copyRuntimeMessage(message: RuntimeMessage): RuntimeMessage;
