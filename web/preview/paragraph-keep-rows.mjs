// Soft paragraph constraints for already measured, single-column ordinary text.
// Explicit page breaks and object rows remain owned by their existing planners.
export function paragraphKeepRows(rows, flows, capacity) {
  if (!Array.isArray(rows) || !Number.isFinite(capacity) || capacity <= 0) return rows;
  const byKey = new Map(flows.map((f) => [`${f.section}:${f.paragraph}`, f]));
  const groups = [];
  for (let i = 0; i < rows.length;) {
    const start = i,
      key = `${rows[i].section}:${rows[i].paragraph}`;
    while (i < rows.length && `${rows[i].section}:${rows[i].paragraph}` === key) i++;
    const part = rows.slice(start, i),
      text = part.filter((r) => r.kind === 'text'),
      flow = byKey.get(key);
    const eligible =
      flow?.top_level === true &&
      text.length > 0 &&
      text.every((r) => typeof r.text === 'string' && r.paragraphShape?.spacingFormat === 'hwpx') &&
      part.every(
        (r) =>
          ['text', 'gap'].includes(r.kind) &&
          Number.isFinite(r.height) &&
          r.height > 0 &&
          r.keepNextHeight === undefined &&
          !r.tableVerticalSource &&
          !r.sourceObjectAnchor &&
          !r.inlineTables &&
          !r.transform &&
          r.tableNode === undefined &&
          r.splitInlineTableNode === undefined &&
          !r.text?.includes('\ufffc'),
      );
    groups.push({
      start,
      end: i,
      part,
      text,
      flow,
      eligible,
      settings: text[0]?.paragraphShape?.breakSettings,
    });
  }
  const edges = Array(rows.length).fill(false);
  const parent = rows.map((_, i) => i),
    weight = rows.map((r) => (Number.isFinite(r.height) ? r.height : 0));
  const root = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const connect = (index) => {
    const left = root(index),
      right = root(index + 1);
    edges[index] = true;
    if (left !== right) {
      parent[right] = left;
      weight[left] += weight[right];
    }
  };
  const connectSpan = (start, end) => {
    const roots = new Set();
    for (let i = start; i <= end; i++) roots.add(root(i));
    const total = [...roots].reduce((sum, index) => sum + weight[index], 0);
    if (!Number.isFinite(total) || total > capacity) return;
    for (let i = start; i < end; i++) connect(i);
  };
  // Preserve independently fitting paragraphs before adding softer links to
  // following paragraphs. An oversized chain must not discard keepLines.
  for (const group of groups) {
    if (!group.eligible || group.settings?.keep_lines !== true) continue;
    const total = group.part.reduce((sum, r) => sum + r.height, 0);
    if (Number.isFinite(total) && total <= capacity)
      for (let i = group.start; i < group.end - 1; i++) connect(i);
  }
  for (const group of groups) {
    if (!group.eligible || group.settings?.widow_orphan !== true || group.text.length < 2) continue;
    const indices = group.part.flatMap((row, index) =>
      row.kind === 'text' ? [group.start + index] : [],
    );
    connectSpan(indices[0], indices[1]);
    connectSpan(indices.at(-2), indices.at(-1));
  }
  for (let g = 0; g < groups.length - 1; g++) {
    const current = groups[g],
      next = groups[g + 1];
    if (
      !current.eligible ||
      current.settings?.keep_with_next !== true ||
      !next.eligible ||
      next.flow.page_break === true ||
      next.flow.column_break === true
    )
      continue;
    const firstText = next.start + next.part.findIndex((r) => r.kind === 'text');
    connectSpan(current.end - 1, firstText);
  }
  let result = rows;
  for (let start = 0; start < rows.length;) {
    let end = start;
    while (edges[end]) end++;
    const total = rows.slice(start, end + 1).reduce((sum, r) => sum + r.height, 0);
    // An oversized soft group must not make an otherwise readable page fail.
    if (end > start && Number.isFinite(total) && total <= capacity) {
      if (result === rows) result = [...rows];
      let remainder = total;
      for (let i = start; i < end; i++) {
        remainder -= rows[i].height;
        result[i] = { ...rows[i], keepNextHeight: remainder };
      }
    }
    start = end + 1;
  }
  return result;
}
