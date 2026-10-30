import { createReaderRuntime } from '../../../../web/preview/reader-runtime.mjs';
import { ownObservation } from '../state/owned.ts';
import type { RuntimeMessage, RuntimeReply } from '../contracts.ts';

/** Worker 내부 데이터 생성 전용. Module 등록·Native origin 발급은 하지 않는다. */
export function createWorkerReaderDataRuntime(options: {
  wasmModule: WebAssembly.Module;
  referenceScope?: string;
}) {
  const backend = createReaderRuntime(options);
  return {
    async request(message: RuntimeMessage, ownerWindowProjection = false): Promise<RuntimeReply> {
      const raw = await backend.request(message, undefined, ownerWindowProjection);
      return ownObservation({ ...raw, meta: backend.outcome(raw) })() as RuntimeReply;
    },
    dispose() {
      return backend.dispose();
    },
  };
}
