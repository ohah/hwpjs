import {
  createReaderEditorRuntime2,
  createReaderRuntimeFactory2
} from "./index-wenq10ym.js";
import"./index-zatkwww3.js";
import {
  copyOwned
} from "./index-d5cy4mj4.js";

var modules = new Map;
function createWasmModuleLoader(options = {}) {
  const url = options.url ?? new URL("../hwpjs/hwpjs.wasm", import.meta.url);
  return async () => {
    const response = await (options.fetch ?? globalThis.fetch)(url, { cache: "no-cache" });
    if (!response.ok)
      throw Error(`WasmFetchFailed:${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 8 || ![0, 97, 115, 109, 1, 0, 0, 0].every((value, index) => bytes[index] === value))
      throw Error("InvalidWasmArtifact");
    if (!globalThis.crypto?.subtle)
      return WebAssembly.compile(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const key = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const previous = modules.get(key);
    if (previous)
      return previous;
    const compiled = WebAssembly.compile(bytes);
    modules.set(key, compiled);
    compiled.catch(() => {
      if (modules.get(key) === compiled)
        modules.delete(key);
    });
    return compiled;
  };
}

var ownedWorkers = new WeakSet;
var workerScopeSequence = 0;
function createWorkerEditorRuntime(options = {}) {
  if (workerScopeSequence >= Number.MAX_SAFE_INTEGER)
    throw Error("WorkerIdentityExhausted");
  const referenceScope = `worker:${++workerScopeSequence}`;
  const worker = options.workerFactory ? options.workerFactory(options.workerURL ?? new URL("./worker.js", import.meta.url)) : new Worker(options.workerURL ?? new URL("./worker.js", import.meta.url), { type: "module" });
  if (ownedWorkers.has(worker))
    throw Error("WorkerAlreadyOwned");
  ownedWorkers.add(worker);
  let closed = false, sequence = 0, failure;
  const pending = new Map;
  const rejectAll = (error) => {
    for (const item of pending.values())
      item.reject(error);
    pending.clear();
  };
  const receive = (event) => {
    const value = event.data;
    if (!value || !Number.isSafeInteger(value.id))
      return;
    const item = pending.get(value.id);
    if (!item)
      return;
    pending.delete(value.id);
    if (typeof value.transportError === "string")
      item.reject(Error(value.transportError));
    else if (!value.reply || typeof value.reply.kind !== "string")
      item.reject(Error("MalformedWorkerReply"));
    else
      item.resolve(value.reply);
  };
  const shutdown = (reason) => {
    if (closed)
      return;
    closed = true;
    failure = reason;
    rejectAll(reason);
    worker.removeEventListener("message", receive);
    worker.removeEventListener("error", failed);
    worker.removeEventListener("messageerror", failed);
    worker.terminate();
  };
  const failed = () => shutdown(Error("WorkerRuntimeFailed"));
  worker.addEventListener("message", receive);
  worker.addEventListener("error", failed);
  worker.addEventListener("messageerror", failed);
  const send = (message) => new Promise((resolve, reject) => {
    if (closed) {
      reject(failure ?? Error("RuntimeDisposed"));
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
  const load = options.loadWasmModule ?? (options.wasmModule ? async () => options.wasmModule : createWasmModuleLoader({ url: options.wasmURL }));
  const ready = Promise.resolve().then(load).then((module) => send({ kind: "initialize-runtime", wasmModule: module, referenceScope }));
  ready.catch((error) => shutdown(error instanceof Error ? error : Error(String(error))));
  return {
    async request(message, context) {
      const owned = copyOwned(message), captured = context ? { ...context } : undefined;
      await ready;
      const reply = await send(owned);
      return { ...reply, meta: { ...reply.meta, ...captured ? { context: captured } : {} } };
    },
    dispose() {
      shutdown(Error("RuntimeDisposed"));
    }
  };
}
function createWorkerRuntimeFactory(options = {}) {
  const captured = { ...options };
  const loader = captured.loadWasmModule ?? (captured.wasmModule ? async () => captured.wasmModule : createWasmModuleLoader({ url: captured.wasmURL }));
  let compiled;
  const loadWasmModule = () => {
    if (compiled)
      return compiled;
    const pending = Promise.resolve().then(loader);
    compiled = pending;
    pending.catch(() => {
      if (compiled === pending)
        compiled = undefined;
    });
    return pending;
  };
  return Object.assign(() => createWorkerEditorRuntime({ ...captured, loadWasmModule }), { preload: loadWasmModule });
}
export {
  createReaderEditorRuntime2 as createReaderEditorRuntime,
  createReaderRuntimeFactory2 as createReaderRuntimeFactory,
  createWasmModuleLoader,
  createWorkerEditorRuntime,
  createWorkerRuntimeFactory
};

