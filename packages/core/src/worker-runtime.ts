import type { RuntimeProjectionPreference } from './internal/runtime-admission.ts';
import { bindRuntimeAdmission } from './internal/runtime-admission.ts';
import { createNativeWorkerWitness } from './internal/native-worker-origin.ts';
import type {
  EditorRuntime,
  RuntimeFactory,
  RuntimeMessage,
  RuntimeReply,
  RuntimeRequestContext,
} from './contracts.ts';
import { createWasmModuleLoader, readKnownNativeModule } from './wasm-module-loader.ts';
import { copyOwned, ownObservation } from './state/owned.ts';
import {
  bindNativeRuntimeOrigin,
  canonicalRuntimeDescriptors,
  nativeOrigin,
  allowsOwnerWindowProjection,
  sameRequestContext,
} from './internal/native-runtime-origin.ts';
import type {
  NativeRuntimeOrigin,
  NativeModuleContract,
} from './internal/native-runtime-origin.ts';
import { KNOWN_WORKER_CODE_SHA256 } from './internal/known-worker-code.ts';
interface RuntimeWorker {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}
export interface WorkerRuntimeOptions {
  workerURL?: string | URL;
  wasmURL?: string | URL;
  wasmModule?: WebAssembly.Module;
  loadWasmModule?: () => Promise<WebAssembly.Module>;
  workerFactory?: (url: string | URL) => RuntimeWorker;
}
export type WorkerRuntimeFactory = RuntimeFactory & { preload(): Promise<WebAssembly.Module> };
const ownedWorkers = new WeakSet<object>();
let scopeSequence = 0;
const origins = new WeakMap<
  object,
  {
    valid: () => boolean;
    read: (reply: RuntimeReply, ctx: RuntimeRequestContext) => NativeRuntimeOrigin | undefined;
  }
>();
export function consumeWorkerNativeGeometryOrigin(
  runtime: object,
  reply: RuntimeReply,
  ctx: RuntimeRequestContext,
) {
  return origins.get(runtime)?.read(reply, ctx);
}
export function workerNativeGeometryAuthority(runtime: object) {
  return origins.get(runtime)?.valid() === true;
}
export function createWorkerEditorRuntime(options: WorkerRuntimeOptions = {}): EditorRuntime {
  if (scopeSequence >= Number.MAX_SAFE_INTEGER) throw Error('WorkerIdentityExhausted');
  const referenceScope = `worker:${++scopeSequence}`;
  const defaultURL = new URL('./worker.js', import.meta.url),
    custom = options.workerFactory !== undefined || options.workerURL !== undefined;
  let worker: RuntimeWorker | undefined,
    closed = false,
    failure: Error | undefined,
    sequence = 0,
    publication = 0,
    canonicalCode = false,
    tainted = false,
    poisoned = false,
    blobURL: string | undefined,
    contract: NativeModuleContract | undefined;
  const trustedReplies = new WeakSet<object>();
  const transportWitness = createNativeWorkerWitness();
  const pending = new Map<
      number,
      { resolve: (reply: RuntimeReply) => void; reject: (error: Error) => void }
    >(),
    proofs = new WeakMap<object, NativeRuntimeOrigin>();
  let runtime: EditorRuntime;
  const valid = () => {
    if (canonicalCode && !custom && !transportWitness.current(worker)) tainted = true;
    if (!canonicalRuntimeDescriptors(runtime, request, dispose, Object.prototype)) tainted = true;
    return (
      !closed &&
      !tainted &&
      !poisoned &&
      !custom &&
      canonicalCode &&
      !!contract &&
      transportWitness.current(worker)
    );
  };
  const rejectAll = (e: Error) => {
    for (const item of pending.values()) item.reject(e);
    pending.clear();
  };
  const receive = (event: MessageEvent) => {
    const value = event.data;
    if (!value || !Number.isSafeInteger(value.id)) return;
    const item = pending.get(value.id);
    if (!item) return;
    pending.delete(value.id);
    if (typeof value.transportError === 'string') item.reject(Error(value.transportError));
    else if (!value.reply || typeof value.reply.kind !== 'string')
      item.reject(Error('MalformedWorkerReply'));
    else {
      if (transportWitness.accepts(event, value)) trustedReplies.add(value.reply);
      item.resolve(value.reply);
    }
  };
  function shutdown(reason: Error) {
    if (closed) return;
    closed = true;
    failure = reason;
    rejectAll(reason);
    if (worker) {
      worker.removeEventListener('message', receive);
      worker.removeEventListener('error', failed);
      worker.removeEventListener('messageerror', failed);
      worker.terminate();
    }
    if (blobURL) URL.revokeObjectURL(blobURL);
  }
  function failed() {
    shutdown(Error('WorkerRuntimeFailed'));
  }
  function attach(w: RuntimeWorker) {
    if (ownedWorkers.has(w)) throw Error('WorkerAlreadyOwned');
    ownedWorkers.add(w);
    worker = w;
    w.addEventListener('message', receive);
    w.addEventListener('error', failed);
    w.addEventListener('messageerror', failed);
  }
  if (options.workerFactory) attach(options.workerFactory(options.workerURL ?? defaultURL));
  else if (options.workerURL !== undefined)
    attach(new Worker(options.workerURL, { type: 'module' }));
  async function canonicalWorker() {
    if (worker) return;
    if (globalThis.crypto?.subtle) {
      try {
        const response = await fetch(defaultURL, { cache: 'no-cache' });
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer()).slice(),
            digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
          const hash = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
          if (hash === KNOWN_WORKER_CODE_SHA256) {
            canonicalCode = true;
            blobURL = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
          }
        }
      } catch {
        /* Unknown packaged code keeps the ordinary Worker path without authority. */
      }
    }
    if (closed) throw Error('RuntimeDisposed');
    attach(new Worker(blobURL ?? defaultURL, { type: 'module' }));
  }
  const send = (
    message: unknown,
    admission?: () => void,
    projection: RuntimeProjectionPreference = false,
  ): Promise<RuntimeReply> =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(failure ?? Error('RuntimeDisposed'));
        return;
      }
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      try {
        admission?.();
        worker!.postMessage({
          id,
          message,
          ...(projection === true
            ? { viewProjection: 'owner-window-v1' }
            : projection && typeof projection === 'object'
              ? { viewProjection: projection }
              : {}),
        });
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : Error(String(error)));
      }
    });
  const load =
    options.loadWasmModule ??
    (options.wasmModule
      ? async () => options.wasmModule!
      : createWasmModuleLoader({ url: options.wasmURL }));
  const ready = Promise.resolve()
    .then(load)
    .then(async (module) => {
      contract = readKnownNativeModule(module);
      await canonicalWorker();
      return send({ kind: 'initialize-runtime', wasmModule: module, referenceScope });
    });
  void ready.catch((e) => shutdown(e instanceof Error ? e : Error(String(e))));
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
    const owned = copyOwned(message),
      captured = context ? { ...context } : undefined,
      kind = owned.kind;
    await ready;
    const raw = await send(
      owned,
      admission,
      allowsOwnerWindowProjection(contract) && valid() ? ownedProjection : false,
    );
    const reply = ownObservation({
      ...raw,
      meta: { ...raw.meta, ...(captured ? { context: captured } : {}) },
    })() as RuntimeReply;
    if (/MutationUncertain|HistoryMutationUncertain/.test(String(reply.error ?? '')))
      poisoned = true;
    if (
      reply.content !== undefined ||
      reply.error ||
      reply.meta?.changed === true ||
      ['splice', 'splice-current', 'undo', 'redo', 'format'].includes(kind)
    )
      publication++;
    const trusted = trustedReplies.has(raw);
    trustedReplies.delete(raw);
    const proof = trusted
      ? nativeOrigin(kind, reply, captured, publication, contract, valid)
      : undefined;
    if (proof) proofs.set(reply, proof);
    return reply;
  }
  function dispose() {
    shutdown(Error('RuntimeDisposed'));
  }
  runtime = { request, dispose };
  bindRuntimeAdmission(
    runtime,
    (message, context, admission, projection) =>
      requestInternal(message, context, admission, projection),
    () => !closed && !poisoned && !custom && canonicalCode && transportWitness.current(worker),
  );
  origins.set(runtime, {
    valid,
    read: (reply, ctx) => {
      if (!valid()) return;
      const proof = proofs.get(reply);
      proofs.delete(reply);
      return proof && sameRequestContext(proof.context, ctx) ? proof : undefined;
    },
  });
  bindNativeRuntimeOrigin(runtime, (reply, ctx) =>
    consumeWorkerNativeGeometryOrigin(runtime, reply, ctx),
  );
  return runtime;
}
export function createWorkerRuntimeFactory(
  options: WorkerRuntimeOptions = {},
): WorkerRuntimeFactory {
  const captured = { ...options },
    load =
      captured.loadWasmModule ??
      (captured.wasmModule
        ? async () => captured.wasmModule!
        : createWasmModuleLoader({ url: captured.wasmURL }));
  let compiled: Promise<WebAssembly.Module> | undefined;
  const loadWasmModule = () => {
    if (compiled) return compiled;
    const p = Promise.resolve().then(load);
    compiled = p;
    void p.catch(() => {
      if (compiled === p) compiled = undefined;
    });
    return p;
  };
  return Object.assign(() => createWorkerEditorRuntime({ ...captured, loadWasmModule }), {
    preload: loadWasmModule,
  });
}
