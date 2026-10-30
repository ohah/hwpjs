import type { RuntimeProjectionPreference } from './internal/runtime-admission.ts';
import { createWorkerReaderDataRuntime } from './internal/worker-reader-data-runtime.ts';
import { workerResourceReply } from './internal/worker-resource-reply.ts';
import type { RuntimeMessage } from './contracts.ts';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(value: unknown, transfer?: Transferable[]): void;
};
let runtime: ReturnType<typeof createWorkerReaderDataRuntime> | undefined;
let queue = Promise.resolve();
scope.onmessage = (event) => {
  const { id, message, viewProjection } = event.data ?? {};
  queue = queue.then(async () => {
    try {
      if (!Number.isSafeInteger(id) || !message || typeof message.kind !== 'string')
        throw Error('InvalidRuntimeEnvelope');
      if (message.kind === 'initialize-runtime') {
        if (runtime) throw Error('RuntimeAlreadyInitialized');
        if (!(message.wasmModule instanceof WebAssembly.Module)) throw Error('InvalidWasmModule');
        runtime = createWorkerReaderDataRuntime({
          wasmModule: message.wasmModule,
          referenceScope: message.referenceScope,
        });
        scope.postMessage({ id, reply: { kind: message.kind } });
      } else {
        if (!runtime) throw Error('RuntimeNotInitialized');
        const outgoing = workerResourceReply(
          id,
          message.kind,
          await runtime.request(
            message as RuntimeMessage,
            viewProjection === 'owner-window-v1'
              ? true
              : typeof viewProjection === 'object' && viewProjection?.kind === 'history-window-v1'
                ? (viewProjection as RuntimeProjectionPreference)
                : false,
          ),
        );
        if (outgoing.transfer) scope.postMessage(outgoing.envelope, outgoing.transfer);
        else scope.postMessage(outgoing.envelope);
      }
    } catch (error) {
      scope.postMessage({
        id,
        transportError: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
