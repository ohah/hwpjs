import { parentPort } from 'node:worker_threads';
import { readKnownNativeModule } from '../../../packages/core/src/wasm-module-loader.ts';
const originalInstantiate = WebAssembly.instantiate;
const nativeCalls = {};
WebAssembly.instantiate = async function (...args) {
  const result = await Reflect.apply(originalInstantiate, WebAssembly, args);
  if (!(result instanceof WebAssembly.Instance)) return result;
  const exports = {};
  for (const [k, v] of Object.entries(result.exports))
    exports[k] =
      typeof v === 'function'
        ? function (...a) {
            nativeCalls[k] = (nativeCalls[k] ?? 0) + 1;
            return Reflect.apply(v, result.exports, a);
          }
        : v;
  return { exports };
};
globalThis.postMessage = (value, transfer) => {
  parentPort.postMessage(value, transfer);
  parentPort.postMessage({ probe: 'native-counts', id: value.id, calls: { ...nativeCalls } });
};
await import('../../../packages/core/src/worker.ts');
parentPort.on('message', (data) => {
  if (data.message?.kind === 'initialize-runtime')
    parentPort.postMessage({
      probe: 'module-brand',
      registered: !!readKnownNativeModule(data.message.wasmModule),
    });
  globalThis.onmessage({ data });
});
