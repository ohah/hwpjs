/** Disposable display snapshots only. Never used for document saves. */
export function createChartDisplayResources({ read, onChange = () => {}, maxEntries = 64, maxSnapshotUnits = 1000000, maxTotalUnits = 4000000 }) {
  if (typeof read !== "function" || ![maxEntries, maxSnapshotUnits, maxTotalUnits].every(value => Number.isSafeInteger(value) && value >= 1)) throw new Error("InvalidChartDisplayResources");
  let epoch = 0, closed = false, totalUnits = 0;
  const entries = new Map(), key = (section, wrapper) => `${section}:${wrapper}`;
  const clear = () => { epoch++; entries.clear(); totalUnits = 0; };
  return {
    get(section, wrapper) { return entries.get(key(section, wrapper)) ?? null; },
    status(section, wrapper) {
      const entry = entries.get(key(section, wrapper));
      if (entry) return entry;
      if (closed) return { value: null, error: "ChartDisplayResourcesClosed" };
      if (entries.size >= maxEntries) return { value: null, error: "ChartDisplayCountLimitExceeded" };
      return null;
    },
    load(section, wrapper) {
      if (closed) return Promise.reject(new Error("ChartDisplayResourcesClosed"));
      if (![section, wrapper].every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) return Promise.reject(new Error("InvalidChartDisplayKey"));
      const id = key(section, wrapper), existing = entries.get(id);
      if (existing) return existing.pending;
      if (entries.size >= maxEntries) return Promise.reject(new Error("ChartDisplayCountLimitExceeded"));
      const generation = epoch, entry = { value: null, error: null, pending: null };
      entries.set(id, entry);
      entry.pending = (async () => {
        try {
          const value = await read(section, wrapper);
          if (generation !== epoch || closed) return;
          if (value?.kind !== "chart_display" || value.pair?.section_ordinal !== section || value.pair?.wrapper_node !== wrapper) throw new Error("InvalidChartDisplayReply");
          // Serialized UTF-16 units bound retained data, not exact JS heap usage.
          const units = JSON.stringify(value).length;
          if (units > maxSnapshotUnits || units > maxTotalUnits - totalUnits) throw new Error("ChartDisplayUnitsLimitExceeded");
          totalUnits += units;
          entry.value = value;
        } catch (error) {
          if (generation !== epoch || closed) return;
          entry.error = error?.message || String(error);
        }
        if (generation === epoch && !closed) onChange(section, wrapper);
      })();
      return entry.pending;
    },
    clear,
    close() { if (!closed) { closed = true; clear(); } },
  };
}
