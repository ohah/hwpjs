// Request-local negative capability cache; never repairs source field links.
export function createFieldLinkDisplayGuard() {
  const failures = new Map();
  return {
    read(section, query, fallback) {
      if (failures.has(section)) return fallback;
      try { return query(); }
      catch (error) {
        if (error.message !== "InvalidFieldLinks") throw error;
        failures.set(section, error.message);
        return fallback;
      }
    },
    reason(section) { return failures.get(section) ?? null; },
  };
}
