import { createReaderEditorRuntime } from "./runtime/reader-runtime.ts";
import type { EditorRuntime, RuntimeMessage } from "./contracts.ts";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(value: unknown): void;
};
let runtime: EditorRuntime | undefined;
let queue = Promise.resolve();
scope.onmessage = event => {
  const { id, message } = event.data ?? {};
  queue = queue.then(async () => {
    try {
      if (!Number.isSafeInteger(id) || !message || typeof message.kind !== "string") throw Error("InvalidRuntimeEnvelope");
      if (message.kind === "initialize-runtime") {
        if (runtime) throw Error("RuntimeAlreadyInitialized");
        if (!(message.wasmModule instanceof WebAssembly.Module)) throw Error("InvalidWasmModule");
        runtime = createReaderEditorRuntime({ wasmModule: message.wasmModule, referenceScope: message.referenceScope });
        scope.postMessage({ id, reply: { kind: message.kind } });
      } else {
        if (!runtime) throw Error("RuntimeNotInitialized");
        scope.postMessage({ id, reply: await runtime.request(message as RuntimeMessage) });
      }
    } catch (error) {
      scope.postMessage({ id, transportError: error instanceof Error ? error.message : String(error) });
    }
  });
};
