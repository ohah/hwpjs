/** Built demo modules live in assets/, beside runtime/ and hwpjs/. */
export function demoRuntimeAssets(moduleURL: string) {
  return {
    workerURL: new URL('../runtime/worker.js', moduleURL),
    wasmURL: new URL('../hwpjs/hwpjs.wasm', moduleURL),
  };
}
