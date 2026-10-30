const opaque = (value) => {
  try {
    return (
      value !== null &&
      typeof value === 'object' &&
      Object.isFrozen(value) &&
      Reflect.ownKeys(value).length === 0 &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))
    );
  } catch {
    return false;
  }
};
// Both the registered Native capsule and an explicit host provider contract are required.
export function createNativePictureRefreshGate(readEvidence) {
  let previous = null;
  return {
    clear() {
      previous = null;
    },
    observe(content, evidence, providerEpoch) {
      let current;
      try {
        current = readEvidence(evidence, content);
      } catch {
        current = undefined;
      }
      const before = previous;
      previous = current && opaque(providerEpoch) ? { evidence: current, providerEpoch } : null;
      return (
        !!previous &&
        !!before &&
        providerEpoch === before.providerEpoch &&
        ['exclusive-text', 'history-text'].includes(current.kind) &&
        current.scope === before.evidence.scope &&
        current.resourceLease === before.evidence.resourceLease &&
        current.beforeEpoch === before.evidence.nativeEpoch &&
        current.beforeRevision === before.evidence.nativeRevision &&
        current.ownerTextRunGeneration === before.evidence.ownerTextRunGeneration + 1
      );
    },
  };
}
