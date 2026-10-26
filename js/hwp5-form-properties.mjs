const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function validateHwp5FormProperties(rows) {
  const fail = () => {
    throw Error('InvalidHwp5FormProperties');
  };
  if (!Array.isArray(rows) || rows.length > 100000) fail();
  let totalUnits = 0,
    totalFields = 0;
  const controls = new Set(),
    objects = new Set();
  for (const row of rows) {
    if (
      !row ||
      !['control_node', 'object_node', 'known_nodes', 'deferred_nodes'].every((k) =>
        uint(row[k]),
      ) ||
      row.control_node >= row.object_node ||
      controls.has(row.control_node) ||
      objects.has(row.object_node) ||
      !Array.isArray(row.fields)
    )
      fail();
    const fields = new Set();
    for (const property of row.fields) {
      if (
        !property ||
        typeof property.field !== 'string' ||
        !/^[a-z][a-z0-9_]{0,63}$/.test(property.field) ||
        fields.has(property.field) ||
        !['wstring', 'integer', 'boolean'].includes(property.kind) ||
        !Array.isArray(property.units) ||
        property.units.length > 1000000 - totalUnits ||
        property.units.some((unit) => !Number.isInteger(unit) || unit < 0 || unit > 65535)
      )
        fail();
      totalUnits += property.units.length;
      totalFields++;
      fields.add(property.field);
      if (totalFields > 100000) fail();
    }
    if (row.fields.length > row.known_nodes) fail();
    controls.add(row.control_node);
    objects.add(row.object_node);
  }
  return rows;
}
export function decodeHwp5FormProperties(bytes) {
  return validateHwp5FormProperties(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
