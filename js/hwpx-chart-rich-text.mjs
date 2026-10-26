// DrawingML run ownership is distinct from cache point and series identities.
export function decodeChartRichText(bytes) {
  return validateChartRichText(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
export function validateChartRichText(value) {
  if (value?.kind !== 'rich_text' || !Array.isArray(value.values))
    throw new Error('InvalidChartRichText');
  let previousLeaf = -1;
  const runs = new Set();
  for (const row of value.values) {
    if (
      row?.owner_role !== undefined &&
      !['chart_title', 'axis_title', 'data_label', 'unclassified'].includes(row.owner_role)
    )
      throw new Error('InvalidChartRichText');
    if (
      row?.plain_text_complete !== undefined &&
      (typeof row.plain_text_complete !== 'boolean' || row.owner_role === undefined)
    )
      throw new Error('InvalidChartRichText');
    const nodes = row && [
      row.owner_node,
      row.text_node,
      row.rich_node,
      row.paragraph_node,
      row.run_node,
      row.value_node,
    ];
    if (
      !nodes ||
      !nodes.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff) ||
      !nodes.every((n, i) => i === 0 || nodes[i - 1] < n) ||
      row.value_node <= previousLeaf ||
      runs.has(row.run_node) ||
      typeof row.text !== 'string' ||
      !row.text.isWellFormed()
    )
      throw new Error('InvalidChartRichText');
    previousLeaf = row.value_node;
    runs.add(row.run_node);
  }
  return value;
}
