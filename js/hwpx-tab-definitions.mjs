const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const raw = (value) =>
  value === null || (typeof value === 'string' && new TextEncoder().encode(value).length <= 4096);
export function validateTabDefinitions(rows) {
  if (!Array.isArray(rows)) throw new Error('InvalidTabDefinitions');
  let previous = -1,
    count = 0;
  for (const row of rows) {
    if (
      !object(row) ||
      !uint(row.id) ||
      row.id <= previous ||
      !raw(row.auto_left) ||
      !raw(row.auto_right) ||
      !Array.isArray(row.items)
    )
      throw new Error('InvalidTabDefinitions');
    previous = row.id;
    count += row.items.length;
    if (count > 1_000_000) throw new Error('InvalidTabDefinitions');
    for (const item of row.items)
      if (
        !object(item) ||
        !raw(item.pos) ||
        !raw(item.kind) ||
        !raw(item.leader) ||
        (Object.hasOwn(item, 'unit') && !raw(item.unit))
      )
        throw new Error('InvalidTabDefinitions');
  }
  return rows;
}
export function decodeTabDefinitions(bytes) {
  return validateTabDefinitions(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
