import type { NativeModuleContract } from './internal/native-runtime-origin.ts';
const knownModules = new WeakMap<WebAssembly.Module, NativeModuleContract>();
export function readKnownNativeModule(
  module: WebAssembly.Module,
): NativeModuleContract | undefined {
  return knownModules.get(module);
}
const modules = new Map<string, Promise<WebAssembly.Module>>();

/** Content identity, not URL identity, controls compilation reuse. No import-time I/O. */
export function createWasmModuleLoader(options: { url?: string | URL; fetch?: typeof fetch } = {}) {
  const url = options.url ?? new URL('./hwpjs.wasm', import.meta.url);
  return async (): Promise<WebAssembly.Module> => {
    const response = await (options.fetch ?? globalThis.fetch)(url, { cache: 'no-cache' });
    if (!response.ok) throw Error(`WasmFetchFailed:${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.length < 8 ||
      ![0, 97, 115, 109, 1, 0, 0, 0].every((value, index) => bytes[index] === value)
    )
      throw Error('InvalidWasmArtifact');
    if (!globalThis.crypto?.subtle) return WebAssembly.compile(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const key = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const previous = modules.get(key);
    if (previous) return previous;
    const compiled = WebAssembly.compile(bytes).then((module) => {
      if (
        key === '8e0ff0d0e80f185f255024cb9d946b0469648fd5eb175ef6c7aa3562124c91ff' ||
        key === 'a38f4df7993c8f645fd28fd13df0108f9be4ba5ca55736e76e334d7d8968343f'
      )
        knownModules.set(
          module,
          Object.freeze({ contract: 'hwp5-exclusive-text-delta-v1', sha256: key }),
        );
      return module;
    });
    modules.set(key, compiled);
    void compiled.catch(() => {
      if (modules.get(key) === compiled) modules.delete(key);
    });
    return compiled;
  };
}
