export function decodeHwp5CellLayoutSources(bytes) {
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const uint = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!Array.isArray(rows)) throw new Error('InvalidHwp5CellLayoutSources');
  const lists = new Set();
  for (const row of rows) {
    if (
      !row ||
      !['table_record_node', 'list_node', 'attributes', 'extra_bytes'].every((key) =>
        uint(row[key]),
      ) ||
      !uint(row.border_fill_id, 65535) ||
      !(row.unknown === null || uint(row.unknown, 65535)) ||
      !Array.isArray(row.margins) ||
      row.margins.length !== 4 ||
      !row.margins.every((value) => Number.isInteger(value) && value >= -32768 && value <= 32767) ||
      row.text_direction !== (row.attributes & 7) ||
      row.line_wrap !== ((row.attributes >>> 3) & 3) ||
      row.vertical_alignment !== ((row.attributes >>> 5) & 3)
    )
      throw new Error('InvalidHwp5CellLayoutSources');
    for (const [field, bit] of [
      ['has_margin', 16],
      ['protected', 17],
      ['header', 18],
      ['editable', 19],
    ])
      if (row[field] !== Boolean(row.attributes & (1 << bit)))
        throw new Error('InvalidHwp5CellLayoutSources');
    if (lists.has(row.list_node)) throw new Error('InvalidHwp5CellLayoutSources');
    lists.add(row.list_node);
  }
  return rows;
}
