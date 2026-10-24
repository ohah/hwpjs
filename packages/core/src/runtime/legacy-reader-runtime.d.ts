/** Declaration of the existing JavaScript protocol boundary, bundled by the package owner. */
declare module '*web/preview/reader-runtime.mjs' {
  export function copyRuntimeMessage(message: import('../contracts.ts').RuntimeMessage): import('../contracts.ts').RuntimeMessage;
  export function createReaderRuntime(options?: {
    wasmModule?: WebAssembly.Module;
    loadWasmModule?: () => Promise<WebAssembly.Module>;
    allowReload?: boolean;
  }): {
    request(message: import('../contracts.ts').RuntimeMessage): Promise<import('../contracts.ts').RuntimeReply>;
    outcome(reply: import('../contracts.ts').RuntimeReply): {
      application?: 'unapplied' | 'applied' | 'unknown';
      changed?: boolean | null;
    };
    dispose(): Promise<void>;
  };
}
