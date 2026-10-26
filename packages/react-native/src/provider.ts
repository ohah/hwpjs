import { createEditor } from "@hwpjs/core";
import type { CreateEditorOptions, HeadlessEditor, RuntimeFactory } from "@hwpjs/core";
import { createNativeRuntimeFactory } from "./native/runtime.ts";
import type { NativeBackendAvailability, NativeTransportFactory } from "./native/transport.ts";

export interface NativeProviderOptions {
  readonly createTransport?: NativeTransportFactory;
}
export interface NativeProvider {
  readonly availability: NativeBackendAvailability;
  readonly runtimeFactory: RuntimeFactory;
  /** Delegates to the existing HeadlessEditor, not a native-specific editor. */
  createEditor(options?: Omit<CreateEditorOptions, "runtimeFactory">): HeadlessEditor;
}
export function createNativeProvider(options: NativeProviderOptions = {}): NativeProvider {
  // Capture config; mutating the caller's options later does not swap backend.
  const factory = options.createTransport;
  if (factory !== undefined && typeof factory !== "function")
    throw TypeError("NativeInvalidTransportFactory");
  const runtimeFactory = createNativeRuntimeFactory(factory);
  const availability: NativeBackendAvailability = Object.freeze(
    factory
      ? { status: "configured", reason: "TransportValidatedOnCreation" }
      : { status: "unavailable", reason: "NativeBackendNotInstalled" },
  );
  return Object.freeze({
    availability,
    runtimeFactory,
    createEditor(options: Omit<CreateEditorOptions, "runtimeFactory"> = {}): HeadlessEditor {
      return createEditor({ ...options, runtimeFactory });
    },
  });
}

/** Object returned by the platform's explicit C++ createNativeJsiBinding call.
 * Numeric fields are ABI sizes/width, never addresses or context handles.
 */
export interface NativeJsiBinding {
  readonly abiInfo: {
    readonly abiVersion: number;
    readonly tokenSize: number;
    readonly bufferSize: number;
    readonly stateSize: number;
    readonly pointerBits: number;
  };
  readonly transportState: "configured" | "unavailable";
  readonly canvasAvailable: boolean;
  readonly nativeImeAvailable: boolean;
  createTransport: NativeTransportFactory;
}
/** No global JSI lookup or auto-install. Platform host passes its binding explicitly. */
export function createNativeProviderFromJsi(binding?: NativeJsiBinding): NativeProvider {
  if (binding === undefined || binding.transportState === "unavailable")
    return createNativeProvider();
  const abi = binding.abiInfo;
  if (
    binding.transportState !== "configured" ||
    !abi ||
    abi.abiVersion !== 1 ||
    abi.pointerBits !== 64 ||
    ![abi.tokenSize, abi.bufferSize, abi.stateSize].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ) ||
    typeof binding.createTransport !== "function"
  )
    throw Error("NativeJsiAbiMismatch");
  return createNativeProvider({ createTransport: binding.createTransport.bind(binding) });
}
