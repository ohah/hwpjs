export function decodeEquationStyles(bytes) {
  const fail = () => {
    throw new Error('InvalidHwpxEquationStyles');
  };
  let rows;
  try {
    rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (!Array.isArray(rows) || rows.length > 100000) return fail();
  const seen = new Set();
  const sizes = new Set(),
    uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  for (const row of rows) {
    if (!Number.isInteger(row?.node) || row.node < 0 || row.node > 0xffffffff || seen.has(row.node))
      return fail();
    seen.add(row.node);
    for (const key of ['font', 'base_unit', 'base_line', 'text_color', 'line_mode', 'error_name'])
      if (
        row[key] !== null &&
        (typeof row[key] !== 'string' || !row[key].isWellFormed() || row[key].length > 4096)
      )
        return fail();
    if (row.error_name !== null && !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.error_name))
      return fail();
    if (
      row.error_name !== null &&
      ['font', 'base_unit', 'base_line', 'text_color', 'line_mode'].some((key) => row[key] !== null)
    )
      return fail();
    if (
      row.size_error !== undefined &&
      row.size_error !== null &&
      (typeof row.size_error !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.size_error) ||
        row.source_size !== null)
    )
      return fail();
    const size = row.source_size;
    if (size !== undefined && size !== null) {
      if (
        !size ||
        typeof size !== 'object' ||
        Array.isArray(size) ||
        !uint(size.node) ||
        size.node <= row.node ||
        sizes.has(size.node) ||
        !uint(size.other_attributes) ||
        !uint(size.direct_children) ||
        row.error_name !== null ||
        ['width', 'height', 'width_relative_to', 'height_relative_to', 'protect'].some(
          (key) =>
            size[key] !== null &&
            (typeof size[key] !== 'string' || !size[key].isWellFormed() || size[key].length > 4096),
        )
      )
        return fail();
      sizes.add(size.node);
    }
  }
  return rows;
}
