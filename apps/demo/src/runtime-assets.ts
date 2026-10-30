/** Built demo modules live in assets/, beside runtime/ and hwpjs/. */
export function demoRuntimeAssets(moduleURL: string) {
  return {
    wasmURL: new URL('../hwpjs/hwpjs.wasm', moduleURL),
  };
}
