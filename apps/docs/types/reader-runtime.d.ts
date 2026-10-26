// The public Reader adapter imports this canonical, untyped JS implementation.
// This documentation-only boundary types that import without adding a public API.
declare module "*web/preview/reader-runtime.mjs" {
  import type { RuntimeMessage, RuntimeReply } from "@hwpjs/core";
  export function createReaderRuntime(options?: unknown): {
    request(message: RuntimeMessage): Promise<RuntimeReply>;
    outcome(reply: RuntimeReply): RuntimeReply["meta"];
    dispose(): void | Promise<void>;
  };
}
