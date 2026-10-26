/** Optional additive native history ABI shared by both format adapters. */
export function createHistoryApi({ wasm, memory, check, uint, prefix, unavailable }) {
  const travel = (kind) => {
    check();
    const action = wasm[`${prefix}_${kind}`];
    if (typeof action !== 'function') throw new Error(unavailable);
    const value = action();
    if (value !== 0 && value !== 1) throw memory.error();
    return value === 1;
  };
  let legacyPolicy;
  let negotiation;
  const api = {
    historyRevisions() {
      check();
      const count = wasm[`${prefix}_history_revision_count`],
        at = wasm[`${prefix}_history_revision_at`];
      if (typeof count !== 'function' || typeof at !== 'function') throw new Error(unavailable);
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
      if (typeof action !== 'function') throw new Error(unavailable);
      const value = action();
      if (!Number.isInteger(value) || value < 0 || value >= 0xffffffff) throw memory.error();
      return value;
    },
    enableHistory({ maxEntries = 16, maxCheckpointBytes = 8 * 1024 * 1024 } = {}) {
      check();
      uint(maxEntries, 'maxEntries');
      uint(maxCheckpointBytes, 'maxCheckpointBytes');
      const action = wasm[`${prefix}_history_enable`];
      if (typeof action !== 'function') throw new Error(unavailable);
      if (action(maxEntries, maxCheckpointBytes) !== 1) throw memory.error();
      legacyPolicy = Object.freeze({ maxEntries, maxCheckpointBytes });
      negotiation = 'explicit-v1';
    },
    historyV2Available() {
      check();
      return (
        typeof wasm[`${prefix}_history_enable_options`] === 'function' &&
        typeof wasm[`${prefix}_history_stats`] === 'function'
      );
    },
    enableHistoryV2(options = {}) {
      check();
      if (!api.historyV2Available()) throw new Error('HistoryV2AbiUnavailable');
      if (
        options === null ||
        typeof options !== 'object' ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(options))
      )
        throw new TypeError('InvalidHistoryOptions');
      const allowed = new Set([
        'maxEntries',
        'maxCheckpointBytes',
        'maxCheckpointOwnedBytes',
        'maxRetainedBytes',
      ]);
      const clean = {};
      for (const key of Reflect.ownKeys(options)) {
        const d = Object.getOwnPropertyDescriptor(options, key);
        if (!allowed.has(key) || !d || !('value' in d))
          throw new TypeError('InvalidHistoryOptions');
        uint(d.value, key);
        clean[key] = d.value;
      }
      const bytes = new TextEncoder().encode(JSON.stringify(clean));
      memory.withBytes(bytes, (ptr, length) => {
        if (wasm[`${prefix}_history_enable_options`](ptr, length) !== 1) throw memory.error();
      });
      negotiation = 'explicit-v2';
    },
    enableHistoryDefault(options) {
      check();
      if (options !== undefined) {
        const mode =
          options && typeof options === 'object'
            ? Object.getOwnPropertyDescriptor(options, 'mode')
            : undefined;
        if (mode && 'value' in mode && mode.value === 'legacy-v1') {
          if (![Object.prototype, null].includes(Object.getPrototypeOf(options)))
            throw new TypeError('InvalidHistoryOptions');
          const clean = {};
          for (const key of Reflect.ownKeys(options)) {
            const d = Object.getOwnPropertyDescriptor(options, key);
            if (
              !['mode', 'maxEntries', 'maxCheckpointBytes'].includes(key) ||
              !d ||
              !('value' in d)
            )
              throw new TypeError('InvalidHistoryOptions');
            if (key !== 'mode') {
              uint(d.value, key);
              clean[key] = d.value;
            }
          }
          api.enableHistory(clean);
          return;
        }
        api.enableHistoryV2(options);
        return;
      }
      if (api.historyV2Available()) {
        api.enableHistoryV2({});
        negotiation = 'native-default-v2';
      } else {
        api.enableHistory();
        negotiation = 'negotiated-legacy-v1';
      }
    },
    historyStats() {
      check();
      const action = wasm[`${prefix}_history_stats`];
      if (typeof action !== 'function') {
        if (!legacyPolicy) throw new Error('HistoryNotEnabled');
        return Object.freeze({
          protocolVersion: 1,
          negotiation,
          requested: legacyPolicy,
          resolved: legacyPolicy,
          retainedBytes: null,
          metadataOwnedBytes: null,
          currentOwnedBytes: null,
          undoOwnedBytes: null,
          redoOwnedBytes: null,
          evictedCount: null,
          policySource: 'legacy-abi-success',
        });
      }
      if (action() !== 1) throw memory.error();
      try {
        const bytes = memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]());
        return {
          ...JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
          negotiation,
        };
      } finally {
        wasm[`${prefix}_output_free`]();
      }
    },
    undo: () => travel('undo'),
    redo: () => travel('redo'),
  };
  return api;
}
