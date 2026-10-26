/** Source declaration only; no physical page number or current paragraph flow. */
export function decodeHwp5PageSettings(bytes) {
  const row = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return validateHwp5PageSettings(row);
}
export function validateHwp5PageSettings(row) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (
    !row ||
    ![
      'source_node',
      'width',
      'height',
      'left',
      'right',
      'top',
      'bottom',
      'header',
      'footer',
      'gutter',
      'flags',
      'extra_bytes',
    ].every((name) => uint(row[name])) ||
    !['narrowly', 'widely'].includes(row.orientation) ||
    !['one_side', 'facing', 'top'].includes(row.binding)
  )
    throw new Error('InvalidHwp5PageSettings');
  if (
    row.orientation !== (row.flags & 1 ? 'widely' : 'narrowly') ||
    row.binding !== ['one_side', 'facing', 'top'][(row.flags >>> 1) & 3]
  )
    throw new Error('InvalidHwp5PageSettings');
  return row;
}
