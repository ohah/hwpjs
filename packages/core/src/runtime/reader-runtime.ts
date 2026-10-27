import type {
  EditorRuntime,
  RuntimeFactory,
  RuntimeMessage,
  RuntimeRequestContext,
  RuntimeReply,
} from '../contracts.ts';
import { createReaderRuntime } from '../../../../web/preview/reader-runtime.mjs';
import { ownObservation } from '../state/owned.ts';
import { readKnownNativeModule } from '../wasm-module-loader.ts';
import {
  bindNativeRuntimeOrigin,
  canonicalRuntimeDescriptors,
  nativeOrigin,
  sameRequestContext,
} from '../internal/native-runtime-origin.ts';
import type { NativeRuntimeOrigin } from '../internal/native-runtime-origin.ts';
const origins = new WeakMap<
  object,
  {
    read: (reply: RuntimeReply, ctx: RuntimeRequestContext) => NativeRuntimeOrigin | undefined;
    valid: () => boolean;
  }
>();
export function consumeReaderNativeGeometryOrigin(
  runtime: object,
  reply: RuntimeReply,
  ctx: RuntimeRequestContext,
) {
  return origins.get(runtime)?.read(reply, ctx);
}
export function readerNativeGeometryAuthority(runtime: object) {
  return origins.get(runtime)?.valid() === true;
}
export interface ReaderRuntimeOptions {
  wasmModule?: WebAssembly.Module;
  referenceScope?: string;
  loadWasmModule?: () => Promise<WebAssembly.Module>;
}
export function createReaderEditorRuntime(options: ReaderRuntimeOptions = {}): EditorRuntime {
  let contract = options.wasmModule ? readKnownNativeModule(options.wasmModule) : undefined,
    closed = false,
    sequence = 0,
    tainted = false,
    poisoned = false;
  const backend = createReaderRuntime({
    ...options,
    ...(options.loadWasmModule
      ? {
          loadWasmModule: async () => {
            const module = await options.loadWasmModule!();
            contract = readKnownNativeModule(module);
            return module;
          },
        }
      : {}),
  });
  const replies = new WeakMap<object, NativeRuntimeOrigin>();
  let runtime: EditorRuntime;
  const valid = () => {
    if (!canonicalRuntimeDescriptors(runtime, request, dispose, Object.prototype)) tainted = true;
    return !closed && !tainted && !poisoned && !!contract;
  };
  async function request(message: RuntimeMessage, context?: RuntimeRequestContext) {
    return requestInternal(message, context);
  }
  async function requestInternal(message: RuntimeMessage, context?: RuntimeRequestContext) {
    const captured = context ? { ...context } : undefined,
      kind = message.kind;
    const raw = await backend.request(message);
    const reply = ownObservation({
      ...raw,
      meta: { ...backend.outcome(raw), ...(captured ? { context: captured } : {}) },
    })() as RuntimeReply;
    if (/MutationUncertain|HistoryMutationUncertain/.test(String(reply.error ?? '')))
      poisoned = true;
    if (
      reply.content !== undefined ||
      reply.error ||
      reply.meta?.changed === true ||
      ['splice', 'splice-current', 'undo', 'redo', 'format'].includes(kind)
    )
      sequence++;
    const origin = nativeOrigin(kind, reply, captured, sequence, contract, valid);
    if (origin) replies.set(reply, origin);
    return reply;
  }
  function dispose() {
    closed = true;
    return backend.dispose();
  }
  runtime = { request, dispose };
  origins.set(runtime, {
    valid,
    read: (reply, ctx) => {
      if (!valid()) return;
      const o = replies.get(reply);
      replies.delete(reply);
      return o && sameRequestContext(o.context, ctx) ? o : undefined;
    },
  });
  bindNativeRuntimeOrigin(runtime, (reply, ctx) =>
    consumeReaderNativeGeometryOrigin(runtime, reply, ctx),
  );
  return runtime;
}
export function createReaderRuntimeFactory(options: ReaderRuntimeOptions = {}): RuntimeFactory {
  const captured = { ...options };
  return () => createReaderEditorRuntime(captured);
}
