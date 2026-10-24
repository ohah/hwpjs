import type { EditorRuntime, RuntimeFactory, RuntimeMessage, RuntimeRequestContext, RuntimeReply } from '../contracts.ts';
import { createReaderRuntime } from '../../../../web/preview/reader-runtime.mjs';

export interface ReaderRuntimeOptions {
  wasmModule?: WebAssembly.Module;
  referenceScope?: string;
  loadWasmModule?: () => Promise<WebAssembly.Module>;
}

/** One owned document candidate. The controller decides when to publish or replace it. */
export function createReaderEditorRuntime(options: ReaderRuntimeOptions = {}): EditorRuntime {
  const backend = createReaderRuntime(options);
  return {
    request(message: RuntimeMessage, context?: RuntimeRequestContext): Promise<RuntimeReply> {
      // Capture before enqueue, including when the caller mutates its context immediately.
      const ownedContext = context === undefined ? undefined : { ...context };
      return backend.request(message).then((reply: RuntimeReply) => ({
        ...reply,
        meta: { ...backend.outcome(reply), ...(ownedContext === undefined ? {} : { context: ownedContext }) },
      }));
    },
    dispose: () => backend.dispose(),
  };
}

/** Artifact compilation may be shared by the injected loader; document instances are never shared. */
export function createReaderRuntimeFactory(options: ReaderRuntimeOptions = {}): RuntimeFactory {
  const ownedOptions = { ...options };
  return async () => createReaderEditorRuntime(ownedOptions);
}
