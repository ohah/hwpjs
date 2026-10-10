/** Selection metadata follows native revision IDs; it does not own document history. */
export function createHistorySelectionStore(limit = 100) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("InvalidHistorySelectionLimit");
  const selections = new Map();
  const copy = selection => selection ? structuredClone(selection) : null;
  const validRevision = revision => Number.isInteger(revision) && revision >= 0 && revision < 0xffffffff;
  return {
    remember(revision, selection) {
      if (!validRevision(revision)) throw new RangeError("InvalidHistoryRevision");
      const value = copy(selection);
      selections.delete(revision);
      selections.set(revision, value);
      while (selections.size > limit) selections.delete(selections.keys().next().value);
    },
    selection(revision) { return copy(selections.get(revision)); },
    retain(revisions, currentRevision) {
      if (!Array.isArray(revisions) || revisions.some(revision => !validRevision(revision)) || new Set(revisions).size !== revisions.length || revisions.length > limit) throw new RangeError("InvalidHistoryRevisions");
      if (currentRevision !== undefined && (!validRevision(currentRevision) || !revisions.includes(currentRevision))) throw new RangeError("InvalidHistoryRevisions");
      const reachable = new Set(revisions);
      for (const revision of selections.keys()) if (!reachable.has(revision)) selections.delete(revision);
    },
    reset() { selections.clear(); },
  };
}
