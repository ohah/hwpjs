export declare function hwp5VerticalMarginsArtifactQualified(sha256: unknown): boolean;
export declare function hwp5VerticalMarginsBackendQualified(module: unknown): boolean;
export declare function verifiedHwp5VerticalMarginsBytes(input: Uint8Array): Promise<Uint8Array>;
export declare function compileHwp5VerticalMarginsModule(
  input: Uint8Array,
): Promise<WebAssembly.Module>;
export declare function copyHwp5VerticalMarginsModuleBytes(module: unknown): Uint8Array | undefined;
