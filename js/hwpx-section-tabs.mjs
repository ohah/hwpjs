const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const raw = (value) =>
  value === null || (typeof value === 'string' && new TextEncoder().encode(value).length <= 4096);
export function validateSectionTabs(rows) {
  if (!Array.isArray(rows)) throw new Error('InvalidSectionTabSources');
  let previous = null;
  for (const row of rows) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      !uint(row.section) ||
      !uint(row.node) ||
      ![row.tab_stop, row.tab_stop_val, row.tab_stop_unit].every(raw) ||
      (Object.hasOwn(row, 'body_owner') &&
        row.body_owner !== null &&
        (!uint(row.body_owner) || row.body_owner >= row.node)) ||
      (previous &&
        (row.section < previous.section ||
          (row.section === previous.section && row.node <= previous.node)))
    )
      throw new Error('InvalidSectionTabSources');
    previous = row;
  }
  return rows;
}
export function decodeSectionTabs(bytes) {
  return validateSectionTabs(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
