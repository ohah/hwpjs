export function picturePrefixArg(prefix) {
  const value = ['base73', 'with_opacity74', 'with_instance78'].indexOf(prefix);
  if (value < 0) throw new Error('InvalidPicturePrefix');
  return value;
}
export function validateHwp5PictureSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const uint = (value) => integer(value, 0, 0xffffffff),
    signed = (value) => integer(value, -2147483648, 2147483647);
  const array = (value, length, valid) =>
    Array.isArray(value) && value.length === length && Array.from(value).every(valid);
  const optional = (value, valid) => value === null || valid(value);
  if (!Array.isArray(rows)) throw new Error('InvalidHwp5PictureSources');
  const components = new Set(),
    pictures = new Set();
  for (const row of rows) {
    if (
      !row ||
      ![
        'component_node',
        'owner_node',
        'picture_node',
        'border_color',
        'border_attributes',
        'extra_bytes',
      ].every((key) => uint(row[key])) ||
      row.owner_node >= row.component_node ||
      row.component_node >= row.picture_node ||
      components.has(row.component_node) ||
      pictures.has(row.picture_node) ||
      !signed(row.border_width) ||
      !array(row.points, 4, (point) => array(point, 2, signed)) ||
      !array(row.crop, 4, signed) ||
      !array(row.margins, 4, (value) => integer(value, -32768, 32767)) ||
      !integer(row.contrast, -128, 127) ||
      !integer(row.brightness, -128, 127) ||
      !integer(row.effect, 0, 255) ||
      !integer(row.bin_data_id, 0, 65535) ||
      !optional(row.border_opacity, (value) => integer(value, 0, 255)) ||
      !optional(row.instance_id, uint) ||
      (row.instance_id !== null && row.border_opacity === null)
    )
      throw new Error('InvalidHwp5PictureSources');
    components.add(row.component_node);
    pictures.add(row.picture_node);
  }
  return rows;
}
export function decodeHwp5PictureSources(bytes) {
  return validateHwp5PictureSources(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
