/** Proposal for the shared provider owner; no JSI installation or renderer claimed.
 * Native low-level operations must be routed by the shared facade, not a new router.
 */
export interface NativeToken {
  readonly slot: number; // uint32, bridge-bound; never a pointer
  readonly generation: number; // uint32, no wrap/reuse
}
export interface NativeCapabilityTable {
  readonly abiVersion: 1;
  readonly formats: readonly ("hwp5" | "hwpx")[];
  readonly operations: readonly (
    | "open"
    | "readNativeText"
    | "spliceNativeText"
    | "save"
    | "history"
  )[];
  readonly inputCoordinates: "format-native";
  readonly snapshotProjection: "shared-provider-required";
  // Keep unavailable until actual OS/JSI/Skia implementation and validation.
  readonly jsiInstalled: false;
  readonly canvas: false;
  readonly shapeRun: false;
  readonly iosMarkedText: false;
  readonly androidComposingSpans: false;
}
/** Native executor copies owned input before enqueue; caller never passes pointers.
 * Runtime/JSI objects are only created/accessed on the runtime executor.
 * This proposal intentionally does not introduce a competing command/message union.
 */
export interface NativeProviderProposal {
  readonly capabilities: NativeCapabilityTable;
  readonly lifecycle: {
    readonly ordering: "core-fifo";
    readonly nativeGuard: "reject-concurrent-calls";
    readonly output: "copy-then-release";
    readonly invalidate: "fence-cancel-drain-release";
  };
}
export const nativeCapabilityProposal: NativeProviderProposal = {
  capabilities: {
    abiVersion: 1,
    formats: ["hwp5", "hwpx"],
    operations: ["open", "readNativeText", "spliceNativeText", "save", "history"],
    inputCoordinates: "format-native",
    snapshotProjection: "shared-provider-required",
    jsiInstalled: false,
    canvas: false,
    shapeRun: false,
    iosMarkedText: false,
    androidComposingSpans: false,
  },
  lifecycle: {
    ordering: "core-fifo",
    nativeGuard: "reject-concurrent-calls",
    output: "copy-then-release",
    invalidate: "fence-cancel-drain-release",
  },
};
