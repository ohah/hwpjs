const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function decodeTabSources(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return validateTabSources(value);
}
export function validateTabSources(value) {
  if (
    !object(value) ||
    !uint(value.section) ||
    !uint(value.paragraph) ||
    value.paragraph === 0 ||
    !Array.isArray(value.rows)
  )
    throw new Error('InvalidTabSources');
  let previous = -1;
  const nodes = new Set();
  for (const row of value.rows) {
    if (
      !object(row) ||
      !uint(row.unit) ||
      !uint(row.node) ||
      row.unit <= previous ||
      nodes.has(row.node) ||
      ![row.width, row.tab_type, row.leader].every(
        (raw) =>
          raw === null || (typeof raw === 'string' && new TextEncoder().encode(raw).length <= 4096),
      )
    )
      throw new Error('InvalidTabSources');
    previous = row.unit;
    nodes.add(row.node);
  }
  return value;
}
