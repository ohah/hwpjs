export function validateHwp5DrawingListSources(rows) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows)) throw new Error('InvalidHwp5DrawingListSources');
  const seen = new Set();
  for (const row of rows) {
    if (
      !row ||
      !['caption', 'body'].includes(row.kind) ||
      ![
        'control_node',
        'owner_node',
        'list_node',
        'paragraph_count',
        'attributes',
        'extra_bytes',
      ].every((key) => uint(row[key])) ||
      row.paragraph_count > 65535 ||
      row.owner_node >= row.list_node ||
      (row.kind === 'caption'
        ? row.owner_node !== row.control_node
        : row.owner_node <= row.control_node) ||
      (row.unknown !== null && (!uint(row.unknown) || row.unknown > 65535)) ||
      typeof row.extra_nonzero !== 'boolean' ||
      (row.extra_bytes === 0 && row.extra_nonzero) ||
      seen.has(row.list_node)
    )
      throw new Error('InvalidHwp5DrawingListSources');
    seen.add(row.list_node);
    if (Object.hasOwn(row, 'caption')) {
      const c = row.caption;
      if (
        row.kind === 'body'
          ? c !== null
          : !c ||
            ![c.flags, c.width, c.max_text_width, c.extra_bytes].every(uint) ||
            !Number.isInteger(c.gap) ||
            c.gap < -32768 ||
            c.gap > 32767 ||
            typeof c.extra_nonzero !== 'boolean' ||
            (c.extra_bytes === 0 && c.extra_nonzero) ||
            row.extra_bytes !== c.extra_bytes + 14
      )
        throw new Error('InvalidHwp5DrawingListSources');
    }
    if (
      row.kind === 'caption'
        ? row.margins !== null || row.last_width !== null || row.body_extra_bytes !== null
        : !Array.isArray(row.margins) ||
          row.margins.length !== 4 ||
          !Array.from(row.margins).every(
            (value) => Number.isInteger(value) && value >= -32768 && value <= 32767,
          ) ||
          !uint(row.last_width) ||
          !uint(row.body_extra_bytes) ||
          row.extra_bytes < 12 ||
          row.body_extra_bytes !== row.extra_bytes - 12
    )
      throw new Error('InvalidHwp5DrawingListSources');
  }
  return rows;
}
export function decodeHwp5DrawingListSources(bytes) {
  return validateHwp5DrawingListSources(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
