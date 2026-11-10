// Request-local preparation only. Native owns source permission, expected text,
// coverage and the single History transaction. No per-match setters or cache.
export function prepareReplaceAllTransaction(editor, format, plan) {
  if (!editor?.supportsIndependentTextAbi?.()) throw Error('IndependentTextTransactionUnavailable');
  if (
    plan?.schemaVersion !== 1 ||
    plan.executionAuthority !== false ||
    plan.scope !== 'complete-current-paragraph-snapshot' ||
    plan.format !== format ||
    !['known-no-op', 'requires-native-preflight'].includes(plan.status) ||
    !Array.isArray(plan.edits) ||
    !Array.isArray(plan.coverage?.sections) ||
    !Array.isArray(plan.coverage.owners)
  )
    throw Error('InvalidReplaceAllPlan');
  const cap = editor.independentTextCapabilities();
  if (cap.format !== format || cap.binding?.revision !== plan.nativeHistoryRevision)
    throw Error('StaleReplaceAllPlan');
  if (
    plan.edits.length > cap.limits.edits ||
    plan.coverage.observedParagraphs > cap.limits.snapshotParagraphs
  )
    throw Error('LimitExceeded');
  const groups = new Map();
  for (const edit of plan.edits) {
    const source = edit.source;
    if (
      !source ||
      !Number.isInteger(source.section) ||
      source.section < 0 ||
      !Number.isInteger(source.paragraph) ||
      source.paragraph < 0 ||
      !Number.isInteger(source.startUnit) ||
      source.startUnit < 0 ||
      !Number.isInteger(source.endUnit) ||
      source.endUnit < source.startUnit ||
      typeof edit.expectedOriginal !== 'string' ||
      typeof edit.replacement !== 'string' ||
      edit.expectedOriginal.length !== source.endUnit - source.startUnit
    )
      throw Error('InvalidReplaceAllPlan');
    // Preserve structural newlines verbatim; reject when the Native adapter
    // cannot yet represent them rather than silently flattening the request.
    if (cap.supportsNewlines !== true && /[\r\n]/.test(edit.replacement))
      throw Error('UnsupportedTextInsertionNewline');
    const key = `${source.section}:${source.paragraph}`;
    let group = groups.get(key);
    if (!group) {
      group = { source, edits: [] };
      groups.set(key, group);
    }
    const previous = group.edits.at(-1);
    if (previous && source.startUnit < previous.endUnit) throw Error('InvalidReplaceAllPlan');
    group.edits.push({
      startUnit: source.startUnit,
      endUnit: source.endUnit,
      text: edit.replacement,
      expectedOriginal: edit.expectedOriginal,
    });
  }
  if (groups.size > cap.limits.groups) throw Error('LimitExceeded');
  if (format === 'hwp5') {
    // Identity is checked for all matching owners, including nested paragraphs.
    // Do not use the BODY-only formatting guard: Native decides owner permission.
    const windows = new Map();
    const keys = ['epoch', 'scope', 'kind', 'section', 'id', 'row', 'column'];
    for (const { source } of groups.values()) {
      const first = Math.floor(source.paragraph / 1024) * 1024;
      const key = `${source.section}:${first}`;
      let window = windows.get(key);
      if (!window) {
        window = editor.currentSourceReferences(source.section, { first, count: 1024 });
        windows.set(key, window);
      }
      const actual = window.references?.[source.paragraph - first];
      if (
        window.version !== 1 ||
        window.first !== first ||
        !source.reference ||
        !actual ||
        keys.some((key) => actual[key] !== source.reference[key])
      )
        throw Error('InvalidCurrentTextTransactionReference');
    }
  }
  const ordered = [...groups.values()];
  const selectors = ordered.map(({ source }) => ({
    section: source.section,
    paragraph: source.paragraph + (format === 'hwpx' ? 1 : 0),
  }));
  const queried = editor.queryIndependentText({
    schemaVersion: 1,
    binding: cap.binding,
    selectors,
  });
  const coverage = queried.coverage;
  const declared = new Map();
  let total = 0;
  for (const row of plan.coverage.sections) {
    if (
      !Number.isInteger(row.section) ||
      row.section < 0 ||
      declared.has(row.section) ||
      !Number.isInteger(row.observedParagraphs) ||
      row.observedParagraphs < 0
    )
      throw Error('IncompleteReplaceAllSnapshot');
    declared.set(row.section, row.observedParagraphs);
    total += row.observedParagraphs;
  }
  if (
    total !== plan.coverage.observedParagraphs ||
    total !== plan.coverage.declaredParagraphs ||
    total !== coverage.totalParagraphs ||
    declared.size > coverage.sections.length
  )
    throw Error('IncompleteReplaceAllSnapshot');
  for (const row of coverage.sections) {
    if ((declared.get(row.section) ?? 0) !== row.paragraphCount)
      throw Error('IncompleteReplaceAllSnapshot');
    declared.delete(row.section);
  }
  if (declared.size) throw Error('IncompleteReplaceAllSnapshot');
  // Counts alone cannot prove completeness: the same count can hide an omitted
  // owner plus an out-of-range ordinal. Validate the entire observed owner axis,
  // including rows with no match, against the Native per-section inventory.
  if (plan.coverage.owners.length !== total) throw Error('IncompleteReplaceAllSnapshot');
  const sectionRanges = new Map();
  let start = 0;
  for (const row of coverage.sections) {
    sectionRanges.set(row.section, { start, count: row.paragraphCount });
    start += row.paragraphCount;
  }
  const seenOwners = new Set();
  for (const owner of plan.coverage.owners) {
    const range = sectionRanges.get(owner?.section);
    const key = `${owner?.section}:${owner?.paragraph}`;
    const first = format === 'hwpx' ? range?.start : 0;
    if (
      !range ||
      !Number.isInteger(owner.paragraph) ||
      owner.paragraph < first ||
      owner.paragraph - first >= range.count ||
      seenOwners.has(key)
    )
      throw Error('IncompleteReplaceAllSnapshot');
    seenOwners.add(key);
  }
  if (
    queried.targets.length !== ordered.length ||
    queried.binding.session !== cap.binding.session ||
    queried.binding.revision !== cap.binding.revision
  )
    throw Error('MalformedTextTransactionQuery');
  return {
    schemaVersion: 1,
    binding: queried.binding,
    scope: 'complete-current-paragraph-snapshot',
    coverage,
    groups: ordered.map((group, index) => {
      const target = queried.targets[index];
      if (
        target.section !== selectors[index].section ||
        target.paragraph !== selectors[index].paragraph ||
        group.edits.some((edit) => edit.endUnit > target.beforeUnits)
      )
        throw Error('MalformedTextTransactionQuery');
      return { ref: target.ref, beforeUnits: target.beforeUnits, edits: group.edits };
    }),
  };
}
