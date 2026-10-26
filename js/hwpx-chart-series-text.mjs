// Detached native values; node identities are never cache-point indices.
export function decodeChartSeriesText(bytes) {
  return validateChartSeriesText(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
export function validateChartSeriesText(value) {
  if (value?.kind !== 'direct_series' || !Array.isArray(value.values))
    throw new Error('InvalidChartSeriesText');
  const seen = new Set();
  for (const row of value.values) {
    if (
      !row ||
      ![row.series_node, row.text_node, row.value_node].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff,
      ) ||
      !(row.series_node < row.text_node && row.text_node < row.value_node) ||
      typeof row.text !== 'string' ||
      !row.text.isWellFormed() ||
      seen.has(row.value_node)
    )
      throw new Error('InvalidChartSeriesText');
    seen.add(row.value_node);
  }
  return value;
}
