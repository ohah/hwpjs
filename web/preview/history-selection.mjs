/** Selection metadata follows native revision IDs; it does not own document history. */
// Wire ceiling: at most 65535 retained edits plus the current revision, not a policy default.
const MAX_NATIVE_REACHABLE_REVISIONS = 65536;
export function createHistorySelectionStore(limit = 100) {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('InvalidHistorySelectionLimit');
  const selections = new Map();
  let reachable;
  const copy = (selection) => (selection ? structuredClone(selection) : null);
  const validRevision = (revision) =>
    Number.isInteger(revision) && revision >= 0 && revision < 0xffffffff;
  const trimFallback = () => {
    while (selections.size > limit) selections.delete(selections.keys().next().value);
  };
  return {
    remember(revision, selection) {
      if (!validRevision(revision)) throw new RangeError('InvalidHistoryRevision');
      if (reachable && !reachable.has(revision)) return;
      const value = copy(selection);
      selections.delete(revision);
      selections.set(revision, value);
      if (!reachable) trimFallback();
    },
    selection(revision) {
      return copy(selections.get(revision));
    },
    retain(revisions, currentRevision) {
      if (currentRevision !== undefined && !validRevision(currentRevision))
        throw new RangeError('InvalidHistoryRevisions');
      // Missing metadata is the legacy bounded fallback, never an invented Native history.
      if (revisions === undefined) {
        reachable = undefined;
        trimFallback();
        return;
      }
      if (!Array.isArray(revisions) || revisions.length > MAX_NATIVE_REACHABLE_REVISIONS)
        throw new RangeError('InvalidHistoryRevisions');
      const next = new Set();
      for (const revision of revisions) {
        if (!validRevision(revision) || next.has(revision))
          throw new RangeError('InvalidHistoryRevisions');
        next.add(revision);
      }
      if (currentRevision !== undefined && !next.has(currentRevision))
        throw new RangeError('InvalidHistoryRevisions');
      reachable = next;
      for (const revision of selections.keys())
        if (!reachable.has(revision)) selections.delete(revision);
    },
    reset() {
      selections.clear();
      reachable = undefined;
    },
  };
}
