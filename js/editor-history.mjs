/** Optional additive native history ABI shared by both format adapters. */
export function createHistoryApi({ wasm, memory, check, uint, prefix, unavailable }) {
  const travel = kind => {
    check();
    const action = wasm[`${prefix}_${kind}`];
    if (typeof action !== "function") throw new Error(unavailable);
    const value = action();
    if (value !== 0 && value !== 1) throw memory.error();
    return value === 1;
  };
  return {
    enableHistory({ maxEntries = 16, maxCheckpointBytes = 8 * 1024 * 1024 } = {}) {
      check(); uint(maxEntries, "maxEntries"); uint(maxCheckpointBytes, "maxCheckpointBytes");
      const action = wasm[`${prefix}_history_enable`];
      if (typeof action !== "function") throw new Error(unavailable);
      if (action(maxEntries, maxCheckpointBytes) !== 1) throw memory.error();
    },
    undo: () => travel("undo"),
    redo: () => travel("redo"),
  };
}
