/** Omission selects Native V2 defaults when supported, otherwise negotiated legacy V1.
 * Explicit budget options require V2; numbers are resolved/validated by Native.
 */
export interface HistoryBudgetOptions {
  readonly maxEntries?: number;
  readonly maxCheckpointBytes?: number;
  readonly maxCheckpointOwnedBytes?: number;
  readonly maxRetainedBytes?: number;
}
export interface LegacyHistoryOptions {
  readonly mode: 'legacy-v1';
  readonly maxEntries?: number;
  readonly maxCheckpointBytes?: number;
}
export type HistoryOptions = HistoryBudgetOptions | LegacyHistoryOptions;
export interface HistoryPolicyObservation {
  readonly maxEntries?: number | null;
  readonly maxCheckpointBytes?: number | null;
  readonly maxCheckpointOwnedBytes?: number | null;
  readonly maxRetainedBytes?: number | null;
}
/** Retained allocation request bytes; excludes live Session, transient clones, RSS and WASM pages. */
export interface NativeHistoryStats {
  readonly protocolVersion: 1 | 2;
  readonly requested: HistoryPolicyObservation;
  readonly resolved: HistoryPolicyObservation;
  readonly negotiation?:
    | 'native-default-v2'
    | 'explicit-v2'
    | 'explicit-v1'
    | 'negotiated-legacy-v1';
  readonly policySource?: 'legacy-abi-success';
  readonly revision?: number;
  readonly oldestAvailableRevision?: number;
  readonly undoCount?: number;
  readonly redoCount?: number;
  readonly retainedBytes: number | null;
  readonly metadataOwnedBytes: number | null;
  readonly currentOwnedBytes: number | null;
  readonly undoOwnedBytes: number | null;
  readonly redoOwnedBytes: number | null;
  readonly evictedCount: number | null;
  readonly poisoned?: boolean;
}
