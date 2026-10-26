export function decodeHwp5DrawingObjectExtras(bytes) {
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1000000)
    throw new Error('InvalidHwp5DrawingObjectExtras');
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  let previous = -1;
  for (const row of rows) {
    if (
      !row ||
      ![row.control_node, row.paragraph_node, row.extra_bytes].every(uint) ||
      row.paragraph_node >= row.control_node ||
      row.control_node <= previous ||
      typeof row.extra_hex !== 'string' ||
      row.extra_hex.length !== row.extra_bytes * 2 ||
      !/^[0-9a-f]*$/.test(row.extra_hex)
    )
      throw new Error('InvalidHwp5DrawingObjectExtras');
    previous = row.control_node;
  }
  return rows;
}
