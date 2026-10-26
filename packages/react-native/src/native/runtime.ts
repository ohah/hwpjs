import type {
  EditorRuntime,
  RuntimeFactory,
  RuntimeMessage,
  RuntimeReply,
  RuntimeRequestContext,
} from "@hwpjs/core";
import { copyTransportDTO } from "./owned-dto.ts";
import { NativeBackendUnavailableError, NativeRuntimeError } from "./transport.ts";
import type { NativeRuntimeTransport, NativeTransportFactory } from "./transport.ts";

// A transport owns exactly one candidate/active runtime, never two adapters.
const adopted = new WeakSet<object>();
const contextKeys = [
  "editorId",
  "documentId",
  "generation",
  "requestId",
  "operationRevision",
] as const;

function isDescriptorValid(transport: NativeRuntimeTransport): boolean {
  const d = transport.descriptor;
  return (
    !!d &&
    d.protocol === "hwpjs.editor-runtime/1" &&
    d.abiVersion === 1 &&
    d.projection === "shared-provider" &&
    typeof d.implementation === "string" &&
    d.implementation.length > 0
  );
}
function validateContext(context: RuntimeRequestContext): void {
  if (
    typeof context.editorId !== "string" ||
    !context.editorId ||
    !(context.documentId === null || typeof context.documentId === "string") ||
    !["generation", "requestId", "operationRevision"].every((key) => {
      const value = context[key as keyof RuntimeRequestContext];
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    })
  )
    throw new NativeRuntimeError("NativeInvalidRequestContext");
}

/** Adopts a fresh transport. The core owns ordering; this rejects accidental
 * overlapping calls rather than introducing a competing command queue.
 */
async function adopt(transport: NativeRuntimeTransport): Promise<EditorRuntime> {
  if (
    !transport ||
    typeof transport !== "object" ||
    typeof transport.request !== "function" ||
    typeof transport.invalidate !== "function" ||
    typeof transport.dispose !== "function"
  ) {
    throw new NativeRuntimeError("NativeInvalidTransport");
  }
  if (adopted.has(transport)) throw new NativeRuntimeError("NativeTransportAlreadyOwned");
  adopted.add(transport);
  try {
    if (!isDescriptorValid(transport))
      throw new NativeRuntimeError("NativeTransportProtocolMismatch");
  } catch (error) {
    const failures: unknown[] = [error];
    try {
      transport.invalidate();
    } catch (cause) {
      failures.push(cause);
    }
    try {
      await transport.dispose();
    } catch (cause) {
      failures.push(cause);
    }
    if (failures.length > 1) throw new AggregateError(failures, "NativeTransportAdoptionFailed");
    throw error;
  }
  const send = transport.request.bind(transport);
  const invalidate = transport.invalidate.bind(transport);
  const release = transport.dispose.bind(transport);
  let terminal = false;
  let pending: Promise<void> | undefined;
  let disposal: Promise<void> | undefined;
  return Object.freeze({
    request(message: RuntimeMessage, context?: RuntimeRequestContext): Promise<RuntimeReply> {
      if (terminal) return Promise.reject(new NativeRuntimeError("NativeRuntimeDisposed"));
      if (pending) return Promise.reject(new NativeRuntimeError("NativeRuntimeBusy"));
      let owned: RuntimeMessage, ownedContext: RuntimeRequestContext | undefined;
      try {
        owned = copyTransportDTO(message);
        if (!owned || typeof owned.kind !== "string" || !owned.kind)
          throw new NativeRuntimeError("NativeInvalidMessage");
        ownedContext = context === undefined ? undefined : copyTransportDTO(context);
        if (ownedContext !== undefined) validateContext(ownedContext);
      } catch (error) {
        return Promise.reject(error);
      }
      const expected = ownedContext === undefined ? undefined : { ...ownedContext };
      const operation = Promise.resolve()
        .then(() => {
          if (terminal) throw new NativeRuntimeError("NativeRuntimeDisposed");
          return send(owned, ownedContext);
        })
        .then((reply) => {
          if (terminal) throw new NativeRuntimeError("NativeRuntimeDisposed");
          const result = copyTransportDTO(reply);
          if (
            !result ||
            typeof result.kind !== "string" ||
            !result.kind ||
            (result.error !== undefined && typeof result.error !== "string") ||
            (result.applied !== undefined && typeof result.applied !== "boolean") ||
            (result.meta !== undefined &&
              (result.meta === null ||
                typeof result.meta !== "object" ||
                Array.isArray(result.meta))) ||
            (result.meta?.application !== undefined &&
              !["unapplied", "applied", "unknown"].includes(result.meta.application)) ||
            (result.meta?.changed !== undefined &&
              result.meta.changed !== null &&
              typeof result.meta.changed !== "boolean")
          ) {
            throw new NativeRuntimeError("NativeInvalidReply");
          }
          const returned = result.meta?.context;
          if (
            returned !== undefined &&
            (expected === undefined || contextKeys.some((key) => returned[key] !== expected[key]))
          )
            throw new NativeRuntimeError("NativeMismatchedReply");
          // Bind to captured request, never to a global "current" editor.
          return {
            ...result,
            meta: { ...result.meta, ...(expected === undefined ? {} : { context: expected }) },
          };
        });
      // Clear the guard before the returned Promise settles. A core continuation
      // may immediately issue enable/query after load.
      const guarded = operation.then(
        (reply) => {
          pending = undefined;
          return reply;
        },
        (error) => {
          pending = undefined;
          throw error;
        },
      );
      pending = guarded.then(
        () => {},
        () => {},
      );
      return guarded;
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      terminal = true;
      let resolve!: () => void, reject!: (error: unknown) => void;
      // Publish the Promise before invoking external invalidation (reentry safe).
      disposal = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      const failures: unknown[] = [];
      try {
        invalidate();
      } catch (error) {
        failures.push(error);
      }
      // Drain even if invalidate threw; do not free contexts while work is active.
      void Promise.resolve(pending)
        .then(async () => {
          try {
            await release();
          } catch (error) {
            failures.push(error);
          }
          if (failures.length) throw new AggregateError(failures, "NativeTransportDisposeFailed");
        })
        .then(resolve, reject);
      return disposal;
    },
  });
}

export function createNativeRuntimeFactory(factory?: NativeTransportFactory): RuntimeFactory {
  return async () => {
    if (!factory) throw new NativeBackendUnavailableError();
    return adopt(await factory());
  };
}
