/** Optional additive native history ABI shared by both format adapters. */
export function createHistoryApi({ wasm, memory, check, uint, prefix, unavailable }) {
  const travel = (kind) => {
    check();
    const action = wasm[`${prefix}_${kind}`];
    if (typeof action !== "function") throw new Error(unavailable);
    const value = action();
    if (value !== 0 && value !== 1) throw memory.error();
    return value === 1;
  };
  return {
    historyRevisions() {
      check();
      const count = wasm[`${prefix}_history_revision_count`],
        at = wasm[`${prefix}_history_revision_at`];
      if (typeof count !== "function" || typeof at !== "function") throw new Error(unavailable);
      const length = count();
      if (!Number.isInteger(length) || length < 1 || length > 65536) throw memory.error();
      const revisions = Array.from({ length }, (_, index) => at(index));
      if (
        revisions.some((value) => !Number.isInteger(value) || value < 0 || value >= 0xffffffff) ||
        new Set(revisions).size !== length
      )
        throw memory.error();
      return revisions;
    },
    historyRevision() {
      check();
      const action = wasm[`${prefix}_history_revision`];
      if (typeof action !== "function") throw new Error(unavailable);
      const value = action();
      if (!Number.isInteger(value) || value < 0 || value >= 0xffffffff) throw memory.error();
      return value;
    },
    enableHistory({ maxEntries = 16, maxCheckpointBytes = 8 * 1024 * 1024 } = {}) {
      check();
      uint(maxEntries, "maxEntries");
      uint(maxCheckpointBytes, "maxCheckpointBytes");
      const action = wasm[`${prefix}_history_enable`];
      if (typeof action !== "function") throw new Error(unavailable);
      if (action(maxEntries, maxCheckpointBytes) !== 1) throw memory.error();
    },
    undo: () => travel("undo"),
    redo: () => travel("redo"),
  };
}
