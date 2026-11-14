/** Disposable display snapshots only. Never used for document saves. */
export function createChartDisplayResources({
  read,
  onChange = () => {},
  maxEntries = 64,
  maxSnapshotUnits = 1000000,
  maxTotalUnits = 4000000,
}) {
  if (
    typeof read !== 'function' ||
    ![maxEntries, maxSnapshotUnits, maxTotalUnits].every((n) => Number.isSafeInteger(n) && n >= 1)
  )
    throw new Error('InvalidChartDisplayResources');
  let epoch = 0,
    closed = false,
    totalUnits = 0;
  const entries = new Map(),
    key = (section, wrapper) => `${section}:${wrapper}`;
  const valid = (section, wrapper) =>
    [section, wrapper].every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff);
  const clear = () => {
    epoch++;
    for (const entry of entries.values()) {
      entry.value = entry.previewValue = null;
      entry.units = 0;
    }
    entries.clear();
    totalUnits = 0;
  };
  const release = (entry) => {
    totalUnits -= entry.units;
    entry.units = 0;
    entry.value = entry.previewValue = null;
  };
  return {
    get(section, wrapper) {
      return entries.get(key(section, wrapper)) ?? null;
    },
    status(section, wrapper) {
      const entry = entries.get(key(section, wrapper));
      if (entry) return entry;
      if (closed) return { value: null, error: 'ChartDisplayResourcesClosed' };
      if (entries.size >= maxEntries)
        return { value: null, error: 'ChartDisplayCountLimitExceeded' };
      return null;
    },
    /** Keep only an explicitly compatible paint preview, never a current value. */
    refresh(targets, previewKeys = new Set()) {
      epoch++;
      const wanted = new Set();
      for (const target of targets ?? [])
        if (target && !target.error_name && valid(target.section, target.wrapper))
          wanted.add(key(target.section, target.wrapper));
      totalUnits = 0;
      for (const [id, old] of entries) {
        const previewValue =
          previewKeys.has(id) && !old.error ? (old.value ?? old.previewValue) : null;
        if (!wanted.has(id) || !previewValue) {
          old.value = old.previewValue = null;
          old.units = 0;
          entries.delete(id);
          continue;
        }
        entries.set(id, {
          value: null,
          previewValue,
          error: null,
          pending: null,
          units: old.units,
        });
        totalUnits += old.units;
        // Pending retired requests may still capture old; transfer, then scrub.
        old.value = old.previewValue = null;
        old.units = 0;
      }
    },
    load(section, wrapper) {
      if (closed) return Promise.reject(new Error('ChartDisplayResourcesClosed'));
      if (!valid(section, wrapper)) return Promise.reject(new Error('InvalidChartDisplayKey'));
      const id = key(section, wrapper),
        existing = entries.get(id);
      if (existing?.pending) return existing.pending;
      if (!existing && entries.size >= maxEntries)
        return Promise.reject(new Error('ChartDisplayCountLimitExceeded'));
      const generation = epoch,
        entry = existing ?? {
          value: null,
          previewValue: null,
          error: null,
          pending: null,
          units: 0,
        };
      entries.set(id, entry);
      let resolvePending, rejectPending;
      entry.pending = new Promise((resolve, reject) => {
        resolvePending = resolve;
        rejectPending = reject;
      });
      (async () => {
        // A stale surface token is not a Native/chart failure. Retry once with
        // the reader's newly captured token; no guard is bypassed or polled.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const value = await read(section, wrapper);
            if (generation !== epoch || closed) return;
            if (
              value?.kind !== 'chart_display' ||
              value.pair?.section_ordinal !== section ||
              value.pair?.wrapper_node !== wrapper
            )
              throw new Error('InvalidChartDisplayReply');
            const units = JSON.stringify(value).length;
            if (units > maxSnapshotUnits || units > maxTotalUnits - (totalUnits - entry.units))
              throw new Error('ChartDisplayUnitsLimitExceeded');
            totalUnits += units - entry.units;
            entry.units = units;
            entry.value = value;
            entry.previewValue = null;
            break;
          } catch (error) {
            if (generation !== epoch || closed) return;
            if (attempt === 0 && error?.message === 'StaleSurfaceResource') continue;
            release(entry);
            entry.error = error?.message || String(error);
            break;
          }
        }
        if (generation === epoch && !closed) onChange(section, wrapper);
      })().then(resolvePending, rejectPending);
      return entry.pending;
    },
    clear,
    close() {
      if (!closed) {
        closed = true;
        clear();
      }
    },
  };
}
