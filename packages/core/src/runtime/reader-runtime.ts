import { hwp5VerticalMarginsBackendQualified } from '../../../../js/hwp5-vertical-margins-qualification.mjs';
import {
  createNativeReadSourceLifecycle,
  bindNativeReadSourceRuntime,
} from '../internal/native-read-source-origin.ts';
import { requestNamedFields } from '../editor/named-fields.ts';
import type { RuntimeProjectionPreference } from '../internal/runtime-admission.ts';
import { bindRuntimeAdmission } from '../internal/runtime-admission.ts';
import type {
  EditorRuntime,
  RuntimeFactory,
  RuntimeMessage,
  RuntimeRequestContext,
  RuntimeReply,
} from '../contracts.ts';
// @ts-ignore Shared constructor ABI owns byte allocation and copying.
import { createNewDocumentBytes } from '../../../../js/new-document.mjs';
import { createReaderRuntime } from '../../../../web/preview/reader-runtime.mjs';
import { copyOwned, ownObservation } from '../state/owned.ts';
import { readKnownNativeModule } from '../wasm-module-loader.ts';
import {
  bindNativeRuntimeOrigin,
  canonicalRuntimeDescriptors,
  nativeOrigin,
  allowsOwnerWindowProjection,
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
  let verticalModule = options.wasmModule;
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
            verticalModule = module;
            contract = readKnownNativeModule(module);
            return module;
          },
        }
      : {}),
  });
  const replies = new WeakMap<object, NativeRuntimeOrigin>();
  let runtime: EditorRuntime;
  const trustedTransport = () => {
    if (!canonicalRuntimeDescriptors(runtime, request, dispose, Object.prototype)) tainted = true;
    return !closed && !tainted && !poisoned;
  };
  const valid = () => trustedTransport() && !!contract;
  const verticalValid = () =>
    trustedTransport() && hwp5VerticalMarginsBackendQualified(verticalModule);
  const readSources = createNativeReadSourceLifecycle(() => contract, valid);
  async function request(message: RuntimeMessage, context?: RuntimeRequestContext) {
    return requestInternal(message, context);
  }
  async function requestInternal(
    message: RuntimeMessage,
    context?: RuntimeRequestContext,
    admission?: () => void,
    projection: RuntimeProjectionPreference = false,
  ) {
    let ownedProjection: RuntimeProjectionPreference = false;
    try {
      ownedProjection = copyOwned(projection);
    } catch {
      /* malformed hint keeps full reply */
    }
    const captured = context ? { ...context } : undefined,
      kind = message.kind;
    const readTicket = readSources.begin(kind, captured);
    const raw = await backend.request(
      message,
      admission,
      allowsOwnerWindowProjection(contract) && valid() ? ownedProjection : false,
    );
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
    readSources.publish(readTicket, reply, captured, sequence, true);
    const origin = nativeOrigin(kind, reply, captured, sequence, contract, valid);
    if (origin) replies.set(reply, origin);
    return reply;
  }
  function dispose() {
    closed = true;
    readSources.revoke();
    return backend.dispose();
  }
  runtime = {
    request,
    dispose,
    readNamedFields: (context) => requestNamedFields(request, context),
  };
  bindRuntimeAdmission(
    runtime,
    (message, context, admission, projection) =>
      requestInternal(message, context, admission, projection),
    (kind) =>
      !closed &&
      !poisoned &&
      (!['hwp5-vertical-object-margins-query', 'hwp5-vertical-object-margins-set'].includes(
        kind ?? '',
      ) ||
        verticalValid()) &&
      (![
        'picture-replacement-query',
        'picture-replace',
        'object-outer-margins-query',
        'object-body-flow-query',
        'object-outer-margins-set',
        'object-body-flow-set',
      ].includes(kind ?? '') ||
        valid()),
  );
  origins.set(runtime, {
    valid,
    read: (reply, ctx) => {
      if (!valid()) return;
      const o = replies.get(reply);
      replies.delete(reply);
      return o && sameRequestContext(o.context, ctx) ? o : undefined;
    },
  });
  bindNativeReadSourceRuntime(runtime, readSources.consume);
  bindNativeRuntimeOrigin(runtime, (reply, ctx) =>
    consumeReaderNativeGeometryOrigin(runtime, reply, ctx),
  );
  return runtime;
}
export function createReaderRuntimeFactory(options: ReaderRuntimeOptions = {}): RuntimeFactory {
  const captured = { ...options };
  return Object.assign(() => createReaderEditorRuntime(captured), {
    async createDocumentBytes(format: 'hwp5' | 'hwpx'): Promise<Uint8Array> {
      const module = captured.wasmModule ?? (await captured.loadWasmModule?.());
      if (!module) throw Error('ExplicitWasmRequired');
      return createNewDocumentBytes(module, format);
    },
  });
}
