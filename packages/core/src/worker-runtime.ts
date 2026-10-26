import type {
  EditorRuntime,
  RuntimeFactory,
  RuntimeMessage,
  RuntimeReply,
  RuntimeRequestContext,
} from './contracts.ts';
import { createWasmModuleLoader } from './wasm-module-loader.ts';
import { copyOwned } from './state/owned.ts';
const ownedWorkers = new WeakSet<object>();
let workerScopeSequence = 0;

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

/** Browser transport only. Its worker owns exactly one candidate/active runtime. */
export function createWorkerEditorRuntime(options: WorkerRuntimeOptions = {}): EditorRuntime {
  if (workerScopeSequence >= Number.MAX_SAFE_INTEGER) throw Error('WorkerIdentityExhausted');
  const referenceScope = `worker:${++workerScopeSequence}`;
  const worker = options.workerFactory
    ? options.workerFactory(options.workerURL ?? new URL('./worker.js', import.meta.url))
    : new Worker(options.workerURL ?? new URL('./worker.js', import.meta.url), { type: 'module' });
  if (ownedWorkers.has(worker)) throw Error('WorkerAlreadyOwned');
  ownedWorkers.add(worker);
  let closed = false,
    sequence = 0,
    failure: Error | undefined;
  const pending = new Map<
    number,
    { resolve: (value: RuntimeReply) => void; reject: (error: Error) => void }
  >();
  const rejectAll = (error: Error) => {
    for (const item of pending.values()) item.reject(error);
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
    else item.resolve(value.reply);
  };
  const shutdown = (reason: Error) => {
    if (closed) return;
    closed = true;
    failure = reason;
    rejectAll(reason);
    worker.removeEventListener('message', receive);
    worker.removeEventListener('error', failed);
    worker.removeEventListener('messageerror', failed);
    worker.terminate();
  };
  const failed = () => shutdown(Error('WorkerRuntimeFailed'));
  worker.addEventListener('message', receive);
  worker.addEventListener('error', failed);
  worker.addEventListener('messageerror', failed);
  const send = (message: unknown): Promise<RuntimeReply> =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(failure ?? Error('RuntimeDisposed'));
        return;
      }
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, message });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  const load =
    options.loadWasmModule ??
    (options.wasmModule
      ? async () => options.wasmModule!
      : createWasmModuleLoader({ url: options.wasmURL }));
  const ready = Promise.resolve()
    .then(load)
    .then((module) => send({ kind: 'initialize-runtime', wasmModule: module, referenceScope }));
  void ready.catch((error) => shutdown(error instanceof Error ? error : Error(String(error))));
  return {
    async request(message: RuntimeMessage, context?: RuntimeRequestContext) {
      // Copy before the module loader can yield; postMessage will copy once more.
      const owned = copyOwned(message),
        captured = context ? { ...context } : undefined;
      await ready;
      const reply = await send(owned);
      return { ...reply, meta: { ...reply.meta, ...(captured ? { context: captured } : {}) } };
    },
    dispose() {
      shutdown(Error('RuntimeDisposed'));
    },
  };
}

export function createWorkerRuntimeFactory(
  options: WorkerRuntimeOptions = {},
): WorkerRuntimeFactory {
  const captured = { ...options };
  const loader =
    captured.loadWasmModule ??
    (captured.wasmModule
      ? async () => captured.wasmModule!
      : createWasmModuleLoader({ url: captured.wasmURL }));
  let compiled: Promise<WebAssembly.Module> | undefined;
  const loadWasmModule = () => {
    if (compiled) return compiled;
    const pending = Promise.resolve().then(loader);
    compiled = pending;
    void pending.catch(() => {
      if (compiled === pending) compiled = undefined;
    });
    return pending;
  };
  return Object.assign(() => createWorkerEditorRuntime({ ...captured, loadWasmModule }), {
    preload: loadWasmModule,
  });
}
