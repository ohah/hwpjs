const decoder = new TextDecoder('utf-8', { fatal: true });
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function decodeHwp5FormulaSources(bytes) {
  const rows = JSON.parse(decoder.decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1000000) throw new Error('InvalidHwp5FormulaSources');
  const seen = new Set();
  for (const row of rows) {
    if (
      !row ||
      !uint(row.source_node) ||
      row.source_node === 0 ||
      !uint(row.paragraph) ||
      seen.has(row.source_node) ||
      typeof row.formula !== 'string' ||
      !row.formula.startsWith('=') ||
      row.formula.length < 2 ||
      typeof row.last_result !== 'string' ||
      typeof row.derived !== 'boolean' ||
      !row.formula.isWellFormed() ||
      !row.last_result.isWellFormed()
    )
      throw new Error('InvalidHwp5FormulaSources');
    seen.add(row.source_node);
  }
  return rows;
}
