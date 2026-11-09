/** Optional, synchronous optimization. Existing observation methods remain authoritative. */
export function createHwpxReadScopeApi({ wasm, ready, uint, error }) {
  const begin = wasm.hwpx_edit_read_scope_begin;
  const end = wasm.hwpx_edit_read_scope_end;
  if (typeof begin !== 'function' && typeof end !== 'function') return {};
  if (typeof begin !== 'function' || typeof end !== 'function')
    throw new Error('InvalidHwpxReadScopeAbi');
  const invoke = (callback) => {
    const result = callback();
    if (
      result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      typeof result.then === 'function'
    ) {
      // Consume an already-rejected native Promise without invoking arbitrary
      // thenables. A callback cannot extend a synchronous Native borrow.
      try {
        Promise.prototype.then.call(result, undefined, () => {});
      } catch {
        // Plain thenables have no native Promise state to observe.
      }
      throw new TypeError('AsyncReadObservationScopeUnsupported');
    }
    return result;
  };
  return {
    withReadObservations(section, callback) {
      ready();
      uint(section);
      if (typeof callback !== 'function') throw new TypeError('ExpectedReadObservationCallback');
      const token = begin(section);
      // A preparation failure only skips reuse. Each original query still runs
      // its own validation and reports its original error; no data is omitted.
      if (!token) return invoke(callback);
      let failed = false;
      let primary;
      let result;
      let cleanupFailed = false;
      let cleanup;
      try {
        result = invoke(callback);
      } catch (cause) {
        failed = true;
        primary = cause;
      } finally {
        try {
          if (!end(token)) {
            cleanupFailed = true;
            cleanup = error();
          }
        } catch (cause) {
          cleanupFailed = true;
          cleanup = cause;
        }
      }
      if (cleanupFailed) {
        if (failed)
          throw new AggregateError([primary, cleanup], 'ReadObservationScopeCleanupFailed');
        throw cleanup;
      }
      if (failed) throw primary;
      return result;
    },
  };
}
