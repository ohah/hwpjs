// Buffer polyfill for napi-rs WASM compatibility
// This must be imported before any WASM modules
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = class Buffer extends Uint8Array {
    static from(data: any) {
      if (data instanceof Uint8Array) return data;
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (Array.isArray(data)) return new Uint8Array(data);
      return new Uint8Array(data);
    }
    static isBuffer(obj: any) {
      return obj instanceof Uint8Array;
    }
  } as any;
}

// Ensure Buffer is set on window as well for compatibility
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  (window as any).Buffer = globalThis.Buffer;
}
