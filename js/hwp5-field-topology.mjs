// Marker topology diagnostics only; these coordinates grant no edit permission.
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const position = (value) => value && uint(value.paragraph) && uint(value.unit);
const before = (lhs, rhs) =>
  lhs.paragraph < rhs.paragraph || (lhs.paragraph === rhs.paragraph && lhs.unit < rhs.unit);

export function validateHwp5FieldTopology(value) {
  const fail = () => {
    throw new Error('InvalidHwp5FieldTopology');
  };
  if (!value || !Array.isArray(value.spans) || !Array.isArray(value.unresolved)) fail();
  const starts = new Set();
  for (const row of value.spans) {
    if (
      !row ||
      !uint(row.field_id) ||
      !uint(row.ordinal) ||
      !position(row.begin) ||
      !position(row.end) ||
      before(row.end, row.begin)
    )
      fail();
    const key = row.begin.paragraph + ':' + row.ordinal;
    if (starts.has(key)) fail();
    starts.add(key);
  }
  let previous = null;
  for (const row of value.unresolved) {
    if (
      !row ||
      !position(row.position) ||
      !uint(row.marker_id) ||
      !(row.list_node === null || uint(row.list_node))
    )
      fail();
    if (previous && !before(previous, row.position)) fail();
    previous = row.position;
    if (row.kind === 'unclosed_start') {
      if (!uint(row.ordinal)) fail();
      const key = row.position.paragraph + ':' + row.ordinal;
      if (starts.has(key)) fail();
      starts.add(key);
    } else if (row.kind === 'orphan_end') {
      if (row.ordinal !== null) fail();
    } else fail();
  }
  return { spans: value.spans, unresolved: value.unresolved };
}

export function decodeHwp5FieldTopology(bytes) {
  return validateHwp5FieldTopology(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
