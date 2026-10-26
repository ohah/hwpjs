// Request-local, query-scoped refusals; never repairs source field links.
export function createFieldLinkDisplayGuard() {
  const failures = new Map();
  const reasons = new Map();
  return {
    read(section, query, fallback, scope = 'links') {
      if (failures.get(section)?.has(scope)) return fallback;
      try {
        return query();
      } catch (error) {
        if (error.message !== 'InvalidFieldLinks') throw error;
        if (!failures.has(section)) failures.set(section, new Set());
        failures.get(section).add(scope);
        reasons.set(section, error.message);
        return fallback;
      }
    },
    reason(section) {
      return reasons.get(section) ?? null;
    },
  };
}
